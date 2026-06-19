import type { Cents } from "@printpesa/shared";
import type { Querier } from "./wallet.js";
import { type Page, type PageQuery, clampLimit, decodeKeyset, pageFrom } from "./paging.js";
import type { InMemoryIdentityRepository } from "./identity.js";
import type { InMemoryPaymentRepository } from "./payments.js";

/**
 * Admin back office (J2) — the operator domain seam the HTTP API binds to. Read aggregates
 * for the dashboard, paginated user/withdrawal/audit lists, and two guarded mutations:
 *  - setUserStatus  -> migration-0021 fn_admin_set_user_status (active|suspended|banned)
 *  - setCommissionRate -> fn_admin_set_commission_rate (0..1)
 * Both write an immutable row to `admin_actions` and enforce the role hierarchy server-side
 * (admin acts on players; only superadmin acts on another admin; no self-action). The Pg
 * repository calls those RPCs; the in-memory repository mirrors the identical guards + audit
 * for tests. All lists are newest-first, keyset-paginated (`<createdAtMs>:<id>` cursors).
 */

export interface AdminOverview {
  users: { total: number; active: number; suspended: number; banned: number; players: number; marketers: number; admins: number };
  finance: { depositsCents: Cents; withdrawalsCents: Cents; pendingWithdrawals: number; walletLiabilityCents: Cents };
  affiliate: { marketers: number; commissionAccruedCents: Cents; commissionPaidCents: Cents; pendingPayouts: number };
  game: { settledPositions: number; turnoverCents: Cents; ggrCents: Cents };
}
export interface AdminUserRow { userId: string; username: string; role: string; status: string; createdAtMs: number; }
export interface AdminUserDetail extends AdminUserRow {
  phone: string; fullName: string | null; dateOfBirth: string | null; kycStatus: string; referredBy: string | null;
  realBalanceCents: Cents; bonusBalanceCents: Cents; turnoverCents: Cents; ggrCents: Cents;
}
export interface AdminWithdrawalRow { txId: string; userId: string; amountCents: Cents; status: string; phone: string; createdAtMs: number; }
export interface AdminAuditRow {
  id: string; actorId: string; actorRole: string; action: string;
  targetType: string; targetId: string | null; detail: unknown; createdAtMs: number;
}
export interface AdminUserListQuery extends PageQuery { role?: string | undefined; status?: string | undefined; q?: string | undefined; }
export interface AdminWithdrawalListQuery extends PageQuery { status?: string | undefined; }
export interface SetUserStatusResult { userId: string; status: string; }
export interface SetCommissionRateResult { userId: string; commissionRate: number; }
/** Result of a manual wallet balance adjustment (J3). */
export interface AdjustBalanceResult { userId: string; amountCents: Cents; newBalanceCents: Cents; direction: "credit" | "debit"; }
/** A deposit transaction as the admin deposits monitor sees it (J3). */
export interface AdminDepositRow {
  txId: string; userId: string; amountCents: Cents; status: string; phone: string;
  mpesaReceipt: string | null; checkoutRequestId: string | null; createdAtMs: number;
}
export interface AdminDepositListQuery extends PageQuery { status?: string | undefined; }
/** One deposit-status bucket in the reconcile summary (J3). */
export interface AdminDepositStatusBucket { status: string; count: number; amountCents: Cents; }
/** Deposits reconcile read (J3): per-status totals + the non-terminal STK pushes that are stale
 *  (older than `staleMinutes`) and therefore the candidates to reconcile against M-Pesa. */
export interface AdminDepositsReconcile { summary: AdminDepositStatusBucket[]; staleMinutes: number; stale: AdminDepositRow[]; }

