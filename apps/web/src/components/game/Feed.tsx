
'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ActivityKind } from '@printpesa/shared';
import { api } from '@/lib/api/endpoints';
import { cn } from '@/lib/cn';
import { useSession } from '@/lib/auth/session';
import { useAuthUi } from '@/lib/auth/ui';
import { useGameSocket } from '@/lib/game/GameSocketProvider';
import type { ActivityItem, ChatMessageItem } from '@/lib/game/engagement';

const EMOJI: Record<ActivityKind, string> = {
  win: '🏆',
  withdrawal: '💸',
  bonus: '🎁',
  signup: '✨',
};

const MAX_LEN = 200;
const COOLDOWN_S = 3;

type Row =
  | { type: 'activity'; ts: number; key: string; item: ActivityItem }
  | { type: 'chat'; ts: number; key: string; item: ChatMessageItem };

/**
 * Combined live feed: activity events and player chat merged chronologically,
 * with a chat composer at the bottom. Auto-scrolls to newest content.
 */
export function Feed() {
  const { activity, chat, chatError, subscribeChat, sendChat } = useGameSocket();
  const token = useSession((s) => s.token);
  const openAuth = useAuthUi((s) => s.openAuth);

  const { data } = useQuery({
    queryKey: ['activity'],
    queryFn: () => api.activity(30),
    staleTime: 30_000,
  });

  // Pull a fresh chat backfill when the feed mounts.
  useEffect(() => {
    subscribeChat();
  }, [subscribeChat]);

  const acts = activity.length > 0 ? activity : (data?.items ?? []);

  const rows = useMemo<Row[]>(() => {
    const a: Row[] = acts.map((it, i) => ({ type: 'activity', ts: it.ts, key: `a${it.ts}-${i}`, item: it }));
    const c: Row[] = chat.map((it) => ({ type: 'chat', ts: it.ts, key: `c${it.id}`, item: it }));
    return [...a, ...c].sort((x, y) => x.ts - y.ts);
  }, [acts, chat]);

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [rows.length]);

  const [text, setText] = useState('');
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!token) {
      openAuth('login');
      return;
    }
    const t = text.trim();
    if (!t || cooldown > 0) return;
    if (sendChat(t)) {
      setText('');
      setCooldown(COOLDOWN_S);
    }
  }

  return (
    <div className="flex flex-col rounded-xl border border-border bg-surface">
      <div className="flex items-center gap-1.5 border-b border-border px-3 py-2 text-xs font-semibold text-fg">
        <span className="h-1.5 w-1.5 rounded-full bg-up" />
        Live activity &amp; chat
      </div>

      <div
        ref={scrollRef}
        className="flex max-h-56 min-h-[8rem] flex-col gap-1.5 overflow-y-auto px-3 py-2"
        aria-live="polite"
        aria-label="Live activity and chat"
      >
        {rows.length === 0 ? (
          <p className="text-xs text-muted">Waiting for live activity…</p>
        ) : (
          rows.map((r) =>
            r.type === 'activity' ? (
              <div key={r.key} className="flex items-start gap-2 text-xs text-fg/90">
                <span aria-hidden className="shrink-0">
                  {EMOJI[r.item.kind] ?? '•'}
                </span>
                <span className="leading-snug">{r.item.message}</span>
              </div>
            ) : (
              <div key={r.key} className="flex items-start gap-2 text-xs leading-snug">
                <span className="shrink-0 font-semibold text-accent">{r.item.username}</span>
                <span className="text-fg/90">{r.item.message}</span>
              </div>
            ),
          )
        )}
      </div>

      {chatError ? (
        <p className="px-3 pb-1 text-[11px] text-down">
          {chatError.code === 'RATE_LIMITED'
            ? 'Slow down — you’re chatting too fast.'
            : (chatError.reasons[0] ?? 'Message blocked.')}
        </p>
      ) : null}

      <form onSubmit={submit} className="flex items-center gap-2 border-t border-border p-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX_LEN))}
          placeholder={token ? (cooldown > 0 ? `Wait ${cooldown}s…` : 'Say something…') : 'Log in to chat'}
          aria-label="Chat message"
          className="h-9 w-full rounded-lg border border-border bg-surface-2 px-3 text-sm text-fg outline-none placeholder:text-muted focus:border-accent/60"
        />
        <button
          type="submit"
          disabled={cooldown > 0 || !text.trim()}
          className={cn(
            'h-9 shrink-0 rounded-lg px-4 text-sm font-semibold text-accent-fg transition',
            cooldown > 0 || !text.trim() ? 'bg-accent/50' : 'bg-accent hover:opacity-90',
          )}
        >
          Send
        </button>
      </form>
    </div>
  );
}
