import { GameSocketProvider } from '@/lib/game/GameSocketProvider';
import { PriceHeader } from '@/components/game/PriceHeader';
import { TickerStrip } from '@/components/game/TickerStrip';
import { GameCurve } from '@/components/game/GameCurve';
import { ActivityTicker } from '@/components/game/ActivityTicker';
import { BetPanel } from '@/components/game/BetPanel';
import { Feed } from '@/components/game/Feed';

export default function GamePage() {
  return (
    <GameSocketProvider>
      <section className="flex flex-col gap-3 pb-[21rem] md:pb-0">
        <PriceHeader />
        <TickerStrip />
        <GameCurve />
        {/*
          On mobile, dock the live-activity line + trade controls to the bottom of
          the screen so BUY/SELL and the activity are always visible. The dock is
          `fixed` (out of normal flow), so streaming activity/chat can never reflow
          it — that removes the up/down screen jitter — and the ActivityTicker lives
          inside the dock, so it is never hidden behind the panel while scrolling.
          On md+ both wrappers collapse to `display:contents`, restoring the original
          inline stacked layout (PriceHeader → … → ActivityTicker → BetPanel → Feed).
        */}
        <div
          data-testid="bet-panel-dock"
          className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 border-t border-border bg-bg pt-2 md:contents"
        >
          <div className="mx-auto flex w-full max-w-app flex-col gap-3 px-4 md:contents md:px-0">
            <ActivityTicker />
            <BetPanel />
          </div>
        </div>
        <Feed />
      </section>
    </GameSocketProvider>
  );
}