/** Durable boundary for the admin back office (RPCs + reads / in-memory mirror). */
export interface AdminRepository {
  overview(): Promise<AdminOverview>;
  listUsers(q: AdminUserListQuery): Promise<Page<AdminUserRow>>;
  getUserDetail(userId: string): Promise<AdminUserDetail | null>;
  setUserStatus(actorId: string, actorRole: string, targetId: string, status: string, reason: string | null): Promise<SetUserStatusResult>;
  setCommissionRate(actorId: string, actorRole: string, targetId: string, rate: number): Promise<SetCommissionRateResult>;
  listWithdrawals(q: AdminWithdrawalListQuery): Promise<Page<AdminWithdrawalRow>>;
  listAudit(q: PageQuery): Promise<Page<AdminAuditRow>>;
  adjustBalance(actorId: string, actorRole: string, targetId: string, amountCents: Cents, reason: string): Promise<AdjustBalanceResult>;
  listDeposits(q: AdminDepositListQuery): Promise<Page<AdminDepositRow>>;
  depositsReconcile(staleMinutes: number): Promise<AdminDepositsReconcile>;
}

const VALID_STATUS = ["active", "suspended", "banned"];
const ADMIN_ROLES = ["admin", "superadmin"];

const num = (v: unknown): number => (typeof v === "string" ? Number(v) : (v as number)) || 0;
const ms = (v: unknown): number => (v instanceof Date ? v.getTime() : new Date(String(v)).getTime());

/** Re-raise the bare admin error code the RPCs raise instead of the wrapped pg message. */
function mapAdminError(e: unknown): never {
  const msg = (e as { message?: string })?.message ?? String(e);
  const m = msg.match(/(NOT_AUTHORIZED|INVALID_STATUS|NO_SELF_ACTION|USER_NOT_FOUND|INSUFFICIENT_PRIVILEGE|INVALID_RATE|NOT_AFFILIATE|REASON_REQUIRED|INVALID_AMOUNT|INSUFFICIENT_FUNDS|WALLET_NOT_FOUND)/);
  throw new Error(m ? m[1] : msg);
}

// ─────────────────────────── Postgres-backed admin repository ───────────────────────────

export class PgAdminRepository implements AdminRepository {
  constructor(private readonly q: Querier) {}

  async overview(): Promise<AdminOverview> {
    const r = await this.q.query(
      `select
         (select count(*) from profiles) as u_total,
         (select count(*) from profiles where status = 'active') as u_active,
         (select count(*) from profiles where status = 'suspended') as u_suspended,
         (select count(*) from profiles where status = 'banned') as u_banned,
         (select count(*) from profiles where role = 'player') as u_players,
         (select count(*) from profiles where role = 'marketer') as u_marketers,
         (select count(*) from profiles where role in ('admin','superadmin')) as u_admins,
         (select coalesce(sum(amount),0) from transactions where kind='deposit' and status='success') as f_dep,
         (select coalesce(sum(amount),0) from transactions where kind='withdrawal' and status='success') as f_wd,
         (select count(*) from transactions where kind='withdrawal' and status='pending') as f_pending,
         (select coalesce(sum(real_balance + bonus_balance),0) from wallets) as f_liab,
         (select count(*) from affiliates) as a_marketers,
         (select coalesce(sum(commission),0) from affiliate_commissions where status='accrued') as a_accrued,
         (select coalesce(sum(commission),0) from affiliate_commissions where status='paid') as a_paid,
         (select count(*) from affiliate_payouts where status in ('requested','approved')) as a_pending,
         (select count(*) from positions where status='settled') as g_settled,
         (select coalesce(sum(stake),0) from positions where status='settled') as g_turnover,
         (select coalesce(sum(stake - payout),0) from positions where status='settled') as g_ggr`,
      []);
    const x = r.rows[0];
    return {
      users: { total: num(x.u_total), active: num(x.u_active), suspended: num(x.u_suspended), banned: num(x.u_banned),
        players: num(x.u_players), marketers: num(x.u_marketers), admins: num(x.u_admins) },
      finance: { depositsCents: num(x.f_dep), withdrawalsCents: num(x.f_wd), pendingWithdrawals: num(x.f_pending), walletLiabilityCents: num(x.f_liab) },
      affiliate: { marketers: num(x.a_marketers), commissionAccruedCents: num(x.a_accrued), commissionPaidCents: num(x.a_paid), pendingPayouts: num(x.a_pending) },
      game: { settledPositions: num(x.g_settled), turnoverCents: num(x.g_turnover), ggrCents: num(x.g_ggr) },
    };
  }

