'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CURVE_AMPLITUDE, CURVE_BASE_RATE } from '@printpesa/shared/config';
import { cn } from '@/lib/cn';
import { api } from '@/lib/api/endpoints';
import { useGameSocket } from '@/lib/game/GameSocketProvider';
import { CurveCanvas } from '@/components/game/CurveCanvas';

const DEFAULT_TIMEFRAMES = [30, 60, 120, 300];
const labelFor = (s: number): string => (s % 60 === 0 ? `${s / 60}m` : `${s}s`);
const toValue = (rate: number) => (rate - CURVE_BASE_RATE) / CURVE_AMPLITUDE;

export function GameCurve() {
  const { getTicks, getLastTick, fairness } = useGameSocket();
  const { data: config } = useQuery({
    queryKey: ['gameConfig'],
    queryFn: api.gameConfig,
    staleTime: 5 * 60_000,
  });
  const timeframes = config?.timeframesS && config.timeframesS.length > 0 ? config.timeframesS : DEFAULT_TIMEFRAMES;
  const [tf, setTf] = useState<number>(timeframes[0] ?? 30);

  // Keep the live "Rate:" readout ticking without re-rendering the canvas loop.
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => (n + 1) % 1_000_000), 300);
    return () => clearInterval(id);
  }, []);

  const seedShort = useMemo(
    () => (fairness ? `${fairness.serverSeedHash.slice(0, 10)}…` : null),
    [fairness],
  );
  const last = getLastTick();
  const rateLabel = last ? toValue(last.rate).toFixed(4) : '—';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="no-scrollbar inline-flex overflow-x-auto rounded-xl border border-border bg-surface p-1">
          {timeframes.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setTf(s)}
              className={cn(
                'h-8 rounded-lg px-3 text-xs font-medium transition',
                tf === s ? 'bg-accent text-accent-fg' : 'text-muted hover:text-fg',
              )}
            >
              {labelFor(s)}
            </button>
          ))}
        </div>
        <span className="shrink-0 rounded-lg border border-accent/60 bg-accent/10 px-3 py-1.5 text-xs font-semibold tabular-nums text-accent">
          Rate: {rateLabel}
        </span>
      </div>

      <div className="relative h-60 w-full overflow-hidden rounded-xl bg-surface sm:h-80">
        <CurveCanvas getTicks={getTicks} getLastTick={getLastTick} windowMs={tf * 1000} />
      </div>

      {seedShort ? (
        <p className="text-center text-[11px] text-muted">
          Provably fair · seed {seedShort}
          {fairness?.tradeDate ? ` · ${fairness.tradeDate}` : ''}
        </p>
      ) : null}
    </div>
  );
}
