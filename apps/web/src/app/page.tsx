import { GameSocketProvider } from '@/lib/game/GameSocketProvider';
import { PriceHeader } from '@/components/game/PriceHeader';
import { TickerStrip } from '@/components/game/TickerStrip';
import { GameCurve } from '@/components/game/GameCurve';
import { ActivityTicker } from '@/components/game/ActivityTicker';
import { BetPanel } from '@/components/game/BetPanel';

export default function GamePage() {
  return (
    <GameSocketProvider>
      <section className="flex flex-col gap-3 pb-72 md:pb-0">
        <PriceHeader />
        <TickerStrip />
        <GameCurve />
        <ActivityTicker />
        {/* Mobile: sticky bet panel above the bottom nav. Desktop: inline in flow. */}
        <div className="fixed inset-x-0 bottom-14 z-20 mx-auto w-full max-w-app px-4 md:static md:bottom-auto md:px-0">
          <BetPanel />
        </div>
      </section>
    </GameSocketProvider>
  );
}