  async listUsers(q: AdminUserListQuery): Promise<Page<AdminUserRow>> {
    const limit = clampLimit(q.limit);
    const cur = decodeKeyset(q.cursor);
    const r = await this.q.query(
      `select id, username, role, status, created_at from profiles
        where ($1::text is null or role = $1)
          and ($2::text is null or status = $2)
          and ($3::text is null or username ilike '%'||$3||'%' or phone ilike '%'||$3||'%')
          and ($4::timestamptz is null or (created_at, id) < ($4::timestamptz, $5::uuid))
        order by created_at desc, id desc
        limit $6`,
      [q.role ?? null, q.status ?? null, q.q ?? null, cur ? new Date(cur.tsMs).toISOString() : null, cur ? cur.id : null, limit + 1]);
    const rows: AdminUserRow[] = r.rows.map((x) => ({
      userId: String(x.id), username: String(x.username), role: String(x.role), status: String(x.status), createdAtMs: ms(x.created_at),
    }));
    return pageFrom(rows, limit, (u) => `${u.createdAtMs}:${u.userId}`);
  }

  async getUserDetail(userId: string): Promise<AdminUserDetail | null> {
    const r = await this.q.query(
      `select p.id, p.username, p.phone, p.role, p.status, p.full_name, p.date_of_birth, p.kyc_status, p.referred_by, p.created_at,
              coalesce(w.real_balance,0) as real_balance, coalesce(w.bonus_balance,0) as bonus_balance,
              coalesce((select sum(stake) from positions po where po.user_id = p.id and po.status='settled'),0) as turnover,
              coalesce((select sum(stake - payout) from positions po where po.user_id = p.id and po.status='settled'),0) as ggr
         from profiles p left join wallets w on w.user_id = p.id
        where p.id = $1`,
      [userId]);
    if (!r.rows.length) return null;
    const x = r.rows[0];
    return {
      userId: String(x.id), username: String(x.username), role: String(x.role), status: String(x.status), createdAtMs: ms(x.created_at),
      phone: String(x.phone), fullName: x.full_name == null ? null : String(x.full_name),
      dateOfBirth: x.date_of_birth == null ? null : String(x.date_of_birth).slice(0, 10), kycStatus: String(x.kyc_status),
      referredBy: x.referred_by == null ? null : String(x.referred_by),
      realBalanceCents: num(x.real_balance), bonusBalanceCents: num(x.bonus_balance), turnoverCents: num(x.turnover), ggrCents: num(x.ggr),
    };
  }

  async setUserStatus(actorId: string, actorRole: string, targetId: string, status: string, reason: string | null): Promise<SetUserStatusResult> {
    try {
      const r = await this.q.query("select user_id, status from fn_admin_set_user_status($1,$2,$3,$4,$5)", [actorId, actorRole, targetId, status, reason]);
      const x = r.rows[0];
      return { userId: String(x.user_id), status: String(x.status) };
    } catch (e) { mapAdminError(e); }
  }

  async setCommissionRate(actorId: string, actorRole: string, targetId: string, rate: number): Promise<SetCommissionRateResult> {
    try {
      const r = await this.q.query("select user_id, commission_rate from fn_admin_set_commission_rate($1,$2,$3,$4)", [actorId, actorRole, targetId, rate]);
      const x = r.rows[0];
      return { userId: String(x.user_id), commissionRate: num(x.commission_rate) };
    } catch (e) { mapAdminError(e); }
  }

