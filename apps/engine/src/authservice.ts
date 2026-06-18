import { randomBytes, scrypt as _scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";
import { SignJWT } from "jose";
import { validatePassword, validateUsername, validateFullName, validateDateOfBirth, validateReferralCode, ageInYears, MIN_AGE_YEARS, normalizeMsisdn } from "@printpesa/shared";
import type { IdentityRepository, ProfileRow } from "./identity.js";

/**
 * AuthService — self-managed phone + password authentication (no OTP, no Supabase Auth).
 * Hashes with scrypt (timing-safe verify) and self-issues HS256 JWTs signed with the same
 * secret the engine's `makeVerifier` already checks (SUPABASE_JWT_SECRET), so every existing
 * authenticated route/WS keeps working unchanged. Money/identity correctness (atomic insert,
 * uniqueness, RLS lockdown) lives in the migration-0015 RPC behind IdentityRepository; this
 * layer adds input validation, hashing, the login status gate, and anti-enumeration.
 */

/** Promise wrapper around node's scrypt that accepts the cost options (the promisify overload drops them). */
function scrypt(password: string, salt: Buffer, keylen: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    _scrypt(password, salt, keylen, options, (err, dk) => (err ? reject(err) : resolve(dk as Buffer)));
  });
}

// scrypt cost: N=2^15, r=8, p=1 -> 32-byte key from a 16-byte random salt. 128*N*r bytes
// of memory (~33.5 MB) requires a raised maxmem ceiling.
const SCRYPT_N = 1 << 15;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEYLEN = 32;
const SALTLEN = 16;
const MAXMEM = 64 * 1024 * 1024;
const SCHEME = "scrypt";

/** Hash a password -> `scrypt$N$r$p$salt_b64$hash_b64` (self-describing so cost can be re-tuned later). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALTLEN);
  const dk = (await scrypt(password, salt, KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: MAXMEM })) as Buffer;
  return `${SCHEME}$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("base64")}$${dk.toString("base64")}`;
}

/** Constant-time verify against a stored `scrypt$...` hash. Returns false on any malformed input. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== SCHEME) return false;
  const N = Number(parts[1]); const r = Number(parts[2]); const p = Number(parts[3]);
  if (![N, r, p].every(Number.isInteger) || N < 2 || r < 1 || p < 1) return false;
  const salt = Buffer.from(parts[4]!, "base64");
  const expected = Buffer.from(parts[5]!, "base64");
  if (salt.length === 0 || expected.length === 0) return false;
  let dk: Buffer;
  try { dk = (await scrypt(password, salt, expected.length, { N, r, p, maxmem: MAXMEM })) as Buffer; }
  catch { return false; }
  return dk.length === expected.length && timingSafeEqual(dk, expected);
}

/** A successful authentication: a signed token plus the verified identity. */
export interface AuthSession { token: string; userId: string; role: string; }

/** Profile + KYC view returned by `/me` (ageVerified is computed from dateOfBirth at read time). */
export interface Profile {
  userId: string; username: string; role: string; status: string;
  fullName: string | null; dateOfBirth: string | null; kycStatus: string; ageVerified: boolean;
}

export interface AuthServiceOptions {
  /** HS256 signing secret. Use the same value as SUPABASE_JWT_SECRET so makeVerifier accepts the token. */
  jwtSecret: string;
  /** Token lifetime in seconds (default 7 days). */
  jwtTtlSeconds?: number;
  /** Optional issuer/audience; set them to match the engine's verifier options. */
  issuer?: string;
  audience?: string;
}

const DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60;

// A real scrypt hash of a throwaway secret, verified against when the phone is unknown so a
// failed login costs the same whether or not the account exists (anti-enumeration).
const DUMMY_HASH = hashPassword(randomBytes(24).toString("hex"));

export class AuthService {
  private readonly secret: Uint8Array;
  private readonly ttl: number;
  private readonly issuer: string | undefined;
  private readonly audience: string | undefined;

