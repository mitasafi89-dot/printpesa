import { GameSocketProvider } from '@/lib/game/GameSocketProvider';
import { GameCurve } from '@/components/game/GameCurve';
import { BetPanel } from '@/components/game/BetPanel';
import { EngagementPanel } from '@/components/engagement/EngagementPanel';

export default function GamePage() {
  return (
    <GameSocketProvider>
      <section className="flex flex-col gap-4 pb-44 md:pb-0">
        <GameCurve />
        {/* Mobile: sticky one-hand bet panel above the bottom nav. Desktop: inline below the curve. */}
        <div className="fixed inset-x-0 bottom-14 z-20 mx-auto w-full max-w-app px-4 md:static md:bottom-auto md:px-0">
          <BetPanel />
        </div>
        {/* Social & engagement (FE5): live activity feed + moderated chat. */}
        <EngagementPanel />
      </section>
    </GameSocketProvider>
  );
}
