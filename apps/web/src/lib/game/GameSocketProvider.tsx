'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { formatKes } from '@printpesa/shared/money';
import { env } from '@/lib/env';
import { useSession } from '@/lib/auth/session';
import { useToast } from '@/lib/toast/ToastProvider';
import type { WalletDto } from '@/lib/api/types';
import type {
  ConnStatus,
  Envelope,
  FairnessData,
  HelloData,
  OnlineData,
  Tick,
} from '@/lib/game/types';
import type {
  ActivePosition,
  BalanceData,
  OpenPositionInput,
  PositionOpenedData,
  PositionSettledData,
  PositionUpdateData,
  WsErrorData,
} from '@/lib/game/betting';
import {
  isActivityItem,
  isChatErrorCode,
  isChatMessageItem,
  type ActivityItem,
  type ChatError,
  type ChatMessageItem,
} from '@/lib/game/engagement';

const MAX_TICKS = 3000;
const MAX_ACTIVITY = 50;
const MAX_CHAT = 100;

interface GameSocketValue {
  status: ConnStatus;
  online: number;
  fairness: FairnessData | null;
  getTicks: () => Tick[];
  getLastTick: () => Tick | null;
  /** The single in-flight position (optimistic → open → settling), or null. */
  activePosition: ActivePosition | null;
  /** Place a BUY/SELL position (optimistic; reconciled by `position_opened`). */
  openPosition: (input: OpenPositionInput) => void;
  /** Manually cash out the open position (only valid while `sellable`). */
  sell: () => void;
  /** Live activity feed, newest-first (capped at {@link MAX_ACTIVITY}). */
  activity: ActivityItem[];
  /** Chat messages in chronological order, oldest-first (capped at {@link MAX_CHAT}). */
  chat: ChatMessageItem[];
  /** Latest inline chat rejection (rate-limit / sanitizer), or null. */
  chatError: ChatError | null;
  /** Request a fresh chat backfill (`subscribe_chat` → `chat_batch`). */
  subscribeChat: () => void;
  /** Post a chat message (`send_chat`); the server echoes it back via `chat`. */
  sendChat: (message: string) => boolean;
}

const Ctx = createContext<GameSocketValue | null>(null);

function isTick(v: unknown): v is Tick {
  return (
    typeof v === 'object' && v !== null &&
    typeof (v as Tick).t === 'number' && typeof (v as Tick).rate === 'number'
  );
}

function errorTitle(code: string): string {
  switch (code) {
    case 'AUTH_REQUIRED':
      return 'Log in to trade';
    case 'AUTH_INVALID':
      return 'Session expired — log in again';
    case 'AGE_NOT_VERIFIED':
      return 'Verify your age to trade';
    case 'INSUFFICIENT_FUNDS':
      return 'Insufficient balance';
    default:
      return 'Trade rejected';
  }
}

