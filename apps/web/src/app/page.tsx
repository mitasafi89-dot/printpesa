import { GameSocketProvider } from '@/lib/game/GameSocketProvider';
import { PriceHeader } from '@/components/game/PriceHeader';
import { TickerStrip } from '@/components/game/TickerStrip';
import { GameCurve } from '@/components/game/GameCurve';
import { BetPanel } from '@/components/game/BetPanel';
import { Feed } from '@/components/game/Feed';

export default function GamePage() {
  return (
    <GameSocketProvider>
      <section className="flex flex-col gap-3 pb-20 md:pb-0">
        <PriceHeader />
        <TickerStrip />
        <GameCurve />
        <BetPanel />
        <Feed />
      </section>
    </GameSocketProvider>
  );
}
