import { DEFAULT_CONFIG } from '@printpesa/shared/config';
import { formatKes } from '@printpesa/shared/money';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Money } from '@/components/ui/Money';

export default function GamePage() {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Live game</h1>
        <span className="rounded-full border border-border px-2.5 py-1 text-xs text-muted">Shell · FE0</span>
      </div>

      {/* Curve placeholder — the real CurveCanvas arrives in FE3. */}
      <Card className="relative h-56 overflow-hidden p-0 sm:h-72">
        <div className="absolute inset-0 bg-gradient-to-b from-up/10 to-down/10" />
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted">
          Live BTC/KES curve renders here (FE3)
        </div>
      </Card>

      {/* Bet panel placeholder — sticky bottom on mobile in FE4. */}
      <Card className="flex flex-col gap-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted">Min stake</span>
          <Money cents={DEFAULT_CONFIG.minStakeCents} className="font-medium" />
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted">Max payout</span>
          <span className="font-medium">×{DEFAULT_CONFIG.maxMultiplier.toFixed(1)}</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Button variant="up" size="lg" fullWidth disabled>BUY</Button>
          <Button variant="down" size="lg" fullWidth disabled>SELL</Button>
        </div>
        <p className="text-center text-xs text-muted">
          Trading wires up in FE4. Quick chips start at {formatKes(DEFAULT_CONFIG.minStakeCents)}.
        </p>
      </Card>
    </section>
  );
}
