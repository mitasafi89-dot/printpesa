'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useSession } from '@/lib/auth/session';
import { useAuthUi } from '@/lib/auth/ui';
import { useAuthActions } from '@/lib/auth/useAuthActions';
import { useHydrated } from '@/lib/useHydrated';
import { authErrorMessage } from '@/lib/auth/errors';
import { fullNameError, dobError } from '@/lib/auth/validation';

function KycForm() {
  const token = useSession((s) => s.token);
  const { updateProfile } = useAuthActions();
  const [fullName, setFullName] = useState('');
  const [dob, setDob] = useState('');
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);
    const next: Record<string, string | undefined> = { fullName: fullNameError(fullName), dob: dobError(dob) };
    setErrors(next);
    if (next['fullName'] || next['dob'] || !token) return;
    setBusy(true);
    try {
      await updateProfile(token, { full_name: fullName, date_of_birth: dob });
    } catch (err) {
      setServerError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={onSubmit} noValidate>
      <Input
        label="Full name"
        name="full_name"
        autoComplete="name"
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        error={errors['fullName']}
      />
      <Input
        label="Date of birth"
        name="date_of_birth"
        type="date"
        value={dob}
        onChange={(e) => setDob(e.target.value)}
        error={errors['dob']}
        hint="You must be 18 or older. This can't be changed once saved."
      />
      {serverError ? (
        <p className="rounded-xl border border-down/40 bg-down/10 px-3 py-2 text-sm text-down" role="alert">
          {serverError}
        </p>
      ) : null}
      <Button type="submit" disabled={busy}>
        {busy ? 'Saving…' : 'Save & verify age'}
      </Button>
    </form>
  );
}

export default function AccountPage() {
  const hydrated = useHydrated();
  const token = useSession((s) => s.token);
  const user = useSession((s) => s.user);
  const openAuth = useAuthUi((s) => s.openAuth);
  const { logout } = useAuthActions();

  if (!hydrated) return <Skeleton className="h-48 w-full" />;

  if (!token) {
    return (
      <EmptyState
        title="Sign in to view your account"
        description="Log in or create an account to manage your profile and complete age verification."
        action={<Button onClick={() => openAuth('login')}>Log in</Button>}
      />
    );
  }

  if (!user) return <Skeleton className="h-48 w-full" />;

  const dobLocked = Boolean(user.dateOfBirth);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Account</h1>
        <Button variant="secondary" size="sm" onClick={logout}>
          Log out
        </Button>
      </div>

      <Card className="flex flex-col gap-3">
        <Row label="Username" value={`@${user.username}`} />
        <Row label="Role" value={user.role} />
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted">Age verification</span>
          {user.ageVerified ? (
            <span className="rounded-full bg-up/15 px-2.5 py-1 text-xs font-medium text-up">Verified</span>
          ) : (
            <span className="rounded-full bg-down/15 px-2.5 py-1 text-xs font-medium text-down">Not verified</span>
          )}
        </div>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Basic KYC</h2>
        {dobLocked ? (
          <div className="flex flex-col gap-2 text-sm">
            <Row label="Full name" value={user.fullName ?? '—'} />
            <Row label="Date of birth" value={`${user.dateOfBirth} (locked)`} />
            <p className="text-xs text-muted">
              Your details are on file. Date of birth is permanent and cannot be changed.
            </p>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted">
              Add your name and date of birth to verify you are 18+. Required before depositing or playing.
            </p>
            <KycForm />
          </>
        )}
      </Card>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted">{label}</span>
      <span className="font-medium text-fg">{value}</span>
    </div>
  );
}
