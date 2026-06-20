'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { useSession } from '@/lib/auth/session';
import { useAuthUi } from '@/lib/auth/ui';
import { useAuthActions } from '@/lib/auth/useAuthActions';
import { useHydrated } from '@/lib/useHydrated';

type NavItem = { href: string; label: string; icon: React.ReactNode; superadmin?: boolean };

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d={d} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Nav grows as each admin feature ships (one entry per built route).
const NAV: NavItem[] = [
  { href: '/admin', label: 'Overview', icon: <Icon d="M3 13h8V3H3zM13 21h8V3h-8zM3 21h8v-6H3z" /> },
  { href: '/admin/withdrawals', label: 'Withdrawals', icon: <Icon d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" /> },
  { href: '/admin/users', label: 'Users', icon: <Icon d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM3 21a7 7 0 0118 0" /> },
  { href: '/admin/finance', label: 'Finance', icon: <Icon d="M3 6h18M3 12h18M3 18h18M7 3v18" /> },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const hydrated = useHydrated();
  const pathname = usePathname();
  const token = useSession((s) => s.token);
  const user = useSession((s) => s.user);
  const openAuth = useAuthUi((s) => s.openAuth);
  const { logout } = useAuthActions();

  if (!hydrated) {
    return (
      <div className="mx-auto w-full max-w-app p-4">
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!token) {
    return (
      <Gate
        title="Admin sign-in required"
        body="Log in with an administrator account to access the back office."
        action={<Button onClick={() => openAuth('login')}>Log in</Button>}
      />
    );
  }
  if (user && user.role !== 'admin' && user.role !== 'superadmin') {
    return (
      <Gate
        title="Not authorised"
        body="This area is for administrators only."
        action={
          <Link href="/">
            <Button variant="outline">Back to app</Button>
          </Link>
        }
      />
    );
  }

  const isSuper = user?.role === 'superadmin';
  const nav = NAV.filter((n) => !n.superadmin || isSuper);
  const active = (href: string) => (href === '/admin' ? pathname === '/admin' : pathname?.startsWith(href));

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      {/* Sidebar (desktop) / top bar + scroll nav (mobile) */}
      <aside className="flex shrink-0 flex-col border-b border-border bg-surface md:h-dvh md:w-60 md:border-b-0 md:border-r md:sticky md:top-0">
        <div className="flex items-center justify-between px-4 py-3">
          <Link href="/admin" className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-sm font-bold text-accent-fg">P</span>
            <span className="text-sm font-semibold tracking-tight">PrintPesa Admin</span>
          </Link>
        </div>
        <nav className="no-scrollbar flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:overflow-visible md:px-2">
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active(n.href) ? 'page' : undefined}
              className={cn(
                'flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition',
                active(n.href) ? 'bg-accent text-accent-fg' : 'text-muted hover:bg-surface-2 hover:text-fg',
              )}
            >
              {n.icon}
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto hidden flex-col gap-2 border-t border-border px-4 py-3 md:flex">
          <div className="flex flex-col">
            <span className="truncate text-sm font-medium">@{user?.username}</span>
            <span className="text-xs capitalize text-muted">{user?.role}</span>
          </div>
          <Button variant="secondary" size="sm" onClick={logout}>
            Log out
          </Button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-5 md:px-6">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">{children}</div>
      </main>
    </div>
  );
}

function Gate({ title, body, action }: { title: string; body: string; action: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      <p className="max-w-sm text-sm text-muted">{body}</p>
      {action}
    </div>
  );
}