  async listWithdrawals(q: AdminWithdrawalListQuery): Promise<Page<AdminWithdrawalRow>> {
    const limit = clampLimit(q.limit);
    const cur = decodeKeyset(q.cursor);
    const r = await this.q.query(
      `select id, user_id, amount, status, phone, created_at from transactions
        where kind = 'withdrawal'
          and ($1::text is null or status = $1)
          and ($2::timestamptz is null or (created_at, id) < ($2::timestamptz, $3::uuid))
        order by created_at desc, id desc
        limit $4`,
      [q.status ?? null, cur ? new Date(cur.tsMs).toISOString() : null, cur ? cur.id : null, limit + 1]);
    const rows: AdminWithdrawalRow[] = r.rows.map((x) => ({
      txId: String(x.id), userId: String(x.user_id), amountCents: num(x.amount), status: String(x.status), phone: String(x.phone), createdAtMs: ms(x.created_at),
    }));
    return pageFrom(rows, limit, (t) => `${t.createdAtMs}:${t.txId}`);
  }

  async listAudit(q: PageQuery): Promise<Page<AdminAuditRow>> {
    const limit = clampLimit(q.limit);
    const cur = decodeKeyset(q.cursor);
    const r = await this.q.query(
      `select id, actor_id, actor_role, action, target_type, target_id, detail, created_at from admin_actions
        where ($1::timestamptz is null or (created_at, id) < ($1::timestamptz, $2::bigint))
        order by created_at desc, id desc
        limit $3`,
      [cur ? new Date(cur.tsMs).toISOString() : null, cur ? Number(cur.id) : null, limit + 1]);
    const rows: AdminAuditRow[] = r.rows.map((x) => ({
      id: String(x.id), actorId: String(x.actor_id), actorRole: String(x.actor_role), action: String(x.action),
      targetType: String(x.target_type), targetId: x.target_id == null ? null : String(x.target_id), detail: x.detail, createdAtMs: ms(x.created_at),
    }));
    return pageFrom(rows, limit, (a) => `${a.createdAtMs}:${a.id}`);
  }

  async adjustBalance(actorId: string, actorRole: string, targetId: string, amountCents: Cents, reason: string): Promise<AdjustBalanceResult> {
    try {
      const r = await this.q.query("select user_id, amount, new_balance from fn_admin_adjust_balance($1,$2,$3,$4,$5)", [actorId, actorRole, targetId, amountCents, reason]);
      const x = r.rows[0];
      const amt = num(x.amount);
      return { userId: String(x.user_id), amountCents: amt, newBalanceCents: num(x.new_balance), direction: amt >= 0 ? "credit" : "debit" };
    } catch (e) { mapAdminError(e); }
  }

  async listDeposits(q: AdminDepositListQuery): Promise<Page<AdminDepositRow>> {
    const limit = clampLimit(q.limit);
    const cur = decodeKeyset(q.cursor);
    const r = await this.q.query(
      `select id, user_id, amount, status, phone, mpesa_receipt, checkout_request_id, created_at from transactions
        where kind = 'deposit'
          and ($1::text is null or status = $1)
          and ($2::timestamptz is null or (created_at, id) < ($2::timestamptz, $3::uuid))
        order by created_at desc, id desc
        limit $4`,
      [q.status ?? null, cur ? new Date(cur.tsMs).toISOString() : null, cur ? cur.id : null, limit + 1]);
    const rows: AdminDepositRow[] = r.rows.map(mapDepositRow);
    return pageFrom(rows, limit, (d) => `${d.createdAtMs}:${d.txId}`);
  }

  async depositsReconcile(staleMinutes: number): Promise<AdminDepositsReconcile> {
    const s = await this.q.query(
      `select status, count(*)::bigint as n, coalesce(sum(amount),0)::bigint as amt
         from transactions where kind = 'deposit' group by status order by status`, []);
    const summary: AdminDepositStatusBucket[] = s.rows.map((x) => ({ status: String(x.status), count: num(x.n), amountCents: num(x.amt) }));
    const r = await this.q.query(
      `select id, user_id, amount, status, phone, mpesa_receipt, checkout_request_id, created_at from transactions
        where kind = 'deposit' and status in ('pending', 'processing')
          and created_at < now() - ($1::int * interval '1 minute')
        order by created_at desc, id desc
        limit 100`,
      [Math.max(0, Math.round(staleMinutes))]);
    return { summary, staleMinutes, stale: r.rows.map(mapDepositRow) };
  }
}