  constructor(private readonly repo: IdentityRepository, opts: AuthServiceOptions) {
    if (!opts.jwtSecret) throw new Error("JWT_SECRET_REQUIRED");
    this.secret = new TextEncoder().encode(opts.jwtSecret);
    this.ttl = opts.jwtTtlSeconds ?? DEFAULT_TTL_SECONDS;
    this.issuer = opts.issuer;
    this.audience = opts.audience;
  }

  /** Sign an HS256 JWT compatible with makeVerifier (sub = userId, `role` claim). */
  async issueToken(userId: string, role: string): Promise<string> {
    let b = new SignJWT({ role }).setProtectedHeader({ alg: "HS256" }).setSubject(userId)
      .setIssuedAt().setExpirationTime(`${this.ttl}s`);
    if (this.issuer) b = b.setIssuer(this.issuer);
    if (this.audience) b = b.setAudience(this.audience);
    return b.sign(this.secret);
  }

  /**
   * Register a new player: validate -> normalize phone -> hash -> atomic insert -> issue token.
   * An optional referral code is syntactically validated here (malformed -> INVALID_REFERRAL_CODE)
   * and passed through normalized; resolving it to an active affiliate (first-touch attribution)
   * happens atomically inside the register RPC, where an unknown/suspended code is ignored.
   */
  async register(input: { phone: string; username: string; password: string; referralCode?: string }): Promise<AuthSession> {
    const pw = validatePassword(input.password);
    if (!pw.ok) throw new Error(`PASSWORD_${pw.reason}`);
    const un = validateUsername(input.username);
    if (!un.ok) throw new Error(`USERNAME_${un.reason}`);
    const phone = normalizeMsisdn(input.phone); // throws INVALID_PHONE on bad input
    let referralCode: string | undefined;
    if (input.referralCode !== undefined && input.referralCode !== "") {
      const rc = validateReferralCode(input.referralCode);
      if (!rc.ok) throw new Error("INVALID_REFERRAL_CODE");
      referralCode = rc.code;
    }
    const hash = await hashPassword(input.password);
    const { userId, role } = await this.repo.register(phone, input.username, hash, referralCode);
    const token = await this.issueToken(userId, role);
    return { token, userId, role };
  }

  /** Log in: normalize -> constant-time verify -> active-status gate -> issue token. */
  async login(input: { phone: string; password: string }): Promise<AuthSession> {
    let phone: string;
    try { phone = normalizeMsisdn(input.phone); } catch { throw new Error("INVALID_CREDENTIALS"); }
    const rec = await this.repo.findByPhone(phone);
    const ok = await verifyPassword(input.password, rec?.passwordHash ?? (await DUMMY_HASH));
    if (!rec || !ok) throw new Error("INVALID_CREDENTIALS");
    if (rec.status !== "active") throw new Error(`ACCOUNT_${rec.status.toUpperCase()}`); // SUSPENDED / BANNED
    const token = await this.issueToken(rec.userId, rec.role);
    return { token, userId: rec.userId, role: rec.role };
  }

  /** Read the caller's profile + KYC state. Throws NOT_FOUND if no such identity. */
  async me(userId: string): Promise<Profile> {
    const p = await this.repo.getProfile(userId);
    if (!p) throw new Error("NOT_FOUND");
    return toProfileView(p);
  }

  /** Complete basic KYC: validate name + adulthood, persist (DOB immutable once set), return the profile. */
  async completeBasicProfile(userId: string, input: { fullName: string; dateOfBirth: string }): Promise<Profile> {
    const name = validateFullName(input.fullName);
    if (!name.ok) throw new Error(`NAME_${name.reason}`);
    const dob = validateDateOfBirth(input.dateOfBirth);
    if (!dob.ok) throw new Error(dob.reason === "UNDERAGE" ? "AGE_RESTRICTED" : `DOB_${dob.reason}`);
    const p = await this.repo.setBasicProfile(userId, input.fullName, input.dateOfBirth);
    return toProfileView(p);
  }
}

/** Project a stored profile row to the `/me` view, computing ageVerified from the DOB. */
function toProfileView(p: ProfileRow): Profile {
  const ageVerified = p.dateOfBirth != null && ageInYears(p.dateOfBirth) >= MIN_AGE_YEARS;
  return { ...p, ageVerified };
}
