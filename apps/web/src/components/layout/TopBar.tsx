import Link from 'next/link';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { AuthButtons } from '@/components/auth/AuthButtons';

export function TopBar() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-bg/90 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-app items-center gap-3 px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-accent shadow-glow" />
          PrintPesa
        </Link>

        <div className="ml-2 hidden items-center gap-2 text-sm text-muted sm:flex">
          <span className="font-medium text-fg">BTC/KES</span>
          <span className="text-up">live</span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <AuthButtons />
        </div>
      </div>
    </header>
  );
}