/** Map a raw deposit `transactions` row into the public AdminDepositRow. */
function mapDepositRow(x: any): AdminDepositRow {
  return {
    txId: String(x.id), userId: String(x.user_id), amountCents: num(x.amount), status: String(x.status), phone: String(x.phone),
    mpesaReceipt: x.mpesa_receipt == null ? null : String(x.mpesa_receipt),
    checkoutRequestId: x.checkout_request_id == null ? null : String(x.checkout_request_id), createdAtMs: ms(x.created_at),
  };
}

// ─────────────────────────── In-memory admin repository (tests) ───────────────────────────

/** In-memory keyset pagination over `(_ts desc, _id desc)` rows, mirroring the Pg keyset reads. */
function memKeyset<T extends { _ts: number; _id: string }>(all: T[], q: PageQuery): Page<Omit<T, "_ts" | "_id">> {
  const limit = clampLimit(q.limit);
  const cur = decodeKeyset(q.cursor);
  const sorted = [...all].sort((a, b) => (b._ts - a._ts) || (a._id < b._id ? 1 : a._id > b._id ? -1 : 0));
  const filtered = cur ? sorted.filter((x) => x._ts < cur.tsMs || (x._ts === cur.tsMs && x._id < cur.id)) : sorted;
  const page = pageFrom(filtered, limit, (t) => `${t._ts}:${t._id}`);
  return { items: page.items.map(({ _ts, _id, ...rest }) => rest as Omit<T, "_ts" | "_id">), nextCursor: page.nextCursor };
}

interface MemAudit { id: number; actorId: string; actorRole: string; action: string; targetType: string; targetId: string | null; detail: unknown; createdAtMs: number; }

/** Project an admin transaction snapshot into the public AdminDepositRow shape. */
function memDepositRow(t: { txId: string; userId: string; amountCents: Cents; status: string; phone: string; mpesaReceipt: string | null; checkoutRequestId: string | null; createdAtMs: number }): AdminDepositRow {
  return { txId: t.txId, userId: t.userId, amountCents: t.amountCents, status: t.status, phone: t.phone, mpesaReceipt: t.mpesaReceipt, checkoutRequestId: t.checkoutRequestId, createdAtMs: t.createdAtMs };
}

/**
 * In-memory AdminRepository composing the in-memory identity + payment stores. It enforces the
 * SAME guards and writes the SAME audit shape as the 0021 RPCs, so the engine/API tests exercise
 * the real authorization semantics without Postgres.
 */
export class InMemoryAdminRepository implements AdminRepository {
  private readonly audit: MemAudit[] = [];
  private seq = 0;
  constructor(
    private readonly identity: InMemoryIdentityRepository,
    private readonly payments: InMemoryPaymentRepository,
  ) {}

