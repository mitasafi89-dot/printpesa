'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/cn';
import { ActivityFeed } from '@/components/engagement/ActivityFeed';
import { Chat } from '@/components/engagement/Chat';

type Tab = 'activity' | 'chat';

/**
 * Social & engagement surface (FE5). Mobile-first: a segmented [Activity | Chat]
 * tab below the curve showing one pane at a time. At `lg` the tabs disappear and
 * both panes sit side-by-side as a right rail (the desktop spec layout).
 */
export function EngagementPanel() {
  const [tab, setTab] = useState<Tab>('activity');

  return (
    <section aria-label="Activity and chat" className="flex flex-col gap-3">
      {/* Mobile/tablet: segmented tab switcher (hidden once both panes show at lg). */}
      <div className="inline-flex rounded-xl border border-border bg-surface p-1 lg:hidden" role="tablist">
        <TabButton active={tab === 'activity'} onClick={() => setTab('activity')} controls="pane-activity">
          Activity
        </TabButton>
        <TabButton active={tab === 'chat'} onClick={() => setTab('chat')} controls="pane-chat">
          Chat
        </TabButton>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-4">
        <Card
          id="pane-activity"
          role="tabpanel"
          className={cn('p-2 sm:p-3', tab === 'activity' ? 'block' : 'hidden', 'lg:block')}
        >
          <h2 className="px-1 pb-1 text-sm font-semibold text-fg">Live activity</h2>
          <ActivityFeed />
        </Card>

        <Card
          id="pane-chat"
          role="tabpanel"
          className={cn(
            'flex h-[28rem] flex-col p-2 sm:p-3 lg:h-[32rem]',
            tab === 'chat' ? 'flex' : 'hidden',
            'lg:flex',
          )}
        >
          <h2 className="px-1 pb-1 text-sm font-semibold text-fg">Chat</h2>
          <div className="min-h-0 flex-1">
            <Chat />
          </div>
        </Card>
      </div>
    </section>
  );
}

function TabButton({
  active,
  onClick,
  controls,
  children,
}: {
  active: boolean;
  onClick: () => void;
  controls: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      aria-controls={controls}
      onClick={onClick}
      className={cn(
        'h-9 flex-1 rounded-lg px-4 text-sm font-medium transition',
        active ? 'bg-accent text-accent-fg' : 'text-muted hover:text-fg',
      )}
    >
      {children}
    </button>
  );
}
