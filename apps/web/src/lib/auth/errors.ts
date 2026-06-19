import { ApiError } from '@/lib/api/client';

const MESSAGES: Record<string, string> = {
  INVALID_CREDENTIALS: 'Wrong phone or password.',
  AUTH_INVALID: 'Your session expired. Please log in again.',
  AUTH_REQUIRED: 'Please log in to continue.',
  PHONE_TAKEN: 'That phone number is already registered. Try logging in.',
  USERNAME_TAKEN: 'That username is taken. Pick another.',
  AGE_RESTRICTED: 'You must be 18 or older to register.',
  INVALID_REFERRAL_CODE: 'That referral code is not valid.',
  DOB_IMMUTABLE: 'Your date of birth is already set and cannot be changed.',
  RATE_LIMITED: 'Too many attempts. Please wait a moment and try again.',
  ACCOUNT_SUSPENDED: 'This account is suspended. Contact support.',
  ACCOUNT_BANNED: 'This account is banned.',
  VALIDATION: 'Please check your details and try again.',
};

/** Map any thrown error to a friendly, action-oriented message. */
export function authErrorMessage(e: unknown): string {
  if (e instanceof ApiError) return MESSAGES[e.code] ?? e.message ?? 'Something went wrong.';
  return 'Network error. Please check your connection and try again.';
}