  async overview(): Promise<AdminOverview> {
    const users = this.identity.adminUsers();
    const txs = this.payments.adminTransactions();
    const commissions = this.identity.adminCommissions();
    const plays = this.identity.adminPlays();
    return {
      users: {
        total: users.length,
        active: users.filter((u) => u.status === "active").length,
        suspended: users.filter((u) => u.status === "suspended").length,
        banned: users.filter((u) => u.status === "banned").length,
        players: users.filter((u) => u.role === "player").length,
        marketers: users.filter((u) => u.role === "marketer").length,
        admins: users.filter((u) => u.role === "admin" || u.role === "superadmin").length,
      },
      finance: {
        depositsCents: txs.filter((t) => t.kind === "deposit" && t.status === "success").reduce((s, t) => s + t.amountCents, 0),
        withdrawalsCents: txs.filter((t) => t.kind === "withdrawal" && t.status === "success").reduce((s, t) => s + t.amountCents, 0),
        pendingWithdrawals: txs.filter((t) => t.kind === "withdrawal" && t.status === "pending").length,
        walletLiabilityCents: this.payments.adminWalletLiabilityCents(),
      },
      affiliate: {
        marketers: this.identity.adminAffiliates().length,
        commissionAccruedCents: commissions.filter((c) => c.status === "accrued").reduce((s, c) => s + c.commissionCents, 0),
        commissionPaidCents: commissions.filter((c) => c.status === "paid").reduce((s, c) => s + c.commissionCents, 0),
        pendingPayouts: this.identity.adminPendingPayoutCount(),
      },
      game: {
        settledPositions: plays.length,
        turnoverCents: plays.reduce((s, p) => s + p.stakeCents, 0),
        ggrCents: plays.reduce((s, p) => s + (p.stakeCents - p.payoutCents), 0),
      },
    };
  }

  async listUsers(q: AdminUserListQuery): Promise<Page<AdminUserRow>> {
    const needle = q.q?.toLowerCase();
    const rows = this.identity.adminUsers()
      .filter((u) =>
        (q.role === undefined || u.role === q.role) &&
        (q.status === undefined || u.status === q.status) &&
        (needle === undefined || u.username.toLowerCase().includes(needle) || u.phone.includes(needle)))
      .map((u) => ({ userId: u.userId, username: u.username, role: u.role, status: u.status, createdAtMs: u.createdAtMs, _ts: u.createdAtMs, _id: u.userId }));
    return memKeyset(rows, q);
  }

  async getUserDetail(userId: string): Promise<AdminUserDetail | null> {
    const u = this.identity.adminUser(userId);
    if (!u) return null;
    const own = this.identity.adminPlaysOf(userId);
    return {
      userId: u.userId, username: u.username, role: u.role, status: u.status, createdAtMs: u.createdAtMs,
      phone: u.phone, fullName: u.fullName, dateOfBirth: u.dateOfBirth, kycStatus: u.kycStatus, referredBy: u.referredBy,
      realBalanceCents: await this.payments.getBalance(userId), bonusBalanceCents: 0,
      turnoverCents: own.reduce((s, p) => s + p.stakeCents, 0),
      ggrCents: own.reduce((s, p) => s + (p.stakeCents - p.payoutCents), 0),
    };
  }

  async setUserStatus(actorId: string, actorRole: string, targetId: string, status: string, reason: string | null): Promise<SetUserStatusResult> {
    if (!ADMIN_ROLES.includes(actorRole)) throw new Error("NOT_AUTHORIZED");
    if (!VALID_STATUS.includes(status)) throw new Error("INVALID_STATUS");
    if (actorId === targetId) throw new Error("NO_SELF_ACTION");
    const u = this.identity.adminUser(targetId);
    if (!u) throw new Error("USER_NOT_FOUND");
    if (ADMIN_ROLES.includes(u.role) && actorRole !== "superadmin") throw new Error("INSUFFICIENT_PRIVILEGE");
    const from = u.status;
    this.identity.adminSetStatus(targetId, status);
    this.record(actorId, actorRole, "user.status", "user", targetId, { from, to: status, reason });
    return { userId: targetId, status };
  }

  async setCommissionRate(actorId: string, actorRole: string, targetId: string, rate: number): Promise<SetCommissionRateResult> {
    if (!ADMIN_ROLES.includes(actorRole)) throw new Error("NOT_AUTHORIZED");
    if (rate < 0 || rate > 1) throw new Error("INVALID_RATE");
    const a = this.identity.adminAffiliate(targetId);
    if (!a) throw new Error("NOT_AFFILIATE");
    const from = a.commissionRate;
    this.identity.adminSetCommissionRate(targetId, rate);
    this.record(actorId, actorRole, "affiliate.rate", "affiliate", targetId, { from, to: rate });
    return { userId: targetId, commissionRate: rate };
  }

