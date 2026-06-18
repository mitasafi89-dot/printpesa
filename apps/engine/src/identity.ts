import { randomUUID, randomInt } from "node:crypto";
import { REFERRAL_CODE_ALPHABET, REFERRAL_CODE_LENGTH } from "@printpesa/shared";
import type { Querier } from "./wallet.js";

/**
 * IdentityRepository: durable boundary for self-managed phone + password identity and the
 * basic-KYC profile. `register` maps to the 0015 `fn_register_user` RPC; `findByPhone` loads
 * the credential for login; `getProfile` reads the profile/KYC state; `setBasicProfile` maps
 * to the 0016 `fn_set_basic_profile` RPC (validates adulthood, DOB immutable once set). The
 * in-memory implementation mirrors the same contracts for tests; both are driven the same way
 * by AuthService. Phones passed in are already normalized MSISDN; dates are ISO `YYYY-MM-DD`.
 */

/** A newly registered identity. */
export interface RegisteredUser { userId: string; role: string; }

/** Stored credential + account state for a login attempt. */
export interface CredentialRecord { userId: string; role: string; status: string; passwordHash: string; }

/** Profile + KYC state (date of birth as ISO `YYYY-MM-DD`, or null until basic KYC). */
export interface ProfileRow {
  userId: string; username: string; role: string; status: string;
  fullName: string | null; dateOfBirth: string | null; kycStatus: string;
}

/** An affiliate (marketer) enrollment: the stable referral code + commission terms + current role. */
export interface AffiliateView {
  userId: string; referralCode: string; commissionRate: number; status: string; role: string;
}

/** Result of a daily commission-accrual run. */
export interface AffiliateAccrualResult { buckets: number; totalCommissionCents: number; }

export interface IdentityRepository {
  /**
   * Atomically create profile + wallet + credentials. An optional referral code (already
   * format-validated + upper-cased by the caller) attributes the new account to an active
   * affiliate (first-touch, permanent); an unknown/suspended code is ignored so a stale link
   * never blocks signup. Throws PHONE_TAKEN / USERNAME_TAKEN / REGISTRATION_CONFLICT.
   */
  register(phone: string, username: string, passwordHash: string, referralCode?: string): Promise<RegisteredUser>;
  /** Load credential + account state by (normalized) phone, or null if no such account. */
  findByPhone(phone: string): Promise<CredentialRecord | null>;
  /** Load the full profile + KYC state by user id, or null if not found. */
  getProfile(userId: string): Promise<ProfileRow | null>;
  /** Set basic KYC (name + DOB). Throws INVALID_NAME / INVALID_DOB / AGE_RESTRICTED / DOB_IMMUTABLE / USER_NOT_FOUND. */
  setBasicProfile(userId: string, fullName: string, dateOfBirth: string): Promise<ProfileRow>;
}

/**
 * AffiliateRepository: durable boundary for the marketer/affiliate domain — enrollment and
 * daily revenue-share accrual (dashboard reads + payouts extend this interface). Maps to the
 * migration 0017/0018 RPCs; the in-memory impl mirrors the same contracts for tests.
 */
export interface AffiliateRepository {
  /** Idempotently enroll the user as an affiliate (marketer) with a stable referral code. Throws USER_NOT_FOUND. */
  enrollAffiliate(userId: string): Promise<AffiliateView>;
  /** Accrue commission for one trading day (`YYYY-MM-DD`) across all referred players. Idempotent. */
  accrueCommissions(period: string): Promise<AffiliateAccrualResult>;
}

/** Re-raise the bare error code the RPCs raise instead of the wrapped pg message. */
function mapPgError(e: unknown): never {
  const msg = (e as { message?: string })?.message ?? String(e);
  const m = msg.match(/(INVALID_PHONE|INVALID_USERNAME|INVALID_HASH|PHONE_TAKEN|USERNAME_TAKEN|REGISTRATION_CONFLICT|INVALID_NAME|INVALID_DOB|AGE_RESTRICTED|DOB_IMMUTABLE|USER_NOT_FOUND)/);
  throw new Error(m ? m[1] : msg);
}

