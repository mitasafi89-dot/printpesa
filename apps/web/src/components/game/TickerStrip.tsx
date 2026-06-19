'use client';

import { cn } from '@/lib/cn';

/**
 * Decorative market ticker (FE — design replica). Static placeholder symbols to
 * dress the trade screen like a live exchange. NOT real market data and NOT the
 * game outcome — the authoritative curve is the BTC/KES value above.
 */
interface Asset {
  sym: string;
  price?: string;
  pct?: number;
}

const ASSETS: Asset[] = [
  { sym: 'MATIC', price: '$0.71', pct: -0.0 },
  { sym: 'ATOM', price: '$1.01', pct: 0.61 },
  { sym: 'UNI', price: '$7.42', pct: 1.23 },
  { sym: 'BTC', price: '$64,210', pct: 0.42 },
  { sym: 'ETH', price: '$3,180', pct: -0.31 },
  { sym: 'SOL', price: '$148.30', pct: 2.1 },
  { sym: 'XRP', price: '$0.52', pct: -0.12 },
  { sym: 'DOGE', price: '$0.13', pct: 3.4 },
  { sym: 'ADA', price: '$0.45', pct: 0.08 },
];

function Pill({ a }: { a: Asset }) {
  const up = (a.pct ?? 0) >= 0;
  return (
    <div className="flex shrink-0 items-center gap-1.5 px-3 py-1.5 text-xs">
      <span className="font-semibold text-fg">{a.sym}</span>
      {a.price ? <span className="text-muted">{a.price}</span> : null}
      {a.pct !== undefined ? (
        <span className={cn('tabular-nums', up ? 'text-up' : 'text-down')}>
          {up ? '+' : ''}
          {a.pct.toFixed(2)}%
        </span>
      ) : null}
    </div>
  );
}

export function TickerStrip() {
  return (
    <div className="flex items-stretch overflow-hidden rounded-xl border border-border bg-surface" aria-hidden>
      <div className="flex shrink-0 items-center gap-1.5 border-r border-border bg-down/10 px-3 text-xs font-semibold text-down">
        <span className="h-1.5 w-1.5 rounded-full bg-down" />
        LIVE
      </div>
      <div className="relative flex-1 overflow-hidden">
        <div className="flex w-max animate-marquee">
          {[...ASSETS, ...ASSETS].map((a, i) => (
            <Pill key={`${a.sym}-${i}`} a={a} />
          ))}
        </div>
      </div>
    </div>
  );
}
