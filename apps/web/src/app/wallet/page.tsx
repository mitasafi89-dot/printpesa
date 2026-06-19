 'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { WalletWidget } from '@/components/wallet/WalletWidget';
import { DepositModal } from '@/components/wallet/DepositModal';
import { WithdrawModal } from '@/components/wallet/WithdrawModal';
import { HistoryTabs } from '@/components/wallet/HistoryTabs';
import { useSession } from '@/lib/auth/session';
import { useAuthUi } from '@/lib/auth/ui';
import { useHydrated } from '@/lib/useHydrated';

export default function WalletPage() {
  const hydrated = useHydrated();
  const token = useSession((s) => s.token);
  const openAuth = useAuthUi((s) => s.openAuth);
  const [modal, setModal] = useState<'deposit' | 'withdraw' | null>(null);

  if (!hydrated) return <Skeleton className="h-48 w-full" />;

  if (!token) {
    return (
      <EmptyState
        title="Sign in to view your wallet"
        description="Log in to deposit, withdraw, and see your transaction history."
        action={<Button onClick={() => openAuth('login')}>Log in</Button>}
      />
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold tracking-tight">Wallet</h1>

      <WalletWidget />

      <div className="grid grid-cols-2 gap-3">
        <Button size="lg" onClick={() => setModal('deposit')}>Deposit</Button>
        <Button size="lg" variant="secondary" onClick={() => setModal('withdraw')}>Withdraw</Button>
      </div>

      <h2 className="mt-2 text-base font-semibold">History</h2>
      <HistoryTabs />

      <DepositModal open={modal === 'deposit'} onClose={() => setModal(null)} />
      <WithdrawModal open={modal === 'withdraw'} onClose={() => setModal(null)} />
    </section>
  );
}
