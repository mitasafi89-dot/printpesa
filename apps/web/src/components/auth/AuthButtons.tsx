'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAuthUi } from '@/lib/auth/ui';
import { useSession } from '@/lib/auth/session';
import { useAuthActions } from '@/lib/auth/useAuthActions';
import { useHydrated } from '@/lib/useHydrated';

export function AuthButtons() {
  const hydrated = useHydrated();
  const token = useSession((s) => s.token);
  const user = useSession((s) => s.user);
  const openAuth = useAuthUi((s) => s.openAuth);
  const { logout } = useAuthActions();

  // Match the server-rendered (logged-out) markup until mounted.
  if (!hydrated || !token) {
    return (
      <>
        <Button variant="outline" size="sm" onClick={() => openAuth('login')}>
          Login
        </Button>
        <Button variant="brand" size="sm" onClick={() => openAuth('register')}>
          Sign Up
        </Button>
      </>
    );
  }

  if (!user) return <Skeleton className="h-9 w-24" />;

  return (
    <div className="flex items-center gap-2">
      <Link
        href="/account"
        className="max-w-[8rem] truncate text-sm font-medium text-fg hover:text-accent"
        title={user.username}
      >
        @{user.username}
      </Link>
      <Button variant="secondary" size="sm" onClick={logout}>
        Log out
      </Button>
    </div>
  );
}
