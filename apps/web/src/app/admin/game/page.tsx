'use client';

import { useEffect, useMemo, useState } from 'react';
import { Skeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { formatRelativeTime } from '@/lib/format';
import { ApiError } from '@/lib/api/client';
import { useToast } from '@/lib/toast/ToastProvider';
import { PageHeader, Section, TableWrap, Th, Td, Empty, ConfirmButton } from '@/components/admin/ui';
import { useGameConfig, useUpdateGameConfig, useSeeds, useRotateSeed } from '@/lib/admin/hooks';
import { SuperadminOnly } from '@/components/admin/SuperadminOnly';
import type { GameConfigPatch, GameConfigRow } from '@/lib/admin/types';

// Editable engine knobs. `kes` fields are stored as cents but edited in KES.
type FieldKey = keyof GameConfigPatch;
const FIELDS: { key: FieldKey; label: string; hint: string; kes?: boolean; step?: string }[] = [
  { key: 'houseEdge', label: 'House edge', hint: 'Fraction, e.g. 0.05 = 5%', step: '0.001' },
  { key: 'maxMultiplier', label: 'Max multiplier', hint: 'Hard cap on a round payout multiple', step: '0.1' },
  { key: 'minStakeCents', label: 'Min stake (KES)', hint: 'Smallest accepted stake', kes: true, step: '1' },
  { key: 'maxStakeCents', label: 'Max stake (KES)', hint: 'Largest accepted stake', kes: true, step: '1' },
  { key: 'defaultDurationS', label: 'Round duration (s)', hint: 'Default round length in seconds', step: '1' },
  { key: 'tickRateMs', label: 'Tick rate (ms)', hint: 'Price update interval', step: '10' },
  { key: 'driftBias', label: 'Drift bias', hint: 'Directional bias of the walk', step: '0.001' },
  { key: 'volatility', label: 'Volatility', hint: 'Amplitude of price movement', step: '0.001' },
];

/** Current config value formatted for its input (cents → KES for stake fields). */
function toField(cfg: GameConfigRow, f: (typeof FIELDS)[number]): string {
  const raw = cfg[f.key] as number;
  return f.kes ? String(raw / 100) : String(raw);
}

function GameBody() {
  const cfgQ = useGameConfig();
  const update = useUpdateGameConfig();
  const toast = useToast();
  const [form, setForm] = useState<Record<string, string>>({});

  // Hydrate the form once config arrives (and after a successful save).
  const cfg = cfgQ.data;
  useEffect(() => {
    if (cfg) setForm(Object.fromEntries(FIELDS.map((f) => [f.key, toField(cfg, f)])));
  }, [cfg]);

  // Only send fields the operator actually changed.
  const patch = useMemo<GameConfigPatch>(() => {
    if (!cfg) return {};
    const out: Record<string, number> = {};
    for (const f of FIELDS) {
      const cur = form[f.key];
      if (cur === undefined || cur === '') continue;
      const next = f.kes ? Math.round(Number(cur) * 100) : Number(cur);
      if (!Number.isFinite(next)) continue;
      if (next !== (cfg[f.key] as number)) out[f.key] = next;
    }
    return out as GameConfigPatch;
  }, [form, cfg]);

  const dirtyCount = Object.keys(patch).length;

  function save() {
    update.mutate(patch as Record<string, number>, {
      onSuccess: () => toast.push({ tone: 'success', title: 'Game config updated', description: `${dirtyCount} field(s) saved.` }),
      onError: (e) => toast.push({ tone: 'error', title: 'Update failed', description: e instanceof ApiError ? e.message : 'Try again.' }),
    });
  }

  return (
    <>
      <PageHeader
        title="Game configuration"
        subtitle="Live engine parameters. Changes take effect on the next round. RTP target is governed and read-only here."
      />

      <Section title="Engine parameters">
        {cfgQ.isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : cfgQ.isError || !cfg ? (
          <Empty title="Couldn't load game config" description="Try again shortly." />
        ) : (
          <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-muted">
              <span>
                RTP target: <span className="font-medium text-fg tabular-nums">{(cfg.rtpTarget * 100).toFixed(2)}%</span>
              </span>
              <span>
                Last updated:{' '}
                <span className="font-medium text-fg">
                  {cfg.updatedAtMs ? `${formatRelativeTime(cfg.updatedAtMs)} ago` : '—'}
                  {cfg.updatedBy ? ` by ${cfg.updatedBy.slice(0, 8)}…` : ''}
                </span>
              </span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {FIELDS.map((f) => (
                <Input
                  key={f.key}
                  type="number"
                  inputMode="decimal"
                  step={f.step}
                  label={f.label}
                  hint={f.hint}
                  value={form[f.key] ?? ''}
                  onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
                />
              ))}
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={save} disabled={dirtyCount === 0 || update.isPending}>
                {update.isPending ? 'Saving…' : dirtyCount > 0 ? `Save ${dirtyCount} change${dirtyCount > 1 ? 's' : ''}` : 'No changes'}
              </Button>
              {dirtyCount > 0 ? (
                <Button variant="ghost" onClick={() => cfg && setForm(Object.fromEntries(FIELDS.map((f) => [f.key, toField(cfg, f)])))}>
                  Reset
                </Button>
              ) : null}
            </div>
          </div>
        )}
      </Section>

      <SeedsSection />
    </>
  );
}

function SeedsSection() {
  const seedsQ = useSeeds();
  const rotate = useRotateSeed();
  const toast = useToast();
  const today = new Date().toISOString().slice(0, 10);
  const [tradeDate, setTradeDate] = useState(today);
  const rows = seedsQ.data?.items ?? [];

  function runRotate() {
    rotate.mutate(tradeDate, {
      onSuccess: (r) => toast.push({ tone: 'success', title: 'Seed rotated', description: `${r.tradeDate} now at version ${r.seedVersion}.` }),
      onError: (e) => toast.push({ tone: 'error', title: 'Rotate failed', description: e instanceof ApiError ? e.message : 'Try again.' }),
    });
  }

  return (
    <Section title="Provably-fair seeds">
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
        <p className="text-sm text-muted">
          Each trading day commits a hashed server seed, revealed after settlement. Rotate only if a seed is suspected compromised before reveal.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-44">
            <Input type="date" label="Trade date" value={tradeDate} onChange={(e) => setTradeDate(e.target.value)} />
          </div>
          <ConfirmButton
            label="Rotate seed"
            confirmLabel="Confirm rotate"
            variant="outline"
            busy={rotate.isPending}
            onConfirm={runRotate}
          />
        </div>
      </div>

      {seedsQ.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : rows.length === 0 ? (
        <Empty title="No seeds yet" description="Seeds appear once the first trading day is committed." />
      ) : (
        <TableWrap>
          <thead>
            <tr className="border-b border-border">
              <Th>Trade date</Th>
              <Th>Version</Th>
              <Th>Server seed hash</Th>
              <Th>Revealed</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={`${s.tradeDate}-${s.seedVersion}`} className="border-b border-border last:border-0">
                <Td className="whitespace-nowrap font-medium">{s.tradeDate}</Td>
                <Td className="tabular-nums">v{s.seedVersion}</Td>
                <Td className="max-w-[280px] truncate font-mono text-xs text-muted">{s.serverSeedHash ?? '—'}</Td>
                <Td className="text-xs">
                  {s.revealed ? (
                    <span className="text-up">Revealed{s.revealedAtMs ? ` ${formatRelativeTime(s.revealedAtMs)} ago` : ''}</span>
                  ) : (
                    <span className="text-warn">Committed</span>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
    </Section>
  );
}

export default function GamePage() {
  return (
    <SuperadminOnly>
      <GameBody />
    </SuperadminOnly>
  );
}
