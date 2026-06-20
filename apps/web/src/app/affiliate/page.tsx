'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/Badge';
import { Money } from '@/components/ui/Money';
import { ApiError } from '@/lib/api/client';
import type { AffiliateSummary } from '@/lib/api/types';
import { useSession } from '@/lib/auth/session';
import { useAuthUi } from '@/lib/auth/ui';
import { useAuthActions } from '@/lib/auth/useAuthActions';
import { useHydrated } from '@/lib/useHydrated';
import { useToast } from '@/lib/toast/ToastProvider';
import { formatDateTime } from '@/lib/format';
import {
  useAffiliateCommissions,
  useAffiliateEnroll,
  useAffiliatePayout,
  useAffiliateReferrals,
  useAffiliateSummary,
} from '@/lib/affiliate/hooks';

export default function AffiliatePage() {
  const hydrated = useHydrated();
  const token = useSession((s) => s.token);
  const user = useSession((s) => s.user);
  const openAuth = useAuthUi((s) => s.openAuth);

  if (!hydrated) return <Skeleton className="h-48 w-full" />;

  if (!token) {
    return (
      <EmptyState
        title="Earn with PrintPesa"
        description="Log in to join the affiliate programme and earn 20% revenue share from players you refer."
        action={<Button onClick={() => openAuth('login')}>Log in</Button>}
      />
    );
  }

  if (!user) return <Skeleton className="h-48 w-full" />;

  const isMarketer = user.role === 'marketer' || user.role === 'admin' || user.role === 'superadmin';

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Affiliate</h1>
        <p className="text-sm text-muted">Refer players, earn a share of the revenue.</p>
      </header>
      {isMarketer ? <Dashboard /> : <EnrollCard />}
    </section>
  );
}

function EnrollCard() {
  const token = useSession((s) => s.token);
  const { refresh } = useAuthActions();
  const toast = useToast();
  const enroll = useAffiliateEnroll();

  async function onEnroll() {
    try {
      await enroll.mutateAsync();
      if (token) await refresh(token); // promote role player -> marketer in session
      toast.push({ tone: 'success', title: "You're an affiliate", description: 'Share your link to start earning.' });
    } catch (e) {
      toast.push({
        tone: 'error',
        title: 'Could not enroll',
        description: e instanceof ApiError ? e.message : 'Please try again.',
      });
    }
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">Become an affiliate</h2>
        <p className="text-sm leading-relaxed text-muted">
          Get a personal referral link and earn <strong className="text-fg">20%</strong> of the net
          revenue from every player you bring to PrintPesa. Track referrals, watch commission accrue
          daily, and request payouts straight to M-Pesa.
        </p>
      </div>
      <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-muted">
        <li>20% lifetime revenue share, accrued daily.</li>
        <li>Live dashboard: referrals, turnover, commission, payouts.</li>
        <li>Payouts to your M-Pesa after admin approval.</li>
      </ul>
      <Button onClick={onEnroll} disabled={enroll.isPending} fullWidth>
        {enroll.isPending ? 'Enrolling…' : 'Become an affiliate'}
      </Button>
    </Card>
  );
}

function Dashboard() {
  const summaryQ = useAffiliateSummary(true);

  if (summaryQ.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (summaryQ.isError) {
    const notEnrolled = summaryQ.error instanceof ApiError && summaryQ.error.status === 404;
    return notEnrolled ? (
      <EnrollCard />
    ) : (
      <EmptyState
        title="Couldn't load your dashboard"
        description="Something went wrong fetching your affiliate data. Try again shortly."
      />
    );
  }

  const s = summaryQ.data!;
  return (
    <div className="flex flex-col gap-4">
      <ReferralLinkCard summary={s} />
      <StatGrid summary={s} />
      <PayoutCard summary={s} />
      <ReferralsList />
      <CommissionsList />
    </div>
  );
}

function ReferralLinkCard({ summary }: { summary: AffiliateSummary }) {
  const [origin, setOrigin] = useState('');
  const toast = useToast();
  useEffect(() => setOrigin(window.location.origin), []);
  const link = origin ? `${origin}${summary.referralPath}` : summary.referralPath;

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      toast.push({ tone: 'success', title: 'Link copied' });
    } catch {
      toast.push({ tone: 'error', title: 'Copy failed', description: 'Copy it manually.' });
    }
  }

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Your referral link</h2>
        <span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs font-medium text-accent">
          {Math.round(summary.commissionRate * 100)}% share
        </span>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <code className="min-w-0 flex-1 truncate rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm">
          {link}
        </code>
        <Button onClick={copy} variant="secondary" className="sm:w-auto" fullWidth>
          Copy link
        </Button>
      </div>
      <p className="text-xs text-muted">
        Code <span className="font-mono text-fg">{summary.referralCode}</span> · attribution is
        first-touch and permanent.
      </p>
    </Card>
  );
}

