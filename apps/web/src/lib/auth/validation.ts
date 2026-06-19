import {
  validatePassword,
  validateUsername,
  validateFullName,
  validateDateOfBirth,
  validateReferralCode,
} from '@printpesa/shared/credentials';
import { normalizeMsisdn } from '@printpesa/shared/payments';

function pick(map: Record<string, string>, reason: string | undefined, fallback: string): string {
  return (reason ? map[reason] : undefined) ?? fallback;
}

export function phoneError(v: string): string | undefined {
  if (!v.trim()) return 'Phone number is required.';
  try {
    normalizeMsisdn(v);
    return undefined;
  } catch {
    return 'Enter a valid Kenyan number, e.g. 0712 345 678.';
  }
}

export function usernameError(v: string): string | undefined {
  const r = validateUsername(v);
  if (r.ok) return undefined;
  return pick(
    {
      TOO_SHORT: 'At least 3 characters.',
      TOO_LONG: 'At most 20 characters.',
      INVALID_CHARS: 'Letters, numbers, dots and underscores only.',
    },
    r.reason,
    'Invalid username.',
  );
}

export function passwordError(v: string): string | undefined {
  const r = validatePassword(v);
  if (r.ok) return undefined;
  return pick(
    {
      TOO_SHORT: 'At least 8 characters.',
      TOO_LONG: 'Too long.',
      NEEDS_LETTER: 'Add at least one letter.',
      NEEDS_DIGIT: 'Add at least one number.',
    },
    r.reason,
    'Invalid password.',
  );
}

export function referralError(v: string): string | undefined {
  if (!v.trim()) return undefined; // optional
  const r = validateReferralCode(v);
  if (r.ok) return undefined;
  return 'Referral code looks wrong — it is 8 characters.';
}

export function fullNameError(v: string): string | undefined {
  const r = validateFullName(v);
  if (r.ok) return undefined;
  return pick(
    {
      TOO_SHORT: 'Enter your full name.',
      TOO_LONG: 'Name is too long.',
      INVALID_CHARS: 'Use letters and basic punctuation only.',
      NEEDS_LETTER: 'Enter your full name.',
    },
    r.reason,
    'Enter a valid name.',
  );
}

export function dobError(v: string): string | undefined {
  if (!v) return 'Date of birth is required.';
  const r = validateDateOfBirth(v);
  if (r.ok) return undefined;
  return pick(
    {
      UNDERAGE: 'You must be 18 or older.',
      FUTURE: 'Date cannot be in the future.',
      INVALID_FORMAT: 'Enter a valid date.',
      INVALID_DATE: 'Enter a valid date.',
      IMPLAUSIBLE: 'Enter a valid date.',
    },
    r.reason,
    'Enter a valid date.',
  );
}
