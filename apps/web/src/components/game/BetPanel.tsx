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

function durationLabel(s: number): string {
  return s % 60 === 0 ? `${s / 60}m` : `${s}s`;
}

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
  const maxMultiplier = config?.maxMultiplier ?? 5;
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
  const canTrade = validStake && !overMax && !overBalance && status === 'open';

  // Disarm any pending confirm when the stake changes.
  useEffect(() => setArmed(null), [stake]);

  const errorHint = (() => {
    if (!Number.isFinite(stakeCents)) return null;
    if (!validStake) return `Minimum stake is ${formatKes(minStakeCents)}.`;
    if (overMax && maxStakeCents !== undefined) return `Maximum stake is ${formatKes(maxStakeCents)}.`;
    if (overBalance) return 'Stake exceeds your balance.';
    return null;
  })();

  function handleDirection(dir: Direction) {
    if (!canTrade) return;
    if (stakeCents >= CONFIRM_CENTS && armed !== dir) {
      setArmed(dir);
      return;
    }
    openPosition({ stakeCents, direction: dir, durationS });
    setArmed(null);
  }

  // ── Render branches ────────────────────────────────────────────────
  if (!hydrated || !config) {
    return (
      <Card className="flex flex-col gap-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-12 w-full" />
      </Card>
    );
  }

  const headerRow = (
    <div className="flex items-center justify-between text-xs text-muted">
      <span>
        Min <Money cents={minStakeCents} className="text-fg" />
      </span>
      <span>
        Max payout <span className="font-medium text-fg">×{maxMultiplier.toFixed(1)}</span>
      </span>
    </div>
  );

  // 1) A position is in flight — show live P&L + cash-out (single-open rule).
  if (activePosition) {
    const canCashOut =
      activePosition.phase === 'open' && activePosition.sellable && !!activePosition.positionId;
    return (
      <Card className="flex flex-col gap-3">
        <LivePnl pos={activePosition} />
        <Button
          variant="secondary"
          size="lg"
          fullWidth
          disabled={!canCashOut}
          onClick={sell}
        >
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

  // 2) Logged out — gate to auth.
  if (!token) {
    return (
      <Card className="flex flex-col gap-3">
        {headerRow}
        <Button variant="primary" size="lg" fullWidth onClick={() => openAuth('login')}>
          Log in to trade
        </Button>
      </Card>
    );
  }

  // 3) Logged in but age not verified — gate to profile.
  if (user && !user.ageVerified) {
    return (
      <Card className="flex flex-col gap-3">
        {headerRow}
        <p className="text-sm text-muted">Verify your age (18+) to start trading.</p>
        <Button variant="primary" size="lg" fullWidth onClick={() => router.push('/account')}>
          Verify age
        </Button>
      </Card>
    );
  }

  // 4) Ready to trade.
  return (
    <Card className="flex flex-col gap-3">
      {headerRow}

      <div className="flex flex-col gap-1">
        <label htmlFor="stake" className="text-xs text-muted">
          Stake (KES)
        </label>
        <input
          id="stake"
          inputMode="decimal"
          value={stake}
          onChange={(e) => setStake(e.target.value.replace(/[^0-9.]/g, ''))}
          className={cn(
            'h-11 w-full rounded-xl border bg-surface-2 px-3 text-base tabular-nums text-fg outline-none',
            'focus-visible:ring-2 focus-visible:ring-accent',
            errorHint ? 'border-down' : 'border-border',
          )}
          placeholder={String(centsToKes(minStakeCents))}
        />
        <div className="grid grid-cols-4 gap-2">
          {CHIP_CENTS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setStake(String(centsToKes(c)))}
              className={cn(
                'h-9 rounded-lg border text-xs font-medium transition',
                stakeCents === c
                  ? 'border-accent bg-accent/10 text-fg'
                  : 'border-border bg-surface text-muted hover:text-fg',
              )}
            >
              {centsToKes(c).toLocaleString('en-KE')}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted">Auto-sell timer</span>
        <div className="inline-flex w-full rounded-xl border border-border bg-surface p-1">
          {durations.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setDurationS(s)}
              className={cn(
                'h-8 flex-1 rounded-lg text-xs font-medium transition',
                durationS === s ? 'bg-accent text-accent-fg' : 'text-muted hover:text-fg',
              )}
            >
              {durationLabel(s)}
            </button>
          ))}
        </div>
      </div>

      {errorHint ? <p className="text-xs text-down">{errorHint}</p> : null}
      {status !== 'open' ? (
        <p className="text-xs text-muted">Connecting to the live market…</p>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <Button
          variant="up"
          size="lg"
          fullWidth
          disabled={!canTrade}
          onClick={() => handleDirection('buy')}
        >
          {armed === 'buy' ? `Confirm · ${formatKes(stakeCents)}` : 'BUY'}
        </Button>
        <Button
          variant="down"
          size="lg"
          fullWidth
          disabled={!canTrade}
          onClick={() => handleDirection('sell')}
        >
          {armed === 'sell' ? `Confirm · ${formatKes(stakeCents)}` : 'SELL'}
        </Button>
      </div>
      {armed ? (
        <p className="text-center text-[11px] text-muted">Tap again to confirm your stake.</p>
      ) : null}
    </Card>
  );
}
