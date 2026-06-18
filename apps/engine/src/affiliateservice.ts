import type { AffiliateView, IdentityRepository } from "./identity.js";

/**
 * AffiliateService (Issue I1) — marketer enrollment. Any authenticated player can enroll once
 * to become a marketer and receive a stable, unique referral code (`commission_rate` 20%).
 * Attribution itself happens atomically at registration (see AuthService.register +
 * fn_register_user), so this service owns only the enrollment side. The idempotency,
 * code-minting and role promotion invariants live in the migration-0017 RPC behind the
 * IdentityRepository; this layer is the transport-agnostic seam the HTTP API binds to.
 */
export interface AffiliateEnrollment extends AffiliateView {
  /** Relative share path for the marketer's link; the frontend prefixes its public origin. */
  referralPath: string;
}

export class AffiliateService {
  constructor(private readonly repo: Pick<IdentityRepository, "enrollAffiliate">) {}

  /** Idempotently enroll the caller as a marketer and return their referral terms. Throws USER_NOT_FOUND. */
  async enroll(userId: string): Promise<AffiliateEnrollment> {
    const a = await this.repo.enrollAffiliate(userId);
    return { ...a, referralPath: `/r/${a.referralCode}` };
  }
}
