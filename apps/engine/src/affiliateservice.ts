import type { AffiliateView, AffiliateAccrualResult, AffiliateRepository } from "./identity.js";

/**
 * AffiliateService (Issue I1+) — the marketer/affiliate domain seam the HTTP API binds to.
 *  - `enroll`: idempotent marketer enrollment (stable referral code, player->marketer).
 *  - `accrueDaily`: daily 20%-of-GGR revenue-share accrual for one trading day.
 * Attribution itself happens atomically at registration (AuthService.register + the register
 * RPC). All money/state invariants live in the migration RPCs behind AffiliateRepository.
 */
export interface AffiliateEnrollment extends AffiliateView {
  /** Relative share path for the marketer's link; the frontend prefixes its public origin. */
  referralPath: string;
}

const PERIOD_RE = /^\d{4}-\d{2}-\d{2}$/;

export class AffiliateService {
  constructor(private readonly repo: AffiliateRepository) {}

  /** Idempotently enroll the caller as a marketer and return their referral terms. Throws USER_NOT_FOUND. */
  async enroll(userId: string): Promise<AffiliateEnrollment> {
    const a = await this.repo.enrollAffiliate(userId);
    return { ...a, referralPath: `/r/${a.referralCode}` };
  }

  /** Accrue commission for one trading day (`YYYY-MM-DD`). Idempotent. Throws INVALID_PERIOD. */
  async accrueDaily(period: string): Promise<AffiliateAccrualResult> {
    if (typeof period !== "string" || !PERIOD_RE.test(period)) throw new Error("INVALID_PERIOD");
    return this.repo.accrueCommissions(period);
  }
}
