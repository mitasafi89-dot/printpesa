import { apiFetch } from '@/lib/api/client';
import type {
  ActivityDto,
  AuthResult,
  DepositResult,
  GameConfigDto,
  LedgerEntryDto,
  MeDto,
  Paginated,
  PositionDetailDto,
  PositionDto,
  TransactionDto,
  TransactionKind,
  WalletDto,
  WithdrawalResult,
} from '@/lib/api/types';
import type { PositionStatus } from '@printpesa/shared';

export interface RegisterInput {
  phone: string;
  username: string;
  password: string;
  referral_code?: string;
}

export interface PageParams {
  cursor?: string | null;
  limit?: number;
}

export interface TransactionFilter extends PageParams {
  kind?: TransactionKind;
  status?: string;
}

export interface PositionFilter extends PageParams {
  status?: PositionStatus;
}

/** Typed endpoint functions. One per route; grouped by domain. */
export const api = {
  health: () => apiFetch<{ status: string; time: string }>('/health'),
  gameConfig: () => apiFetch<GameConfigDto>('/game/config'),

  // Engagement (public; activity feed for SSR / first paint — live updates arrive over WS)
  activity: (limit = 30) =>
    apiFetch<{ items: ActivityDto[] }>('/activity', { query: { limit } }),

  // Auth & profile
  register: (body: RegisterInput) => apiFetch<AuthResult>('/auth/register', { method: 'POST', body }),
  login: (body: { phone: string; password: string }) =>
    apiFetch<AuthResult>('/auth/login', { method: 'POST', body }),
  me: (token: string) => apiFetch<MeDto>('/auth/me', { token }),

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

  // Bet history (positions)
  positions: (token: string, p: PositionFilter = {}) =>
    apiFetch<Paginated<PositionDto>>('/positions', {
      token,
      query: { cursor: p.cursor ?? undefined, limit: p.limit, status: p.status },
    }),
  position: (token: string, id: string) =>
    apiFetch<PositionDetailDto>(`/positions/${id}`, { token }),

  // Payments (amounts are integer cents)
  createDeposit: (token: string, body: { amount: number; phone: string }) =>
    apiFetch<DepositResult>('/deposits', { method: 'POST', token, body }),
  createWithdrawal: (token: string, body: { amount: number; phone: string }) =>
    apiFetch<WithdrawalResult>('/withdrawals', { method: 'POST', token, body }),
};
