import { apiFetch } from '@/lib/api/client';
import type {
  AuthResult,
  DepositResult,
  GameConfigDto,
  LedgerEntryDto,
  MeDto,
  Paginated,
  TransactionDto,
  TransactionKind,
  WalletDto,
  WithdrawalResult,
} from '@/lib/api/types';

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

export interface PageParams {
  cursor?: string | null;
  limit?: number;
}

export interface TransactionFilter extends PageParams {
  kind?: TransactionKind;
  status?: string;
}

/** Typed endpoint functions. One per route; grouped by domain. */
export const api = {
  health: () => apiFetch<{ status: string; time: string }>('/health'),
  gameConfig: () => apiFetch<GameConfigDto>('/game/config'),

  // Auth & profile
  register: (body: RegisterInput) => apiFetch<AuthResult>('/auth/register', { method: 'POST', body }),
  login: (body: { phone: string; password: string }) =>
    apiFetch<AuthResult>('/auth/login', { method: 'POST', body }),
  me: (token: string) => apiFetch<MeDto>('/auth/me', { token }),
  updateProfile: (token: string, body: ProfileInput) =>
    apiFetch<unknown>('/auth/me', { method: 'PATCH', token, body }),

  // Wallet & history
  wallet: (token: string) => apiFetch<WalletDto>('/wallet', { token }),
  ledger: (token: string, p: PageParams = {}) =>
    apiFetch<Paginated<LedgerEntryDto>>('/wallet/ledger', {
      token,
      query: { cursor: p.cursor ?? undefined, limit: p.limit },
    }),
  transactions: (token: string, p: TransactionFilter = {}) =>
    apiFetch<Paginated<TransactionDto>>('/transactions', {
      token,
      query: { cursor: p.cursor ?? undefined, limit: p.limit, kind: p.kind, status: p.status },
    }),

  // Payments (amounts are integer cents)
  createDeposit: (token: string, body: { amount: number; phone: string }) =>
    apiFetch<DepositResult>('/deposits', { method: 'POST', token, body }),
  createWithdrawal: (token: string, body: { amount: number; phone: string }) =>
    apiFetch<WithdrawalResult>('/withdrawals', { method: 'POST', token, body }),
};
