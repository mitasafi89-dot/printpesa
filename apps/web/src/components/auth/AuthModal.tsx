'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Logo } from '@/components/layout/Logo';
import { useAuthUi } from '@/lib/auth/ui';
import { useAuthActions } from '@/lib/auth/useAuthActions';
import { authErrorMessage } from '@/lib/auth/errors';
import { phoneError, usernameError, passwordError, referralError } from '@/lib/auth/validation';
import { REF_KEY } from '@/lib/auth/referral';
import { cn } from '@/lib/cn';
import type { RegisterInput } from '@/lib/api/endpoints';


/* ── inline field icons (currentColor, inherit the muted field colour) ───────── */
const ic = 'h-[18px] w-[18px]';
function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" className={ic} fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
      <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
      <line x1="10.5" y1="18.5" x2="13.5" y2="18.5" strokeLinecap="round" />
    </svg>
  );
}
function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" className={ic} fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" strokeLinecap="round" />
    </svg>
  );
}
function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" className={ic} fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
      <rect x="4.5" y="10" width="15" height="10" rx="2.5" />
      <path d="M8 10V7.5a4 4 0 0 1 8 0V10" />
    </svg>
  );
}
function TagIcon() {
  return (
    <svg viewBox="0 0 24 24" className={ic} fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
      <path d="M3.5 11.5 11 4h6.5A2.5 2.5 0 0 1 20 6.5V13l-7.5 7.5a2 2 0 0 1-2.8 0l-6.2-6.2a2 2 0 0 1 0-2.8Z" />
      <circle cx="15" cy="9" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}
function EyeIcon({ off }: { off?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={ic} fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
      {off ? <line x1="4" y1="4" x2="20" y2="20" strokeLinecap="round" /> : null}
    </svg>
  );
}
function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M12 3l7 3v5c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6l7-3Z" />
      <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function AuthModal() {
  const { open, mode, openAuth, close } = useAuthUi();
  const { login, register } = useAuthActions();

  const [phone, setPhone] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [referral, setReferral] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Prefill a referral code captured by the /r/[code] landing (FE6).
  useEffect(() => {
    if (!open) return;
    try {
      const stored = window.localStorage.getItem(REF_KEY);
      if (stored) setReferral(stored);
    } catch {
      /* ignore */
    }
  }, [open]);

  // Reset transient state whenever the modal is reopened or the mode flips.
  useEffect(() => {
    setErrors({});
    setServerError(null);
    setShowPw(false);
  }, [open, mode]);

  if (!open) return null;
  const isRegister = mode === 'register';

  function validate(): boolean {
    const next: Record<string, string | undefined> = {
      phone: phoneError(phone),
      password: passwordError(password),
    };
    if (isRegister) {
      next['username'] = usernameError(username);
      next['referral'] = referralError(referral);
    }
    setErrors(next);
    return !Object.values(next).some(Boolean);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);
    if (!validate()) return;
    setBusy(true);
    try {
      if (isRegister) {
        const body: RegisterInput = { phone, username, password };
        const code = referral.trim();
        if (code) body.referral_code = code.toUpperCase();
        await register(body);
        try {
          window.localStorage.removeItem(REF_KEY);
        } catch {
          /* ignore */
        }
      } else {
        await login(phone, password);
      }
      close();
    } catch (err) {
      setServerError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={close} title={isRegister ? 'Create your account' : 'Log in'}>
      {/* Brand accent rail */}
      <div className="h-1 w-full shrink-0 bg-gradient-to-r from-accent via-brand to-accent" />

      {/* Header */}
      <div className="relative flex flex-col items-center gap-3 px-6 pt-7 pb-5">
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full text-muted transition hover:bg-surface-2 hover:text-fg"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <line x1="6" y1="6" x2="18" y2="18" strokeLinecap="round" />
            <line x1="18" y1="6" x2="6" y2="18" strokeLinecap="round" />
          </svg>
        </button>
        <Logo />
        <div className="text-center">
          <h2 className="text-xl font-bold tracking-tight text-fg">
            {isRegister ? 'Create your account' : 'Welcome back'}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {isRegister
              ? 'Join in seconds and start trading the curve.'
              : 'Log in to pick up where you left off.'}
          </p>
        </div>
      </div>

      {/* Segmented mode switch */}
      <div className="px-6">
        <div className="flex rounded-xl border border-border bg-surface-2 p-1" role="tablist" aria-label="Auth mode">
          {(['login', 'register'] as const).map((m) => {
            const active = mode === m;
            return (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => openAuth(m)}
                className={cn(
                  'flex-1 rounded-lg py-2 text-sm font-semibold transition',
                  active ? 'bg-accent text-accent-fg shadow-sm' : 'text-muted hover:text-fg',
                )}
              >
                {m === 'login' ? 'Log in' : 'Sign up'}
              </button>
            );
          })}
        </div>
      </div>

      {/* Form */}
      <form className="flex flex-col gap-4 px-6 pt-5 pb-2" onSubmit={onSubmit} noValidate>
        <Input
          label="Phone number"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          required
          autoFocus
          placeholder="0712 345 678"
          leading={<PhoneIcon />}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          error={errors['phone']}
        />

        {isRegister ? (
          <Input
            label="Username"
            name="username"
            autoComplete="username"
            required
            placeholder="Shown in chat & the live feed"
            leading={<UserIcon />}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            error={errors['username']}
          />
        ) : null}

        <Input
          label="Password"
          name="password"
          type={showPw ? 'text' : 'password'}
          autoComplete={isRegister ? 'new-password' : 'current-password'}
          required
          placeholder={isRegister ? 'Min 8 chars, 1 letter + 1 number' : '••••••••'}
          leading={<LockIcon />}
          trailing={
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              aria-label={showPw ? 'Hide password' : 'Show password'}
              className="flex h-9 w-9 items-center justify-center rounded-lg transition hover:bg-border hover:text-fg"
            >
              <EyeIcon off={showPw} />
            </button>
          }
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors['password']}
        />

        {isRegister ? (
          <Input
            label="Referral code"
            name="referral"
            optional
            placeholder="8-character code"
            leading={<TagIcon />}
            value={referral}
            onChange={(e) => setReferral(e.target.value.toUpperCase())}
            error={errors['referral']}
          />
        ) : null}

        {serverError ? (
          <p
            className="flex items-start gap-2 rounded-xl border border-down/40 bg-down/10 px-3 py-2.5 text-sm text-down"
            role="alert"
          >
            <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <circle cx="12" cy="12" r="9" />
              <line x1="12" y1="8" x2="12" y2="13" strokeLinecap="round" />
              <circle cx="12" cy="16.5" r="0.5" fill="currentColor" />
            </svg>
            <span>{serverError}</span>
          </p>
        ) : null}

        <Button type="submit" size="lg" fullWidth disabled={busy} className="mt-1 font-semibold">
          {busy ? (
            <>
              <Spinner />
              Please wait…
            </>
          ) : isRegister ? (
            'Create account'
          ) : (
            'Log in'
          )}
        </Button>
      </form>

      {/* Trust + legal footer */}
      <div className="mt-1 flex flex-col gap-3 px-6 pb-7">
        <div className="flex items-center justify-center gap-1.5 text-xs font-medium text-up">
          <ShieldIcon />
          <span className="text-muted">Bank-grade encryption · M-Pesa secured</span>
        </div>
        <p className="text-center text-xs leading-relaxed text-muted">
          Play responsibly. By continuing you agree to our{' '}
          <Link href="/legal" onClick={close} className="font-medium text-accent underline-offset-2 hover:underline">
            Terms &amp; Responsible Gaming
          </Link>{' '}
          policy.
        </p>
      </div>
    </Modal>
  );
}
