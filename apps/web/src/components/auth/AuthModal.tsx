'use client';

import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useAuthUi } from '@/lib/auth/ui';
import { useAuthActions } from '@/lib/auth/useAuthActions';
import { authErrorMessage } from '@/lib/auth/errors';
import {
  phoneError,
  usernameError,
  passwordError,
  referralError,
} from '@/lib/auth/validation';
import type { RegisterInput } from '@/lib/api/endpoints';

const REF_KEY = 'pp-ref';

export function AuthModal() {
  const { open, mode, openAuth, close } = useAuthUi();
  const { login, register } = useAuthActions();

  const [phone, setPhone] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [referral, setReferral] = useState('');
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
  }, [open, mode]);

  if (!open) return null;
  const isRegister = mode === 'register';

  function validate(): boolean {
    const next: Record<string, string | undefined> = { phone: phoneError(phone), password: passwordError(password) };
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
      <div className="flex items-center justify-between border-b border-border p-4">
        <h2 className="text-lg font-semibold">{isRegister ? 'Create your account' : 'Welcome back'}</h2>
        <Button variant="ghost" size="sm" aria-label="Close" onClick={close}>
          ✕
        </Button>
      </div>

      <form className="flex flex-col gap-3 p-4" onSubmit={onSubmit} noValidate>
        <Input
          label="Phone number"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="0712 345 678"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          error={errors['phone']}
        />

        {isRegister ? (
          <Input
            label="Username"
            name="username"
            autoComplete="username"
            placeholder="shown in chat & feed"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            error={errors['username']}
          />
        ) : null}

        <Input
          label="Password"
          name="password"
          type="password"
          autoComplete={isRegister ? 'new-password' : 'current-password'}
          placeholder={isRegister ? 'min 8 chars, 1 letter + 1 number' : '••••••••'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors['password']}
        />

        {isRegister ? (
          <Input
            label="Referral code (optional)"
            name="referral"
            placeholder="8-character code"
            value={referral}
            onChange={(e) => setReferral(e.target.value.toUpperCase())}
            error={errors['referral']}
          />
        ) : null}

        {serverError ? (
          <p className="rounded-xl border border-down/40 bg-down/10 px-3 py-2 text-sm text-down" role="alert">
            {serverError}
          </p>
        ) : null}

        <Button type="submit" size="lg" fullWidth disabled={busy}>
          {busy ? 'Please wait…' : isRegister ? 'Create account' : 'Log in'}
        </Button>

        <p className="pt-1 text-center text-sm text-muted">
          {isRegister ? 'Already have an account?' : 'New to PrintPesa?'}{' '}
          <button
            type="button"
            className="font-medium text-accent underline-offset-2 hover:underline"
            onClick={() => openAuth(isRegister ? 'login' : 'register')}
          >
            {isRegister ? 'Log in' : 'Create one'}
          </button>
        </p>

        <p className="pt-1 text-center text-xs text-muted">
          18+ only. Play responsibly.
        </p>
      </form>
    </Modal>
  );
}