function StatGrid({ summary }: { summary: AffiliateSummary }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <Stat label="Referrals" value={String(summary.totalReferrals)} />
      <Stat label="Active (7d)" value={String(summary.activePlayers7d)} />
      <Stat label="Active (30d)" value={String(summary.activePlayers30d)} />
      <Stat label="Turnover" money={summary.turnoverCents} />
      <Stat label="Revenue (GGR)" money={summary.ggrCents} />
      <Stat label="Commission" money={summary.commissionAccruedCents} />
    </div>
  );
}

function Stat({ label, value, money }: { label: string; value?: string; money?: number }) {
  return (
    <Card className="flex flex-col gap-1 p-3">
      <span className="text-xs text-muted">{label}</span>
      <span className="text-lg font-semibold tabular-nums">
        {money !== undefined ? <Money cents={money} /> : value}
      </span>
    </Card>
  );
}

function PayoutCard({ summary }: { summary: AffiliateSummary }) {
  const payout = useAffiliatePayout();
  const toast = useToast();
  const canRequest = summary.availableCents > 0;

  async function request() {
    try {
      const r = await payout.mutateAsync();
      toast.push({
        tone: 'success',
        title: 'Payout requested',
        description: 'An admin will review and pay it to your M-Pesa.',
      });
      void r;
    } catch (e) {
      toast.push({
        tone: 'error',
        title: 'Payout failed',
        description: e instanceof ApiError ? e.message : 'Please try again.',
      });
    }
  }

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-xs text-muted">Available for payout</span>
          <span className="text-2xl font-semibold">
            <Money cents={summary.availableCents} />
          </span>
        </div>
        <Button onClick={request} disabled={!canRequest || payout.isPending}>
          {payout.isPending ? 'Requesting…' : 'Request payout'}
        </Button>
      </div>
      <p className="text-xs text-muted">
        Paid: <Money cents={summary.commissionPaidCents} /> · Accrued:{' '}
        <Money cents={summary.commissionAccruedCents} />.{' '}
        {canRequest ? 'Payouts go to your registered M-Pesa after admin approval.' : 'Earn commission to request a payout.'}
      </p>
    </Card>
  );
}

function ReferralsList() {
  const q = useAffiliateReferrals(true);
  const rows = useMemo(() => q.data?.pages.flatMap((p) => p.items) ?? [], [q.data]);

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold">Referred players</h2>
      {q.isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : rows.length === 0 ? (
        <EmptyState title="No referrals yet" description="Share your link to bring players on board." />
      ) : (
        <Card className="flex flex-col divide-y divide-border p-0">
          {rows.map((r) => (
            <div key={`${r.username}-${r.joinedAtMs}`} className="flex items-center justify-between gap-3 p-3">
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium">@{r.username}</span>
                <span className="text-xs text-muted">Joined {formatDateTime(r.joinedAtMs)}</span>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-sm font-medium">
                  <Money cents={r.lifetimeGgrCents} />
                </span>
                <span className="text-xs text-muted">lifetime revenue</span>
              </div>
            </div>
          ))}
        </Card>
      )}
      <LoadMore q={q} />
    </div>
  );
}

function CommissionsList() {
  const q = useAffiliateCommissions(true);
  const rows = useMemo(() => q.data?.pages.flatMap((p) => p.items) ?? [], [q.data]);

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold">Commission history</h2>
      {q.isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : rows.length === 0 ? (
        <EmptyState title="No commission yet" description="Daily commission appears here as your referrals play." />
      ) : (
        <Card className="flex flex-col divide-y divide-border p-0">
          {rows.map((c) => (
            <div key={c.period} className="flex items-center justify-between gap-3 p-3">
              <div className="flex flex-col">
                <span className="text-sm font-medium">{c.period}</span>
                <span className="text-xs text-muted">
                  GGR <Money cents={c.ggrCents} />
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium">
                  <Money cents={c.commissionCents} />
                </span>
                <StatusBadge status={c.status} />
              </div>
            </div>
          ))}
        </Card>
      )}
      <LoadMore q={q} />
    </div>
  );
}

function LoadMore({
  q,
}: {
  q: {
    hasNextPage: boolean;
    isFetchingNextPage: boolean;
    fetchNextPage: () => void;
  };
}) {
  if (!q.hasNextPage) return null;
  return (
    <Button variant="outline" size="sm" onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage}>
      {q.isFetchingNextPage ? 'Loading…' : 'Load more'}
    </Button>
  );
}
