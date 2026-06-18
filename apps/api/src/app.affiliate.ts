import { Router, ApiError, requireAuth, type Ctx } from "./http.js";
import type { ApiDeps } from "./app.js";

/**
 * Affiliate routes (Issue I1): `POST /affiliate/enroll` turns the authenticated caller into a
 * marketer and returns their stable referral code + share path. Thin transport over the engine
 * AffiliateService — idempotency, code-minting and role promotion live in the 0017 RPC. The
 * matching attribution side ("carry a code through signup") is handled by POST /auth/register.
 */

const BASE = "/api/v1";

/** Affiliate domain-error code -> HTTP status. */
const AFFILIATE_STATUS: Readonly<Record<string, number>> = {
  USER_NOT_FOUND: 404,
  NOT_FOUND: 404,
};

/** Run an AffiliateService call, translating thrown domain error codes into controlled ApiErrors. */
async function domain<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ApiError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    const code = message.split(":")[0]!.trim();
    const status = AFFILIATE_STATUS[code];
    if (status) throw new ApiError(code, message, status);
    throw err;
  }
}

/** Register the affiliate routes (enrollment requires a bearer token). */
export function registerAffiliateRoutes(router: Router, deps: ApiDeps): void {
  const auth = requireAuth(deps.verifier);

  router.post(`${BASE}/affiliate/enroll`, auth, async (ctx: Ctx) => {
    const e = await domain(() => deps.affiliate.enroll(ctx.claims!.userId));
    return {
      referralCode: e.referralCode,
      commissionRate: e.commissionRate,
      status: e.status,
      role: e.role,
      referralPath: e.referralPath,
    };
  });
}
