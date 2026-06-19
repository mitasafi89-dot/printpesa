import Link from 'next/link';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { AuthButtons } from '@/components/auth/AuthButtons';
import { BalancePill } from '@/components/wallet/BalancePill';

export function TopBar() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface/90 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-app items-center gap-2 px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand text-sm font-bold text-white">
            P
          </span>
          <span className="text-fg">PrintPesa</span>
        </Link>

        <div className="ml-auto flex items-center gap-2">
          <BalancePill />
          <div className="hidden sm:block">
            <ThemeToggle />
          </div>
          <AuthButtons />
        </div>
      </div>
    </header>
  );
}
