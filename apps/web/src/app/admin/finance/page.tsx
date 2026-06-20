'use client';

import { useMemo, useState } from 'react';
import { Skeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { Money } from '@/components/ui/Money';
import { StatusBadge } from '@/components/ui/Badge';
import { formatRelativeTime } from '@/lib/format';
import { PageHeader, StatCard, Section, TableWrap, Th, Td, Empty, Toolbar, FilterSelect } from '@/components/admin/ui';
import { useDeposits, useDepositsReconcile } from '@/lib/admin/hooks';
import type { AdminDepositRow } from '@/lib/admin/types';

const STATUS_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'processing', label: 'Processing' },
  { value: 'success', label: 'Success' },
  { value: 'failed', label: 'Failed' },
];

const STALE_OPTIONS = [
  { value: '15', label: 'Stale > 15 min' },
  { value: '30', label: 'Stale > 30 min' },
  { value: '60', label: 'Stale > 60 min' },
];

/** Per-status tone for reconciliation tiles. */
function bucketTone(status: string): 'default' | 'up' | 'down' | 'warn' {
  const s = status.toLowerCase();
  if (s === 'success') return 'up';
  if (s === 'failed') return 'down';
  if (s === 'pending' || s === 'processing') return 'warn';
  return 'default';
}

export default function FinancePage() {
  const [staleMinutes, setStaleMinutes] = useState('15');
  const [status, setStatus] = useState('');

  const recon = useDepositsReconcile(Number(staleMinutes));
  const deposits = useDeposits(status || undefined);
  const rows = useMemo(() => deposits.data?.pages.flatMap((p) => p.items) ?? [], [deposits.data]);

  const summary = recon.data?.summary ?? [];
  const stale = recon.data?.stale ?? [];

  return (
    <>
      <PageHeader
        title="Finance"
        subtitle="Deposit reconciliation against M-Pesa. Stale STK pushes are non-terminal and may need manual reconciliation."
        actions={
          <Toolbar>
            <FilterSelect label="Window" value={staleMinutes} onChange={setStaleMinutes} options={STALE_OPTIONS} />
          </Toolbar>
        }
      />

      {/* Reconciliation summary — deposits grouped by status */}
      <Section title="Deposit reconciliation">
        {recon.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : recon.isError ? (
          <Empty title="Couldn't load reconciliation" description="Try again shortly." />
        ) : summary.length === 0 ? (
          <Empty title="No deposits yet" description="Reconciliation appears once deposits are recorded." />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {summary.map((b) => (
              <StatCard
                key={b.status}
                label={b.status}
                money={b.amountCents}
                hint={`${b.count} ${b.count === 1 ? 'deposit' : 'deposits'}`}
                tone={bucketTone(b.status)}
              />
            ))}
          </div>
        )}
      </Section>

      {/* Stale non-terminal deposits — the reconcile worklist */}
      <Section title={`Stale deposits${stale.length ? ` (${stale.length})` : ''}`}>
        {recon.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : stale.length === 0 ? (
          <Empty title="No stale deposits" description={`No pending or processing STK pushes older than ${staleMinutes} minutes.`} />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-warn">
            <TableWrap>
              <thead>
                <tr className="border-b border-border">
                  <Th>Player</Th>
                  <Th>Amount</Th>
                  <Th>Phone</Th>
                  <Th>Status</Th>
                  <Th>Checkout ID</Th>
                  <Th>Age</Th>
                </tr>
              </thead>
              <tbody>
                {stale.map((r) => (
                  <DepositRow key={r.txId} r={r} highlightAge />
                ))}
              </tbody>
            </TableWrap>
          </div>
        )}
      </Section>

      {/* Full deposit explorer */}
      <Section title="All deposits">
        <Toolbar>
          <FilterSelect label="Status" value={status} onChange={setStatus} options={STATUS_OPTIONS} />
        </Toolbar>
        {deposits.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : deposits.isError ? (
          <Empty title="Couldn't load deposits" description="Try again shortly." />
        ) : rows.length === 0 ? (
          <Empty title="No deposits" description="No deposits match this filter." />
        ) : (
          <>
            <TableWrap>
              <thead>
                <tr className="border-b border-border">
                  <Th>Player</Th>
                  <Th>Amount</Th>
                  <Th>Phone</Th>
                  <Th>Status</Th>
                  <Th>M-Pesa receipt</Th>
                  <Th>Created</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <DepositRow key={r.txId} r={r} />
                ))}
              </tbody>
            </TableWrap>
            {deposits.hasNextPage ? (
              <Button variant="outline" size="sm" onClick={() => deposits.fetchNextPage()} disabled={deposits.isFetchingNextPage}>
                {deposits.isFetchingNextPage ? 'Loading…' : 'Load more'}
              </Button>
            ) : null}
          </>
        )}
      </Section>
    </>
  );
}

function DepositRow({ r, highlightAge }: { r: AdminDepositRow; highlightAge?: boolean }) {
  return (
    <tr className="border-b border-border last:border-0">
      <Td className="font-mono text-xs text-muted">{r.userId.slice(0, 8)}…</Td>
      <Td className="font-medium tabular-nums">
        <Money cents={r.amountCents} />
      </Td>
      <Td className="tabular-nums">{r.phone}</Td>
      <Td>
        <StatusBadge status={r.status} />
      </Td>
      {highlightAge ? (
        <Td className="font-mono text-xs text-muted">{r.checkoutRequestId ?? '—'}</Td>
      ) : (
        <Td className="font-mono text-xs text-muted">{r.mpesaReceipt ?? '—'}</Td>
      )}
      <Td className={highlightAge ? 'whitespace-nowrap text-xs font-medium text-warn' : 'whitespace-nowrap text-xs text-muted'}>
        {formatRelativeTime(r.createdAtMs)} ago
      </Td>
    </tr>
  );
}