  async listWithdrawals(q: AdminWithdrawalListQuery): Promise<Page<AdminWithdrawalRow>> {
    const rows = this.payments.adminTransactions()
      .filter((t) => t.kind === "withdrawal" && (q.status === undefined || t.status === q.status))
      .map((t) => ({ txId: t.txId, userId: t.userId, amountCents: t.amountCents, status: t.status, phone: t.phone, createdAtMs: t.createdAtMs, _ts: t.createdAtMs, _id: t.txId }));
    return memKeyset(rows, q);
  }

  async listAudit(q: PageQuery): Promise<Page<AdminAuditRow>> {
    const rows = this.audit.map((a) => ({
      id: String(a.id), actorId: a.actorId, actorRole: a.actorRole, action: a.action,
      targetType: a.targetType, targetId: a.targetId, detail: a.detail, createdAtMs: a.createdAtMs,
      _ts: a.createdAtMs, _id: String(a.id).padStart(12, "0"),
    }));
    return memKeyset(rows, q);
  }

  async adjustBalance(actorId: string, actorRole: string, targetId: string, amountCents: Cents, reason: string): Promise<AdjustBalanceResult> {
    if (!ADMIN_ROLES.includes(actorRole)) throw new Error("NOT_AUTHORIZED");
    if (!Number.isInteger(amountCents) || amountCents === 0) throw new Error("INVALID_AMOUNT");
    if (!reason || reason.trim() === "") throw new Error("REASON_REQUIRED");
    if (!this.identity.adminUser(targetId)) throw new Error("USER_NOT_FOUND");
    const before = await this.payments.getBalance(targetId);
    if (before + amountCents < 0) throw new Error("INSUFFICIENT_FUNDS");
    const after = this.payments.adminApplyAdjustment(targetId, amountCents);
    this.record(actorId, actorRole, "balance.adjust", "user", targetId, { amount: amountCents, reason, before, after });
    return { userId: targetId, amountCents, newBalanceCents: after, direction: amountCents > 0 ? "credit" : "debit" };
  }

  async listDeposits(q: AdminDepositListQuery): Promise<Page<AdminDepositRow>> {
    const rows = this.payments.adminTransactions()
      .filter((t) => t.kind === "deposit" && (q.status === undefined || t.status === q.status))
      .map((t) => ({ ...memDepositRow(t), _ts: t.createdAtMs, _id: t.txId }));
    return memKeyset(rows, q);
  }

  async depositsReconcile(staleMinutes: number): Promise<AdminDepositsReconcile> {
    const deposits = this.payments.adminTransactions().filter((t) => t.kind === "deposit");
    const buckets = new Map<string, { count: number; amountCents: number }>();
    for (const d of deposits) {
      const b = buckets.get(d.status) ?? { count: 0, amountCents: 0 };
      b.count += 1; b.amountCents += d.amountCents; buckets.set(d.status, b);
    }
    const summary = [...buckets.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      .map(([status, v]) => ({ status, count: v.count, amountCents: v.amountCents }));
    const cutoff = Date.now() - Math.max(0, staleMinutes) * 60_000;
    const stale = deposits
      .filter((d) => (d.status === "pending" || d.status === "processing") && d.createdAtMs < cutoff)
      .sort((a, b) => (b.createdAtMs - a.createdAtMs) || (a.txId < b.txId ? 1 : a.txId > b.txId ? -1 : 0))
      .slice(0, 100)
      .map(memDepositRow);
    return { summary, staleMinutes, stale };
  }

  private record(actorId: string, actorRole: string, action: string, targetType: string, targetId: string | null, detail: unknown): void {
    this.audit.push({ id: ++this.seq, actorId, actorRole, action, targetType, targetId, detail, createdAtMs: Date.now() });
  }
}
