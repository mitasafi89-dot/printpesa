import type { ActivityKind, Cents, Direction, PositionStatus, PositionResult } from '@printpesa/shared';

/** Cursor-paginated list envelope (docs/05 §8). */
export interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
}

export interface AuthResult {
  token: string;
  userId: string;
  role: 'player' | 'marketer' | 'admin' | 'superadmin';
}

export interface MeDto {
  userId: string;
  role: AuthResult['role'];
  username: string;
  fullName: string | null;
  dateOfBirth: string | null;
  kycStatus: 'none' | 'basic' | 'full' | 'rejected';
  ageVerified: boolean;
}

export interface WalletDto {
  real: Cents;
  bonus: Cents;
  currency: string;
}

/** GET /activity item (newest-first). Mirrors the WS `activity` DTO. */
export interface ActivityDto {
  kind: ActivityKind;
  username: string;
  amountCents: Cents | null;
  message: string;
  ts: number;
}

/** Wire shape of GET /game/config (docs/05 §4). */
export interface GameConfigDto {
  currency: string;
  minStakeCents: Cents;
  maxStakeCents: Cents;
  maxMultiplier: number;
  defaultDurationS: number;
  tickRateMs: number;
  rtp: number;
  timeframesS: number[];
}

/** GET /positions item — wire shape from apps/api `positionDto` (newest-first). */
export interface PositionDto {
  id: string;
  gameDayId: number | null;
  direction: Direction;
  stakeCents: Cents;
  entryRate: number;
  exitRate: number | null;
  multiplier: number | null;
  payoutCents: Cents | null;
  pnlCents: Cents | null;
  result: PositionResult | null;
  durationS: number;
  status: PositionStatus;
  openedAt: number; // epoch ms
  settledAt: number | null; // epoch ms, null while open
}

/** Provable-fairness commitment for a game-day (`serverSeed` is null until revealed). */
export interface FairnessDto {
  gameDayId: number;
  tradeDate: string;
  serverSeedHash: string;
  serverSeed: string | null;
  revealedAt: number | null;
}

/** GET /positions/:id — single position plus its fairness record. */
export interface PositionDetailDto extends PositionDto {
  fairness: FairnessDto | null;
}

/** GET /wallet/ledger item (signed amountCents; newest-first). */
export interface LedgerEntryDto {
  id: number;
  type: string;
  amountCents: Cents;
  balanceKind: string;
  refTable: string | null;
  refId: string | null;
  meta: unknown;
  ts: number;
}

export type TransactionKind = 'deposit' | 'withdrawal';

/** GET /transactions item. */
export interface TransactionDto {
  id: string;
  kind: TransactionKind;
  amountCents: Cents;
  status: string;
  provider: string | null;
  phone: string | null;
  mpesaReceipt: string | null;
  ts: number;
}

export interface DepositResult {
  transactionId: string;
  checkoutRequestId: string;
}

export interface WithdrawalResult {
  transactionId: string;
  newBalance: Cents;
}