export function GameSocketProvider({ children }: { children: React.ReactNode }) {
  const token = useSession((s) => s.token);
  const tokenRef = useRef<string | null>(token);
  tokenRef.current = token;

  const qc = useQueryClient();
  const toast = useToast();

  const ticksRef = useRef<Tick[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const closedRef = useRef(false);
  const attemptRef = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeat = useRef<ReturnType<typeof setInterval> | null>(null);
  const clientSeq = useRef(0);

  const [status, setStatus] = useState<ConnStatus>('connecting');
  const [online, setOnline] = useState(0);
  const [fairness, setFairness] = useState<FairnessData | null>(null);
  const [activePosition, setActivePosition] = useState<ActivePosition | null>(null);
  const activeRef = useRef<ActivePosition | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [chat, setChat] = useState<ChatMessageItem[]>([]);
  const [chatError, setChatError] = useState<ChatError | null>(null);
  const chatErrSeq = useRef(0);

  /** Keep ref + state in lockstep so socket handlers can read the current value. */
  const setActive = useCallback(
    (next: ActivePosition | null | ((cur: ActivePosition | null) => ActivePosition | null)) => {
      const resolved = typeof next === 'function' ? next(activeRef.current) : next;
      activeRef.current = resolved;
      setActivePosition(resolved);
    },
    [],
  );

  const getTicks = useCallback(() => ticksRef.current, []);
  const getLastTick = useCallback(
    () => (ticksRef.current.length > 0 ? ticksRef.current[ticksRef.current.length - 1]! : null),
    [],
  );

  const send = useCallback((type: string, data: unknown): boolean => {
    const ws = wsRef.current;
    if (ws && ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ type, data }));
      return true;
    }
    return false;
  }, []);

  const setWalletReal = useCallback(
    (real: number, currency?: string) => {
      qc.setQueryData<WalletDto>(['wallet'], (old) =>
        old ? { ...old, real } : { real, bonus: 0, currency: currency ?? 'KES' },
      );
    },
    [qc],
  );

  const openPosition = useCallback(
    (input: OpenPositionInput) => {
      if (activeRef.current) return; // single-open rule
      if (!tokenRef.current) {
        toast.push({ tone: 'error', title: 'Log in to trade' });
        return;
      }
      if (!send('open_position', input)) {
        toast.push({ tone: 'error', title: 'Not connected', description: 'Reconnecting — try again shortly.' });
        return;
      }
      const last = ticksRef.current[ticksRef.current.length - 1] ?? null;
      const now = Date.now();
      setActive({
        positionId: null,
        clientId: `c${++clientSeq.current}`,
        direction: input.direction,
        stakeCents: input.stakeCents,
        durationS: input.durationS,
        phase: 'pending',
        entryRate: last?.rate ?? null,
        expiresAtMs: now + input.durationS * 1000,
        liveMultiplier: 1,
        livePnlCents: 0,
        secondsLeft: input.durationS,
        sellable: false,
      });
      // Optimistic debit; reconciled by the authoritative `balance` push.
      qc.setQueryData<WalletDto>(['wallet'], (old) =>
        old ? { ...old, real: Math.max(0, old.real - input.stakeCents) } : old,
      );
    },
    [qc, send, setActive, toast],
  );

  const sell = useCallback(() => {
    const a = activeRef.current;
    if (!a || !a.positionId || a.phase !== 'open' || !a.sellable) return;
    if (!send('sell', { positionId: a.positionId })) {
      toast.push({ tone: 'error', title: 'Not connected', description: 'Reconnecting — your position auto-settles at expiry.' });
      return;
    }
    setActive({ ...a, phase: 'settling' });
  }, [send, setActive, toast]);

  const subscribeChat = useCallback(() => {
    send('subscribe_chat', {});
  }, [send]);

  const sendChat = useCallback(
    (message: string): boolean => {
      const text = message.trim();
      if (!text) return false;
      if (!tokenRef.current) {
        toast.push({ tone: 'error', title: 'Log in to chat' });
        return false;
      }
      if (!send('send_chat', { message: text })) {
        toast.push({
          tone: 'error',
          title: 'Not connected',
          description: 'Reconnecting — try again shortly.',
        });
        return false;
      }
      return true;
    },
    [send, toast],
  );

  useEffect(() => {
    closedRef.current = false;

    const clearTimers = () => {
      if (heartbeat.current) clearInterval(heartbeat.current);
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      heartbeat.current = null;
      reconnectTimer.current = null;
    };

    const pushTick = (t: Tick) => {
      const buf = ticksRef.current;
      buf.push(t);
      if (buf.length > MAX_TICKS) buf.splice(0, buf.length - MAX_TICKS);
    };

    const handle = (env_: Envelope) => {
      const data = env_.data;
      switch (env_.type) {
        case 'hello': {
          const d = data as HelloData;
          if (d?.serverSeedHash) setFairness({ serverSeedHash: d.serverSeedHash, tradeDate: d.tradeDate });
          break;
        }
        case 'tick': {
          if (isTick(data)) pushTick(data);
          break;
        }
        case 'tick_batch': {
          const items = (data as { ticks?: unknown[] })?.ticks ?? [];
          for (const it of items) if (isTick(it)) pushTick(it);
          break;
        }
        case 'online': {
          const d = data as OnlineData;
          if (typeof d?.count === 'number') setOnline(d.count);
          break;
        }
        case 'fairness': {
          const d = data as FairnessData;
          if (d?.serverSeedHash) setFairness({ serverSeedHash: d.serverSeedHash, tradeDate: d.tradeDate });
          break;
        }
        case 'balance': {
          const d = data as BalanceData;
          if (typeof d?.real === 'number') setWalletReal(d.real, d.currency);
          break;
        }
        case 'position_opened': {
          const d = data as PositionOpenedData;
          setActive((cur) => ({
            positionId: d.positionId,
            clientId: cur?.clientId ?? `srv${d.positionId}`,
            direction: d.direction,
            stakeCents: d.stakeCents,
            durationS: d.durationS,
            phase: 'open',
            entryRate: d.entryRate,
            expiresAtMs: d.expiresAtMs,
            liveMultiplier: cur?.liveMultiplier ?? 1,
            livePnlCents: cur?.livePnlCents ?? 0,
            secondsLeft: cur?.secondsLeft ?? d.durationS,
            sellable: cur?.sellable ?? false,
          }));
          toast.push({
            tone: 'info',
            title: `Opened · ${d.direction === 'buy' ? 'BUY' : 'SELL'} ${formatKes(d.stakeCents)}`,
            description: `Auto-sell in ${d.durationS}s`,
          });
          break;
        }
        case 'position_update': {
          const d = data as PositionUpdateData;
          setActive((cur) =>
            cur && cur.positionId === d.positionId
              ? {
                  ...cur,
                  phase: cur.phase === 'settling' ? 'settling' : 'open',
                  liveMultiplier: d.liveMultiplier,
                  livePnlCents: d.livePnlCents,
                  secondsLeft: d.secondsLeft,
                  sellable: d.sellable,
                }
              : cur,
          );
          break;
        }
        case 'position_settled': {
          const d = data as PositionSettledData;
          setActive((cur) => (cur && cur.positionId === d.positionId ? null : cur));
          if (typeof d.balance === 'number') setWalletReal(d.balance);
          void qc.invalidateQueries({ queryKey: ['positions'] });
          void qc.invalidateQueries({ queryKey: ['ledger'] });
          const won = d.result === 'win';
          toast.push({
            tone: won ? 'success' : 'error',
            title: won
              ? `Won ×${d.lockedMultiplier.toFixed(2)} · +${formatKes(d.payoutCents)}`
              : `Lost · ${formatKes(d.pnlCents)}`,
            description: d.mode === 'manual' ? 'Cashed out' : 'Auto-settled at expiry',
          });
          break;
        }
        case 'activity': {
          if (isActivityItem(data)) {
            const item = data;
            const sig = `${item.kind}|${item.username}|${item.amountCents}|${item.message}`;
            setActivity((cur) => {
              // Drop duplicate broadcasts (e.g. StrictMode double-socket or a re-emit).
              const head = cur[0];
              if (head && `${head.kind}|${head.username}|${head.amountCents}|${head.message}` === sig) {
                return cur;
              }
              return [item, ...cur].slice(0, MAX_ACTIVITY);
            });
          }
          break;
        }
        case 'activity_batch': {
          const items = (data as { items?: unknown[] })?.items ?? [];
          const valid = items.filter(isActivityItem);
          // Batch arrives oldest-first; present newest-first.
          setActivity(valid.reverse().slice(0, MAX_ACTIVITY));
          break;
        }
        case 'chat': {
          if (isChatMessageItem(data)) {
            const item = data;
            setChat((cur) => {
              if (cur.some((m) => m.id === item.id)) return cur;
              const next = [...cur, item];
              return next.length > MAX_CHAT ? next.slice(next.length - MAX_CHAT) : next;
            });
          }
          break;
        }
        case 'chat_batch': {
          const items = (data as { items?: unknown[] })?.items ?? [];
          const valid = items.filter(isChatMessageItem);
          // Batch arrives oldest-first; keep chronological for bottom-anchored chat.
          setChat(valid.slice(-MAX_CHAT));
          break;
        }
        case 'error': {
          const d = data as WsErrorData;
          // Chat rejections (rate-limit / sanitizer) surface inline, never as a trade toast.
          if (isChatErrorCode(d.code)) {
            setChatError({ code: d.code, reasons: d.reasons ?? [], nonce: ++chatErrSeq.current });
            break;
          }
          const a = activeRef.current;
          if (a && !a.positionId) {
            // optimistic open never acked → roll back and re-sync balance
            setActive(null);
            void qc.invalidateQueries({ queryKey: ['wallet'] });
          } else if (a && a.phase === 'settling') {
            // cash-out failed → restore so the user can retry / let it auto-settle
            setActive({ ...a, phase: 'open' });
          }
          toast.push({
            tone: 'error',
            title: errorTitle(d.code),
            description: d.reasons && d.reasons.length > 0 ? d.reasons.join(' · ') : d.message,
          });
          break;
        }
        default:
          break; // pong / unknown frames are ignored
      }
    };

    const connect = () => {
      if (closedRef.current) return;
      setStatus('connecting');
      let ws: WebSocket;
      try {
        ws = new WebSocket(env.wsUrl);
      } catch {
        scheduleReconnect();
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        attemptRef.current = 0;
        setStatus('open');
        if (tokenRef.current) ws.send(JSON.stringify({ type: 'auth', data: { token: tokenRef.current } }));
        heartbeat.current = setInterval(() => {
          if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: 'ping', data: {} }));
        }, 15_000);
      };

      ws.onmessage = (ev) => {
        let parsed: Envelope;
        try {
          parsed = JSON.parse(typeof ev.data === 'string' ? ev.data : '') as Envelope;
        } catch {
          return;
        }
        if (parsed && typeof parsed.type === 'string') handle(parsed);
      };

      ws.onclose = () => {
        if (heartbeat.current) clearInterval(heartbeat.current);
        heartbeat.current = null;
        if (!closedRef.current) {
          setStatus('closed');
          scheduleReconnect();
        }
      };

      ws.onerror = () => {
        try {
          ws.close();
        } catch {
          /* ignore */
        }
      };
    };

    const scheduleReconnect = () => {
      if (closedRef.current) return;
      const n = attemptRef.current++;
      const delay = Math.min(1000 * 2 ** n, 10_000) + Math.random() * 500;
      reconnectTimer.current = setTimeout(connect, delay);
    };

    connect();

    return () => {
      closedRef.current = true;
      clearTimers();
      const ws = wsRef.current;
      if (ws && (ws.readyState === ws.OPEN || ws.readyState === ws.CONNECTING)) ws.close();
      wsRef.current = null;
    };
    // socket lifecycle is mount-scoped; stable callbacks/refs are intentionally omitted
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Authenticate the live socket the moment a token becomes available post-connect.
  useEffect(() => {
    const ws = wsRef.current;
    if (token && ws && ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ type: 'auth', data: { token } }));
    }
  }, [token]);

  return (
    <Ctx.Provider
      value={{
        status,
        online,
        fairness,
        getTicks,
        getLastTick,
        activePosition,
        openPosition,
        sell,
        activity,
        chat,
        chatError,
        subscribeChat,
        sendChat,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useGameSocket(): GameSocketValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useGameSocket must be used within <GameSocketProvider>');
  return v;
}
