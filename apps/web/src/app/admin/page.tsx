'use client';

import { Skeleton } from '@/components/ui/Skeleton';
import { Money } from '@/components/ui/Money';
import { PageHeader, StatCard, Section, TableWrap, Th, Td, Empty } from '@/components/admin/ui';
import { useOverview, useRtp } from '@/lib/admin/hooks';

export default function AdminOverviewPage() {
  const o = useOverview();
  const rtp = useRtp();

  return (
    <>
      <PageHeader title="Overview" subtitle="System health at a glance — users, finance, affiliate and game." />

      {o.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : o.isError || !o.data ? (
        <Empty title="Couldn't load overview" description="Check your connection and try again." />
      ) : (
        <>
          <Section title="Users">
            <div className="card-grid grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard label="Total users" value={o.data.users.total} hint={`${o.data.users.active} active`} />
              <StatCard label="Players" value={o.data.users.players} />
              <StatCard label="Marketers" value={o.data.users.marketers} />
              <StatCard
                label="Suspended / banned"
                value={`${o.data.users.suspended} / ${o.data.users.banned}`}
                tone={o.data.users.banned > 0 ? 'down' : 'default'}
              />
            </div>
          </Section>

          <Section title="Finance">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard label="Deposits" money={o.data.finance.depositsCents} />
              <StatCard label="Withdrawals" money={o.data.finance.withdrawalsCents} />
              <StatCard
                label="Pending withdrawals"
                value={o.data.finance.pendingWithdrawals}
                tone={o.data.finance.pendingWithdrawals > 0 ? 'warn' : 'default'}
                hint="awaiting review"
              />
              <StatCard label="Wallet liability" money={o.data.finance.walletLiabilityCents} hint="owed to players" />
            </div>
          </Section>

          <Section title="Affiliate & game">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard label="Commission accrued" money={o.data.affiliate.commissionAccruedCents} />
              <StatCard
                label="Pending payouts"
                value={o.data.affiliate.pendingPayouts}
                tone={o.data.affiliate.pendingPayouts > 0 ? 'warn' : 'default'}
              />
              <StatCard label="Net revenue (GGR)" money={o.data.game.ggrCents} tone="up" />
              <StatCard label="Turnover" money={o.data.game.turnoverCents} hint={`${o.data.game.settledPositions} trades`} />
            </div>
          </Section>
        </>
      )}

      <Section title="RTP monitor">
        {rtp.isLoading ? (
          <Skeleton className="h-28 w-full" />
        ) : rtp.isError || !rtp.data ? (
          <Empty title="RTP unavailable" />
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3 text-sm">
              <span className="text-muted">
                Target RTP <span className="font-medium text-fg">{pct(rtp.data.targetRtp)}</span> · tolerance ±
                {pct(rtp.data.toleranceAbs)}
              </span>
              <span
                className={
                  'rounded-full px-2 py-0.5 text-xs font-medium ' +
                  (rtp.data.alert ? 'bg-down/15 text-down' : 'bg-up/15 text-up')
                }
              >
                {rtp.data.alert ? 'Drift alert' : 'In tolerance'}
              </span>
            </div>
            <TableWrap>
              <thead>
                <tr className="border-b border-border">
                  <Th>Window</Th>
                  <Th>Trades</Th>
                  <Th>Turnover</Th>
                  <Th>Payout</Th>
                  <Th>Realised RTP</Th>
                </tr>
              </thead>
              <tbody>
                {rtp.data.windows.map((w) => {
                  const drift =
                    w.realisedRtp !== null && Math.abs(w.realisedRtp - rtp.data!.targetRtp) > rtp.data!.toleranceAbs;
                  return (
                    <tr key={w.window} className="border-b border-border last:border-0">
                      <Td className="font-medium capitalize">{w.window}</Td>
                      <Td className="tabular-nums">{w.settledPositions}</Td>
                      <Td className="tabular-nums">
                        <Money cents={w.turnoverCents} />
                      </Td>
                      <Td className="tabular-nums">
                        <Money cents={w.payoutCents} />
                      </Td>
                      <Td className={'tabular-nums font-medium ' + (drift ? 'text-down' : 'text-fg')}>
                        {w.realisedRtp === null ? '—' : pct(w.realisedRtp)}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </TableWrap>
            <p className="text-xs text-muted">
              Realised RTP is payout ÷ turnover per window. A window outside tolerance (with enough samples) flags an
              alert.
            </p>
          </div>
        )}
      </Section>
    </>
  );
}

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}
