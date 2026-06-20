import type { Cents } from '@printpesa/shared';

// ── Admin DTOs — mirror apps/engine/src/admin.ts wire shapes ──

export interface AdminOverview {
  users: {
    total: number;
    active: number;
    suspended: number;
    banned: number;
    players: number;
    marketers: number;
    admins: number;
  };
  finance: {
    depositsCents: Cents;
    withdrawalsCents: Cents;
    pendingWithdrawals: number;
    walletLiabilityCents: Cents;
  };
  affiliate: {
    marketers: number;
    commissionAccruedCents: Cents;
    commissionPaidCents: Cents;
    pendingPayouts: number;
  };
  game: { settledPositions: number; turnoverCents: Cents; ggrCents: Cents };
}

export interface RtpWindowRow {
  window: string;
  settledPositions: number;
  turnoverCents: Cents;
  payoutCents: Cents;
  realisedRtp: number | null;
}
export interface RtpMonitor {
  targetRtp: number;
  toleranceAbs: number;
  minSamples: number;
  windows: RtpWindowRow[];
  alert: boolean;
}

export interface AdminUserRow {
  userId: string;
  username: string;
  role: string;
  status: string;
  createdAtMs: number;
}
export interface AdminUserDetail extends AdminUserRow {
  phone: string;
  referredBy: string | null;
  realBalanceCents: Cents;
  bonusBalanceCents: Cents;
  turnoverCents: Cents;
  ggrCents: Cents;
}
export interface SetUserStatusResult {
  userId: string;
  status: string;
}
export interface AdjustBalanceResult {
  userId: string;
  amountCents: Cents;
  newBalanceCents: Cents;
  direction: 'credit' | 'debit';
}

export interface AdminWithdrawalRow {
  txId: string;
  userId: string;
  amountCents: Cents;
  status: string;
  phone: string;
  createdAtMs: number;
}

export interface AdminDepositRow {
  txId: string;
  userId: string;
  amountCents: Cents;
  status: string;
  phone: string;
  mpesaReceipt: string | null;
  checkoutRequestId: string | null;
  createdAtMs: number;
}
export interface AdminDepositStatusBucket {
  status: string;
  count: number;
  amountCents: Cents;
}
export interface AdminDepositsReconcile {
  summary: AdminDepositStatusBucket[];
  staleMinutes: number;
  stale: AdminDepositRow[];
}

export interface AdminPayoutRow {
  payoutId: string;
  affiliateId: string;
  username: string;
  phone: string;
  amountCents: Cents;
  status: string;
  approvedBy: string | null;
  createdAtMs: number;
}

export interface AdminChatModRow {
  id: number;
  userId: string | null;
  username: string;
  message: string;
  isHidden: boolean;
  createdAtMs: number;
}

export interface GameConfigRow {
  houseEdge: number;
  maxMultiplier: number;
  minStakeCents: Cents;
  maxStakeCents: Cents;
  defaultDurationS: number;
  tickRateMs: number;
  driftBias: number;
  volatility: number;
  rtpTarget: number;
  updatedBy: string | null;
  updatedAtMs: number;
}
export interface GameConfigPatch {
  houseEdge?: number;
  maxMultiplier?: number;
  minStakeCents?: number;
  maxStakeCents?: number;
  defaultDurationS?: number;
  tickRateMs?: number;
  driftBias?: number;
  volatility?: number;
}
export interface AdminSeedRow {
  gameDayId: number | null;
  tradeDate: string;
  serverSeedHash: string | null;
  seedVersion: number;
  revealed: boolean;
  revealedAtMs: number | null;
}
export interface SeedRotateResult {
  tradeDate: string;
  seedVersion: number;
}

export interface DailyReportRow {
  date: string;
  depositsCents: Cents;
  withdrawalsCents: Cents;
  turnoverCents: Cents;
  ggrCents: Cents;
}
export interface UserReportRow {
  userId: string;
  username: string;
  depositsCents: Cents;
  withdrawalsCents: Cents;
  turnoverCents: Cents;
  ggrCents: Cents;
}

export interface AdminAuditRow {
  id: string;
  actorId: string;
  actorRole: string;
  action: string;
  targetType: string;
  targetId: string | null;
  detail: unknown;
  createdAtMs: number;
}
