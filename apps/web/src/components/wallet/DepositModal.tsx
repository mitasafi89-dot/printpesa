 'use client';

import { useState } from 'react';
import { kesToCents } from '@printpesa/shared/money';
import { normalizeMsisdn } from '@printpesa/shared/payments';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useDeposit } from '@/lib/wallet/hooks';
import { authErrorMessage } from '@/lib/auth/errors';

export function DepositModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const deposit = useDeposit();
  const [amount, setAmount] = useState('');
  const [phone, setPhone] = useState('');
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!open) return null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);
    const kes = Number(amount);
    const next: Record<string, string | undefined> = {};
    if (!Number.isInteger(kes) || kes < 1) next['amount'] = 'Enter a whole amount in KES (min 1).';
    try {
      normalizeMsisdn(phone);
    } catch {
      next['phone'] = 'Enter a valid Kenyan number, e.g. 0712 345 678.';
    }
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    try {
      await deposit.mutateAsync({ amount: kesToCents(kes), phone });
      setDone(true);
    } catch (err) {
      setServerError(authErrorMessage(err));
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Deposit">
      <Header title="Deposit via M-Pesa" onClose={onClose} />
      {done ? (
        <div className="flex flex-col gap-3 p-4">
          <p className="rounded-xl border border-up/40 bg-up/10 px-3 py-2 text-sm text-up">
            STK push sent. Check your phone and enter your M-Pesa PIN to complete the deposit.
          </p>
          <p className="text-xs text-muted">Your balance updates automatically once M-Pesa confirms.</p>
          <Button fullWidth onClick={onClose}>Done</Button>
        </div>
      ) : (
        <form className="flex flex-col gap-3 p-4" onSubmit={onSubmit} noValidate>
          <Input
            label="Amount (KES)"
            name="amount"
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            error={errors['amount']}
          />
          <Input
            label="M-Pesa phone"
            name="phone"
            type="tel"
            inputMode="tel"
            placeholder="0712 345 678"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            error={errors['phone']}
          />
          {serverError ? (
            <p className="rounded-xl border border-down/40 bg-down/10 px-3 py-2 text-sm text-down" role="alert">
              {serverError}
            </p>
          ) : null}
          <Button type="submit" size="lg" fullWidth disabled={deposit.isPending}>
            {deposit.isPending ? 'Sending STK push…' : 'Deposit'}
          </Button>
        </form>
      )}
    </Modal>
  );
}

function Header({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between border-b border-border p-4">
      <h2 className="text-lg font-semibold">{title}</h2>
      <Button variant="ghost" size="sm" aria-label="Close" onClick={onClose}>
        ✕
      </Button>
    </div>
  );
}
