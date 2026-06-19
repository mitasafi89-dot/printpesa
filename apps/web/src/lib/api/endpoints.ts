import { apiFetch } from '@/lib/api/client';
import type { AuthResult, GameConfigDto, MeDto, WalletDto } from '@/lib/api/types';

export interface RegisterInput {
  phone: string;
  username: string;
  password: string;
  referral_code?: string;
}

export interface ProfileInput {
  full_name: string;
  date_of_birth: string;
}

/** Typed endpoint functions. One per route; grouped by domain. */
export const api = {
  health: () => apiFetch<{ status: string; time: string }>('/health'),
  gameConfig: () => apiFetch<GameConfigDto>('/game/config'),

  register: (body: RegisterInput) => apiFetch<AuthResult>('/auth/register', { method: 'POST', body }),
  login: (body: { phone: string; password: string }) =>
    apiFetch<AuthResult>('/auth/login', { method: 'POST', body }),
  me: (token: string) => apiFetch<MeDto>('/auth/me', { token }),
  updateProfile: (token: string, body: ProfileInput) =>
    apiFetch<unknown>('/auth/me', { method: 'PATCH', token, body }),

  wallet: (token: string) => apiFetch<WalletDto>('/wallet', { token }),
};
