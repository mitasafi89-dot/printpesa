import * as React from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { BottomNav } from '@/components/layout/BottomNav';
import { AuthModal } from '@/components/auth/AuthModal';
import { SessionBootstrap } from '@/components/auth/SessionBootstrap';

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar />
      <main className="mx-auto w-full max-w-app flex-1 px-4 py-4 pb-24 md:pb-8">{children}</main>
      <BottomNav />
      <SessionBootstrap />
      <AuthModal />
    </div>
  );
}
