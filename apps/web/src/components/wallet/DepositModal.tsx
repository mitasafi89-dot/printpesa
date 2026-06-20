'use client';

import { useEffect, useState } from 'react';
import { centsToKes, formatKes, kesToCents } from '@printpesa/shared/money';
import { normalizeMsisdn, MIN_DEPOSIT_CENTS } from '@printpesa/shared/payments';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useDeposit, useWallet } from '@/lib/wallet/hooks';
import { useDepositUi } from '@/lib/wallet/depositUi';
import { useSession } from '@/lib/auth/session';
import { authErrorMessage } from '@/lib/auth/errors';

/** Common top-up amounts (KES). One tap beats typing on mobile (NN/g: match input to data). */
const QUICK_KES = [100, 500, 1000, 5000] as const;
const MIN_KES = centsToKes(MIN_DEPOSIT_CENTS);

const digitsOnly = (s: string) => s.replace(/\D/g, '');
const grouped = (s: string) => (s ? Number(s).toLocaleString('en-KE') : '');

/** 254712345678 -> "0712 •••678" for at-a-glance confirmation without exposing the full number. */
function maskMsisdn(msisdn: string): string {
  const local = msisdn.startsWith('254') ? `0${msisdn.slice(3)}` : msisdn;
  return local.length >= 10 ? `${local.slice(0, 4)} •••${local.slice(-3)}` : local;
}

export function DepositModal() {
  const open = useDepositUi((s) => s.open);
  const close = useDepositUi((s) => s.close);
  const prefillAmountCents = useDepositUi((s) => s.prefillAmountCents);
  const pending = useDepositUi((s) => s.pending);

  const accountPhone = useSession((s) => s.user?.phone ?? null);
  const { data: wallet } = useWallet();
  const deposit = useDeposit();

  const [amount, setAmount] = useState(''); // whole KES as a digit string
  const [editingPhone, setEditingPhone] = useState(false);
  const [phone, setPhone] = useState('');
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Reset on each open; prefill the amount to cover an intended stake when provided.
  useEffect(() => {
    if (!open) return;
    setErrors({});
    setServerError(null);
    setDone(false);
    setEditingPhone(false);
    setPhone('');
    setAmount(prefillAmountCents && prefillAmountCents > 0 ? String(Math.ceil(centsToKes(prefillAmountCents))) : '200');
  }, [open, prefillAmountCents]);

  if (!open) return null;

  const intentLabel = pending ? (pending.direction === 'buy' ? 'BUY' : 'SELL') : null;
  // Use the account number by default; only fall back to a typed value if the user chose to change it.
  const effectivePhone = editingPhone || !accountPhone ? phone : accountPhone;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);
    const kes = Number(amount);
    const next: Record<string, string | undefined> = {};
    if (!Number.isInteger(kes) || kes < MIN_KES) next['amount'] = `Enter at least ${formatKes(MIN_DEPOSIT_CENTS)}.`;
    try {
      normalizeMsisdn(effectivePhone);
    } catch {
      next['phone'] = 'Enter a valid Kenyan number, e.g. 0712 345 678.';
    }
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    try {
      await deposit.mutateAsync({ amount: kesToCents(kes), phone: effectivePhone });
      setDone(true);
    } catch (err) {
      setServerError(authErrorMessage(err));
    }
  }

  return (
    <Modal open={open} onClose={close} title="Deposit">
      <Header title="Deposit via M-Pesa" onClose={close} />

      {done ? (
        // Live pending state: the STK push is out; the wallet poller settles the balance in-place.
        <div className="flex flex-col items-center gap-3 p-6 text-center">
          <Spinner />
          <h3 className="text-base font-semibold text-fg">Check your phone</h3>
          <p className="text-sm text-muted">
            We sent a prompt to <span className="font-medium text-fg">{maskMsisdn(normalizeMsisdn(effectivePhone))}</span>.
            Enter your M-Pesa PIN to approve {formatKes(kesToCents(Number(amount)))}.
          </p>
          <p className="text-xs text-muted">
            {intentLabel
              ? `Your balance updates automatically — your ${intentLabel} trade will be ready the moment it lands.`
              : 'This screen updates automatically once M-Pesa confirms — no need to refresh.'}
          </p>
          <Button fullWidth onClick={close}>Done</Button>
        </div>
      ) : (
        <form className="flex flex-col gap-4 p-4" onSubmit={onSubmit} noValidate>
          {/* Balance context keeps users oriented (NN/g: keep balance readily available). */}
          {wallet ? (
            <div className="flex flex-col items-center gap-0.5 rounded-2xl bg-surface-2 px-4 py-3 text-center">
              <span className="text-xs text-muted">Available balance</span>
              <span className="text-2xl font-extrabold tracking-tight text-accent">{formatKes(wallet.real + wallet.bonus)}</span>
            </div>
          ) : null}

          {/* Quick amounts */}
          <div className="flex gap-2 overflow-x-auto pb-0.5">
            {QUICK_KES.map((q) => {
              const active = Number(amount) === q;
              return (
                <button
                  key={q}
                  type="button"
                  onClick={() => { setAmount(String(q)); setErrors((p) => ({ ...p, amount: undefined })); }}
                  className={[
                    'shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition',
                    active ? 'border-accent bg-accent text-accent-fg' : 'border-border bg-surface-2 text-fg hover:border-accent/60',
                  ].join(' ')}
                >
                  {grouped(String(q))}
                </button>
              );
            })}
          </div>

          {/* Hero amount field: text + numeric inputmode (avoids number-spinner UX bugs) */}
          <Input
            label="Amount (KES)"
            name="amount"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            required
            leading={<span className="text-sm font-semibold text-muted">KES</span>}
            value={grouped(amount)}
            onChange={(e) => setAmount(digitsOnly(e.target.value))}
            error={errors['amount']}
            hint={`Minimum ${formatKes(MIN_DEPOSIT_CENTS)}`}
            className="text-lg font-semibold"
          />

          {/* M-Pesa number: prefilled from the account, read-only unless changed */}
          {accountPhone && !editingPhone ? (
            <div className="flex items-center justify-between rounded-xl border border-border bg-surface-2 px-3.5 py-3">
              <div>
                <div className="text-xs text-muted">M-Pesa number</div>
                <div className="text-sm font-medium text-fg">{maskMsisdn(accountPhone)}</div>
              </div>
              <button
                type="button"
                onClick={() => { setEditingPhone(true); setPhone(''); }}
                className="text-sm font-semibold text-accent hover:underline"
              >
                Change
              </button>
            </div>
          ) : (
            <Input
              label="M-Pesa number"
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              required
              placeholder="0712 345 678"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              error={errors['phone']}
              {...(accountPhone
                ? {
                    hint: 'Sending to a different number than your account.',
                  }
                : {})}
            />
          )}

          {serverError ? (
            <p className="rounded-xl border border-down/40 bg-down/10 px-3 py-2 text-sm text-down" role="alert">
              {serverError}
            </p>
          ) : null}

          <p className="text-xs leading-relaxed text-muted">
            You’ll get an STK push prompt on your phone — enter your M-Pesa PIN to confirm.
            Your PIN is never entered in this app.
          </p>
          <Button type="submit" size="lg" fullWidth disabled={deposit.isPending}>
            {deposit.isPending ? 'Sending STK push…' : 'Continue to M-Pesa'}
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

function Spinner() {
  return (
    <svg className="h-10 w-10 animate-spin text-accent" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
