'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ActivityKind } from '@printpesa/shared';
import { api } from '@/lib/api/endpoints';
import { cn } from '@/lib/cn';
import { useGameSocket } from '@/lib/game/GameSocketProvider';
import type { ActivityItem } from '@/lib/game/engagement';

const DOT: Record<ActivityKind, string> = {
  win: 'bg-up',
  withdrawal: 'bg-accent',
  bonus: 'bg-warn',
  signup: 'bg-muted',
};

const EMOJI: Record<ActivityKind, string> = {
  win: '🏆',
  withdrawal: '💸',
  bonus: '🎁',
  signup: '✨',
};

const ROTATE_MS = 4000;
const MAX_CYCLE = 12;

/**
 * Single-line live activity ticker (design replica). Shows one event at a time,
 * rotating through the most recent ones; WS feed with a REST first-paint backfill.
 */
export function ActivityTicker() {
  const { activity } = useGameSocket();
  const { data } = useQuery({
    queryKey: ['activity'],
    queryFn: () => api.activity(30),
    staleTime: 30_000,
  });

  const items = useMemo<ActivityItem[]>(
    () => (activity.length > 0 ? activity : (data?.items ?? [])),
    [activity, data],
  );

  const newestTs = items.length > 0 ? items[0]!.ts : 0;
  const [idx, setIdx] = useState(0);

  // Snap back to the newest whenever a fresh event arrives.
  useEffect(() => setIdx(0), [newestTs]);

  useEffect(() => {
    if (items.length <= 1) return;
    const span = Math.min(items.length, MAX_CYCLE);
    const id = setInterval(() => setIdx((i) => (i + 1) % span), ROTATE_MS);
    return () => clearInterval(id);
  }, [items.length]);

  const cur = items[idx] ?? items[0] ?? null;

  return (
    <div
      className="flex h-9 items-center gap-2 overflow-hidden rounded-xl border border-border bg-surface px-3"
      aria-live="polite"
      aria-label="Live activity"
    >
      {cur ? (
        <>
          <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', DOT[cur.kind] ?? 'bg-muted')} />
          <span key={`${cur.ts}-${idx}`} className="truncate text-xs text-fg/90">
            <span aria-hidden className="mr-1">
              {EMOJI[cur.kind] ?? '•'}
            </span>
            {cur.message}
          </span>
        </>
      ) : (
        <span className="text-xs text-muted">Waiting for live activity…</span>
      )}
    </div>
  );
}
