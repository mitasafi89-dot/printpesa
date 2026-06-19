'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { centsToKes, formatKes, kesToCents } from '@printpesa/shared/money';
import type { Direction } from '@printpesa/shared';
import { cn } from '@/lib/cn';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Money } from '@/components/ui/Money';
import { Skeleton } from '@/components/ui/Skeleton';
import { api } from '@/lib/api/endpoints';
import { useSession } from '@/lib/auth/session';
import { useAuthUi } from '@/lib/auth/ui';
import { useWallet } from '@/lib/wallet/hooks';
import { useHydrated } from '@/lib/useHydrated';
import { useGameSocket } from '@/lib/game/GameSocketProvider';
import { LivePnl } from '@/components/game/LivePnl';

const CHIP_CENTS = [5000, 10000, 20000, 50000];
const DURATION_OPTIONS = [10, 30, 60, 120];
/** Stakes at/above this require a second confirming tap. */
const CONFIRM_CENTS = 50000;

export function BetPanel() {
  const hydrated = useHydrated();
  const token = useSession((s) => s.token);
  const user = useSession((s) => s.user);
  const openAuth = useAuthUi((s) => s.openAuth);
  const router = useRouter();

  const { data: config } = useQuery({
    queryKey: ['gameConfig'],
    queryFn: api.gameConfig,
    staleTime: 5 * 60_000,
  });
  const { data: wallet } = useWallet();
  const { status, activePosition, openPosition, sell } = useGameSocket();

  const minStakeCents = config?.minStakeCents ?? 5000;
  const maxStakeCents = config?.maxStakeCents;
  const defaultDurationS = config?.defaultDurationS ?? 10;

  const [stake, setStake] = useState<string>('');
  const [durationS, setDurationS] = useState<number>(defaultDurationS);
  const [armed, setArmed] = useState<Direction | null>(null);

  // Seed the stake field with the minimum once config arrives.
  useEffect(() => {
    if (config && stake === '') setStake(String(centsToKes(minStakeCents)));
  }, [config, minStakeCents, stake]);
  useEffect(() => {
    if (config) setDurationS((d) => (d === 10 && defaultDurationS !== 10 ? defaultDurationS : d));
  }, [config, defaultDurationS]);

  const durations = useMemo(
    () => Array.from(new Set([...DURATION_OPTIONS, defaultDurationS])).sort((a, b) => a - b),
    [defaultDurationS],
  );

  const stakeCents = useMemo(() => {
    const n = Number.parseFloat(stake);
    if (!Number.isFinite(n) || n <= 0) return NaN;
    return kesToCents(n);
  }, [stake]);

  const balanceReal = wallet?.real ?? 0;
  const validStake = Number.isInteger(stakeCents) && stakeCents >= minStakeCents;
  const overMax = maxStakeCents !== undefined && Number.isFinite(stakeCents) && stakeCents > maxStakeCents;
  const overBalance = !!token && Number.isFinite(stakeCents) && stakeCents > balanceReal;
  const connecting = status !== 'open';

  // Disarm any pending confirm when the stake changes.
  useEffect(() => setArmed(null), [stake]);

  const errorHint = (() => {
    if (!Number.isFinite(stakeCents)) return null;
    if (!validStake) return `Minimum stake is ${formatKes(minStakeCents)}.`;
    if (overMax && maxStakeCents !== undefined) return `Maximum stake is ${formatKes(maxStakeCents)}.`;
    if (overBalance) return 'Stake exceeds your balance.';
    return null;
  })();

  function chipActive(c: number): boolean {
    const n = Number.parseFloat(stake);
    return Number.isFinite(n) && kesToCents(n) === c;
  }

  function cycleDuration() {
    const i = durations.indexOf(durationS);
    setDurationS(durations[(i + 1) % durations.length] ?? durations[0]!);
  }

  function handleDirection(dir: Direction) {
    if (!token) {
      openAuth('login');
      return;
    }
    if (user && !user.ageVerified) {
      router.push('/account');
      return;
    }
    if (!validStake || overMax || overBalance) return;
    if (stakeCents >= CONFIRM_CENTS && armed !== dir) {
      setArmed(dir);
      return;
    }
    openPosition({ stakeCents, direction: dir, durationS });
    setArmed(null);
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (!hydrated || !config) {
    return (
      <Card className="flex flex-col gap-3 p-3">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-12 w-full" />
      </Card>
    );
  }

  // ── A position is in flight — live P&L + cash-out (single-open rule) ─────────
  if (activePosition) {
    const canCashOut =
      activePosition.phase === 'open' && activePosition.sellable && !!activePosition.positionId;
    return (
      <Card className="flex flex-col gap-3 p-3">
        <LivePnl pos={activePosition} />
        <Button variant="secondary" size="lg" fullWidth disabled={!canCashOut} onClick={sell}>
          {activePosition.phase === 'settling'
            ? 'Cashing out…'
            : canCashOut
              ? 'Cash Out'
              : 'Auto-sells at expiry'}
        </Button>
        <p className="text-center text-[11px] text-muted">
          Only winning positions can be cashed out early; losses settle at the timer.
        </p>
      </Card>
    );
  }

  const ageBlocked = !!token && !!user && !user.ageVerified;

  // ── Idle — stake + duration + BUY/SELL (always visible) ─────────────────────
  return (
    <Card className="flex flex-col gap-3 p-3">
      {/* Stake input with KES prefix */}
      <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-2 px-3">
        <span className="rounded-md bg-surface px-2 py-1 text-xs font-semibold text-muted">KES</span>
        <input
          inputMode="decimal"
          value={stake}
          onChange={(e) => setStake(e.target.value.replace(/[^0-9.]/g, ''))}
          placeholder="0"
          aria-label="Stake amount in KES"
          className="h-12 w-full bg-transparent text-2xl font-bold tabular-nums text-fg outline-none placeholder:text-muted"
        />
      </div>

      {/* Quick chips */}
      <div className="grid grid-cols-4 gap-2">
        {CHIP_CENTS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setStake(String(centsToKes(c)))}
            className={cn(
              'h-10 rounded-lg border text-sm font-semibold tabular-nums transition',
              chipActive(c)
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-border bg-surface-2 text-fg hover:border-accent/60',
            )}
          >
            {centsToKes(c)}
          </button>
        ))}
      </div>

      {errorHint ? <p className="text-xs text-down">{errorHint}</p> : null}

      {/* Auto-sell duration + idle Live P&L */}
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-2 px-3 py-2">
        <button type="button" onClick={cycleDuration} className="flex items-center gap-3" aria-label="Cycle trade duration">
          <span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-accent text-sm font-bold tabular-nums text-accent">
            {durationS}
          </span>
          <span className="flex flex-col text-left leading-tight">
            <span className="text-[10px] uppercase tracking-wide text-muted">Auto-sell</span>
            <span className="text-xs text-fg">Trade duration</span>
          </span>
        </button>
        <div className="flex flex-col items-end leading-tight">
          <span className="text-[10px] uppercase tracking-wide text-muted">Live P&amp;L</span>
          <Money cents={0} className="text-sm font-semibold text-fg" />
        </div>
      </div>

      {connecting ? (
        <p className="text-center text-xs text-muted">Connecting to the live market…</p>
      ) : null}

      {/* BUY / SELL */}
      <div className="grid grid-cols-2 gap-3">
        <Button variant="up" size="lg" fullWidth disabled={connecting} onClick={() => handleDirection('buy')}>
          {armed === 'buy' ? `Confirm · ${formatKes(stakeCents)}` : 'BUY'}
        </Button>
        <Button variant="down" size="lg" fullWidth disabled={connecting} onClick={() => handleDirection('sell')}>
          {armed === 'sell' ? `Confirm · ${formatKes(stakeCents)}` : 'SELL'}
        </Button>
      </div>

      {armed ? (
        <p className="text-center text-[11px] text-muted">Tap again to confirm your stake.</p>
      ) : ageBlocked ? (
        <p className="text-center text-[11px] text-warn">Verify your age (18+) in Profile to trade.</p>
      ) : !token ? (
        <p className="text-center text-[11px] text-muted">You&apos;ll be asked to log in to place a trade.</p>
      ) : null}
    </Card>
  );
}
