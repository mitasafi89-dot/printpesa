 'use client';

import { Card } from '@/components/ui/Card';
import { Money } from '@/components/ui/Money';
import { Skeleton } from '@/components/ui/Skeleton';
import { useWallet } from '@/lib/wallet/hooks';

export function WalletWidget() {
  const { data, isLoading, isError } = useWallet();

  if (isLoading) return <Skeleton className="h-28 w-full rounded-2xl" />;
  if (isError || !data)
    return (
      <Card>
        <p className="text-sm text-down">Couldn&apos;t load your balance. Pull to refresh.</p>
      </Card>
    );

  return (
    <Card className="flex flex-col gap-3">
      <div>
        <p className="text-sm text-muted">Real balance</p>
        <Money cents={data.real} className="text-3xl font-semibold" />
      </div>
      <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
        <span className="text-muted">Bonus balance</span>
        <Money cents={data.bonus} className="font-medium" />
      </div>
    </Card>
  );
}
