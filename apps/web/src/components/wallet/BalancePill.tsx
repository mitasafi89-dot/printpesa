 'use client';

import Link from 'next/link';
import { Money } from '@/components/ui/Money';
import { useSession } from '@/lib/auth/session';
import { useHydrated } from '@/lib/useHydrated';
import { useWallet } from '@/lib/wallet/hooks';

export function BalancePill() {
  const hydrated = useHydrated();
  const token = useSession((s) => s.token);
  const { data } = useWallet();

  if (!hydrated || !token || !data) return null;

  return (
    <Link
      href="/wallet"
      className="hidden rounded-full border border-border bg-surface px-3 py-1.5 text-sm font-medium text-fg hover:border-accent sm:inline-block"
    >
      <Money cents={data.real} />
    </Link>
  );
}