/** Normalize a pg date/timestamp value to an ISO `YYYY-MM-DD` string, or null. */
function toIsoDate(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

/** Postgres-backed identity, calling the 0015/0016 RPCs + profile reads. */
export class PgIdentityRepository implements IdentityRepository, AffiliateRepository {
  constructor(private readonly q: Querier) {}
  async register(phone: string, username: string, passwordHash: string, referralCode?: string): Promise<RegisteredUser> {
    try {
      const r = await this.q.query(
        "select user_id, role from fn_register_user($1,$2,$3,$4)",
        [phone, username, passwordHash, referralCode ?? null]);
      const x = r.rows[0];
      return { userId: String(x.user_id), role: String(x.role) };
    } catch (e) { mapPgError(e); }
  }
  async enrollAffiliate(userId: string): Promise<AffiliateView> {
    try {
      const r = await this.q.query(
        "select referral_code, commission_rate, status, role from fn_affiliate_enroll($1)", [userId]);
      const x = r.rows[0];
      return {
        userId, referralCode: String(x.referral_code),
        commissionRate: Number(x.commission_rate), status: String(x.status), role: String(x.role),
      };
    } catch (e) { mapPgError(e); }
  }
  async accrueCommissions(period: string): Promise<AffiliateAccrualResult> {
    const r = await this.q.query(
      "select buckets, total_commission from fn_accrue_affiliate_commissions($1)", [period]);
    const x = r.rows[0];
    return { buckets: Number(x.buckets), totalCommissionCents: Number(x.total_commission) };
  }
  async findByPhone(phone: string): Promise<CredentialRecord | null> {
    const r = await this.q.query(
      `select p.id, p.role, p.status, c.password_hash
         from profiles p join user_credentials c on c.user_id = p.id
        where p.phone = $1`, [phone]);
    if (!r.rows.length) return null;
    const x = r.rows[0];
    return { userId: String(x.id), role: String(x.role), status: String(x.status), passwordHash: String(x.password_hash) };
  }
  async getProfile(userId: string): Promise<ProfileRow | null> {
    const r = await this.q.query(
      "select id, username, role, status, full_name, date_of_birth, kyc_status from profiles where id = $1", [userId]);
    if (!r.rows.length) return null;
    return this.rowToProfile(r.rows[0]);
  }
  async setBasicProfile(userId: string, fullName: string, dateOfBirth: string): Promise<ProfileRow> {
    try {
      await this.q.query("select user_id from fn_set_basic_profile($1,$2,$3)", [userId, fullName, dateOfBirth]);
    } catch (e) { mapPgError(e); }
    const p = await this.getProfile(userId);
    if (!p) throw new Error("USER_NOT_FOUND");
    return p;
  }
  private rowToProfile(x: Record<string, unknown>): ProfileRow {
    return {
      userId: String(x.id), username: String(x.username), role: String(x.role), status: String(x.status),
      fullName: x.full_name == null ? null : String(x.full_name),
      dateOfBirth: toIsoDate(x.date_of_birth), kycStatus: String(x.kyc_status),
    };
  }
}

interface MemUser {
  userId: string; phone: string; username: string; role: string; status: string;
  passwordHash: string; fullName: string | null; dateOfBirth: string | null; kycStatus: string;
  referredBy: string | null;
}

interface MemAffiliate { userId: string; referralCode: string; commissionRate: number; status: string; }
interface MemPlay { referredUser: string; period: string; stakeCents: number; payoutCents: number; openedAtMs: number; }
interface MemCommission { affiliateId: string; referredUser: string; period: string; ggr: number; commission: number; status: string; }

/** In-memory identity store mirroring the RPC contracts (tests + dev). */
export class InMemoryIdentityRepository implements IdentityRepository, AffiliateRepository {
  private readonly byPhone = new Map<string, MemUser>();
  private readonly byId = new Map<string, MemUser>();
  private readonly usernames = new Set<string>();
  private readonly affiliates = new Map<string, MemAffiliate>();      // userId -> affiliate
  private readonly byReferralCode = new Map<string, string>();         // code -> userId
  private readonly referrals: Array<{ affiliateId: string; referredUser: string; createdAtMs: number }> = [];
  private readonly plays: MemPlay[] = [];
  private readonly commissions: MemCommission[] = [];
  async register(phone: string, username: string, passwordHash: string, referralCode?: string): Promise<RegisteredUser> {
    if (phone.length < 8) throw new Error("INVALID_PHONE");
    if (username.length < 3) throw new Error("INVALID_USERNAME");
    if (passwordHash.length < 20) throw new Error("INVALID_HASH");
    if (this.byPhone.has(phone)) throw new Error("PHONE_TAKEN");
    if (this.usernames.has(username)) throw new Error("USERNAME_TAKEN");
    const u: MemUser = {
      userId: randomUUID(), phone, username, role: "player", status: "active",
      passwordHash, fullName: null, dateOfBirth: null, kycStatus: "none", referredBy: null,
    };
    this.byPhone.set(phone, u); this.byId.set(u.userId, u); this.usernames.add(username);
    // First-touch, permanent attribution: an unknown/suspended code is silently ignored.
    if (referralCode) {
      const affUserId = this.byReferralCode.get(referralCode.toUpperCase());
      const aff = affUserId ? this.affiliates.get(affUserId) : undefined;
      if (aff && aff.status === "active" && aff.userId !== u.userId) {
        u.referredBy = aff.userId;
        this.referrals.push({ affiliateId: aff.userId, referredUser: u.userId, createdAtMs: Date.now() });
      }
    }
    return { userId: u.userId, role: u.role };
  }
  async findByPhone(phone: string): Promise<CredentialRecord | null> {
    const u = this.byPhone.get(phone);
    return u ? { userId: u.userId, role: u.role, status: u.status, passwordHash: u.passwordHash } : null;
  }
  async getProfile(userId: string): Promise<ProfileRow | null> {
    const u = this.byId.get(userId);
    return u ? this.toProfile(u) : null;
  }
  async setBasicProfile(userId: string, fullName: string, dateOfBirth: string): Promise<ProfileRow> {
    const u = this.byId.get(userId);
    if (!u) throw new Error("USER_NOT_FOUND");
    if (u.dateOfBirth != null && u.dateOfBirth !== dateOfBirth) throw new Error("DOB_IMMUTABLE");
    u.dateOfBirth = u.dateOfBirth ?? dateOfBirth;
    u.fullName = fullName;
    u.kycStatus = "basic";
    return this.toProfile(u);
  }
  async enrollAffiliate(userId: string): Promise<AffiliateView> {
    const u = this.byId.get(userId);
    if (!u) throw new Error("USER_NOT_FOUND");
    let aff = this.affiliates.get(userId);
    if (!aff) {
      let code: string;
      do { code = genReferralCode(); } while (this.byReferralCode.has(code));
      aff = { userId, referralCode: code, commissionRate: 0.2, status: "active" };
      this.affiliates.set(userId, aff);
      this.byReferralCode.set(code, userId);
      if (u.role === "player") u.role = "marketer"; // never downgrade a privileged role
    }
    return { userId, referralCode: aff.referralCode, commissionRate: aff.commissionRate, status: aff.status, role: u.role };
  }
  async accrueCommissions(period: string): Promise<AffiliateAccrualResult> {
    let buckets = 0; let total = 0;
    for (const [affUserId, aff] of this.affiliates) {
      const referred = this.referrals.filter((r) => r.affiliateId === affUserId).map((r) => r.referredUser);
      for (const ru of referred) {
        const dayPlays = this.plays.filter((p) => p.referredUser === ru && p.period === period);
        if (dayPlays.length === 0) continue;
        const ggr = Math.max(0, dayPlays.reduce((s, p) => s + (p.stakeCents - p.payoutCents), 0));
        if (ggr <= 0) continue;
        const commission = Math.floor(ggr * aff.commissionRate);
        const existing = this.commissions.find((c) => c.affiliateId === affUserId && c.referredUser === ru && c.period === period);
        if (existing) {
          if (existing.status !== "accrued") continue; // paid/reversed buckets are never re-touched
          existing.ggr = ggr; existing.commission = commission;
        } else {
          this.commissions.push({ affiliateId: affUserId, referredUser: ru, period, ggr, commission, status: "accrued" });
        }
        buckets += 1; total += commission;
      }
    }
    return { buckets, totalCommissionCents: total };
  }
  /** Test/dev seam: record a settled play for a referred user on a trading day (drives accrual + turnover). */
  recordSettledPlay(referredUser: string, period: string, stakeCents: number, payoutCents: number, openedAtMs: number = Date.now()): void {
    this.plays.push({ referredUser, period, stakeCents, payoutCents, openedAtMs });
  }
  private toProfile(u: MemUser): ProfileRow {
    return {
      userId: u.userId, username: u.username, role: u.role, status: u.status,
      fullName: u.fullName, dateOfBirth: u.dateOfBirth, kycStatus: u.kycStatus,
    };
  }
  /** Test seam: flip an account's status (active | suspended | banned). */
  setStatus(phone: string, status: string): void {
    const u = this.byPhone.get(phone);
    if (u) u.status = status;
  }
  /** Test seam: the affiliate a user was attributed to at signup, or null. */
  referredByOf(userId: string): string | null {
    return this.byId.get(userId)?.referredBy ?? null;
  }
  /** Test seam: how many referrals an affiliate has accrued. */
  referralCount(affiliateId: string): number {
    return this.referrals.filter((r) => r.affiliateId === affiliateId).length;
  }
}

/** Generate a referral code from the canonical alphabet (in-memory mirror of the DB generator). */
function genReferralCode(): string {
  let s = "";
  for (let i = 0; i < REFERRAL_CODE_LENGTH; i++) s += REFERRAL_CODE_ALPHABET.charAt(randomInt(REFERRAL_CODE_ALPHABET.length));
  return s;
}
