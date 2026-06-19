'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ActivityKind } from '@printpesa/shared';
import { api } from '@/lib/api/endpoints';
import { useGameSocket } from '@/lib/game/GameSocketProvider';
import type { ActivityItem } from '@/lib/game/engagement';
import { Money } from '@/components/ui/Money';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import { formatRelativeTime } from '@/lib/format';

const MAX_ROWS = 50;

const KIND_META: Record<ActivityKind, { icon: string; label: string; tone: string }> = {
  win: { icon: '🏆', label: 'won', tone: 'text-up' },
  withdrawal: { icon: '💸', label: 'withdrew', tone: 'text-fg' },
  bonus: { icon: '🎁', label: 'bonus', tone: 'text-accent' },
  signup: { icon: '✨', label: 'joined', tone: 'text-muted' },
};

function ActivityRow({ item }: { item: ActivityItem }) {
  const meta = KIND_META[item.kind] ?? { icon: '•', label: item.kind, tone: 'text-fg' };
  return (
    <li className="flex items-center gap-3 px-1 py-2">
      <span aria-hidden className="text-base leading-none">
        {meta.icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-fg">
          <span className="font-medium">{item.username}</span>{' '}
          <span className="text-muted">{meta.label}</span>
          {item.amountCents != null ? (
            <>
              {' '}
              <Money cents={item.amountCents} className={cn('font-semibold', meta.tone)} />
            </>
          ) : null}
        </p>
      </div>
      <time
        dateTime={new Date(item.ts).toISOString()}
        className="shrink-0 text-xs tabular-nums text-muted"
      >
        {formatRelativeTime(item.ts)}
      </time>
    </li>
  );
}

export function ActivityFeed() {
  const { activity, status } = useGameSocket();

  // REST backfill for SSR / first paint before the WS `activity_batch` arrives.
  const { data, isLoading } = useQuery({
    queryKey: ['activity'],
    queryFn: () => api.activity(MAX_ROWS),
    staleTime: 30_000,
  });

  const items = useMemo<ActivityItem[]>(() => {
    if (activity.length > 0) return activity;
    return data?.items ?? [];
  }, [activity, data]);

  if (items.length === 0 && (isLoading || status === 'connecting')) {
    return (
      <div className="flex flex-col gap-2" aria-busy>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-1 py-2">
            <Skeleton className="h-5 w-5 rounded-full" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-8" />
          </div>
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        title="No activity yet"
        description="Wins, withdrawals and new players will show up here live."
      />
    );
  }

  return (
    <ul
      className="flex flex-col divide-y divide-border"
      aria-live="polite"
      aria-label="Live activity feed"
    >
      {items.map((item, i) => (
        <ActivityRow key={`${item.ts}-${item.username}-${i}`} item={item} />
      ))}
    </ul>
  );
}
