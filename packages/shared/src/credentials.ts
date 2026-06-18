/**
 * Credential input rules for phone + password auth. Pure and deterministic so the engine
 * (AuthService) and the HTTP layer can share one source of truth. Phone normalization is
 * handled by `normalizeMsisdn` (see payments.ts); these helpers cover password strength and
 * the public display username (which is unique and shown in chat/feed).
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128; // cap input to bound hashing cost (DoS guard)
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 20;

/** alphanumeric, with single internal dots/underscores; must start & end alphanumeric. */
const USERNAME_RE = /^[a-zA-Z0-9](?:[a-zA-Z0-9._]*[a-zA-Z0-9])?$/;

export interface CredentialCheck { ok: boolean; reason?: string }

/** Validate a password: length bounds + at least one letter and one digit. */
export function validatePassword(password: unknown): CredentialCheck {
  if (typeof password !== "string") return { ok: false, reason: "INVALID" };
  if (password.length < PASSWORD_MIN_LENGTH) return { ok: false, reason: "TOO_SHORT" };
  if (password.length > PASSWORD_MAX_LENGTH) return { ok: false, reason: "TOO_LONG" };
  if (!/[A-Za-z]/.test(password)) return { ok: false, reason: "NEEDS_LETTER" };
  if (!/[0-9]/.test(password)) return { ok: false, reason: "NEEDS_DIGIT" };
  return { ok: true };
}

/** Validate a public display username: length bounds + allowed charset. */
export function validateUsername(username: unknown): CredentialCheck {
  if (typeof username !== "string") return { ok: false, reason: "INVALID" };
  if (username.length < USERNAME_MIN_LENGTH) return { ok: false, reason: "TOO_SHORT" };
  if (username.length > USERNAME_MAX_LENGTH) return { ok: false, reason: "TOO_LONG" };
  if (!USERNAME_RE.test(username)) return { ok: false, reason: "INVALID_CHARS" };
  return { ok: true };
}

// ── Basic-KYC profile rules (full name + age-gate) ────────────────────────────────────────
// Real-money play is restricted to adults. Age is computed from a stored date_of_birth at
// validation time; the authoritative transaction-time gate lives in the money RPCs (0016).
export const MIN_AGE_YEARS = 18;
export const MAX_AGE_YEARS = 120;
export const FULL_NAME_MIN_LENGTH = 2;
export const FULL_NAME_MAX_LENGTH = 100;

/** Whole years between an ISO `YYYY-MM-DD` date of birth and `now` (UTC, calendar-correct). */
export function ageInYears(dobIso: string, now: Date = new Date()): number {
  const [y, m, d] = dobIso.split("-").map(Number) as [number, number, number];
  let age = now.getUTCFullYear() - y;
  const mo = now.getUTCMonth() + 1;
  const day = now.getUTCDate();
  if (mo < m || (mo === m && day < d)) age -= 1; // birthday not yet reached this year
  return age;
}

/** Validate a real name: trimmed length bounds + letters and a small set of name punctuation. */
export function validateFullName(name: unknown): CredentialCheck {
  if (typeof name !== "string") return { ok: false, reason: "INVALID" };
  const t = name.trim();
  if (t.length < FULL_NAME_MIN_LENGTH) return { ok: false, reason: "TOO_SHORT" };
  if (t.length > FULL_NAME_MAX_LENGTH) return { ok: false, reason: "TOO_LONG" };
  if (!/^[\p{L} .,'\-]+$/u.test(t)) return { ok: false, reason: "INVALID_CHARS" };
  if (!/\p{L}/u.test(t)) return { ok: false, reason: "NEEDS_LETTER" };
  return { ok: true };
}

// ── Affiliate referral code ──────────────────────────────────────────────────────────────────
// A referral code is a public, shareable handle (not a secret). It uses a Crockford-style
// alphabet with no visually ambiguous characters (0/O, 1/I/L) so it survives being typed off a
// poster or shared link. The authoritative generator + uniqueness live in the DB RPC; this is the
// shared syntactic gate so the engine and HTTP layer reject malformed codes identically.
export const REFERRAL_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const REFERRAL_CODE_LENGTH = 8;

export type ReferralCodeCheck = { ok: true; code: string } | { ok: false; reason: string };

/** Validate + normalize a referral code: trim, upper-case, exact length, allowed alphabet only. */
export function validateReferralCode(input: unknown): ReferralCodeCheck {
  if (typeof input !== "string") return { ok: false, reason: "INVALID" };
  const code = input.trim().toUpperCase();
  if (code.length !== REFERRAL_CODE_LENGTH) return { ok: false, reason: "INVALID_LENGTH" };
  for (const ch of code) if (!REFERRAL_CODE_ALPHABET.includes(ch)) return { ok: false, reason: "INVALID_CHARS" };
  return { ok: true, code };
}

/** Validate a strict `YYYY-MM-DD` date of birth: real past date, age within [MIN, MAX] years. */
export function validateDateOfBirth(input: unknown, now: Date = new Date()): CredentialCheck {
  if (typeof input !== "string") return { ok: false, reason: "INVALID" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) return { ok: false, reason: "INVALID_FORMAT" };
  const dt = new Date(`${input}T00:00:00.000Z`);
  if (Number.isNaN(dt.getTime()) || dt.toISOString().slice(0, 10) !== input) return { ok: false, reason: "INVALID_DATE" };
  if (dt.getTime() > now.getTime()) return { ok: false, reason: "FUTURE" };
  const age = ageInYears(input, now);
  if (age < MIN_AGE_YEARS) return { ok: false, reason: "UNDERAGE" };
  if (age > MAX_AGE_YEARS) return { ok: false, reason: "IMPLAUSIBLE" };
  return { ok: true };
}
