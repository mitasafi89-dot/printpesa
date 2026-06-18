import { Router, ApiError, requireAuth, requireRole, type Ctx } from "./http.js";
import type { ApiDeps } from "./app.js";

/**
 * Affiliate routes:
 *  - I1: `POST /affiliate/enroll` (marketer enrollment) + referral attribution at registration.
 *  - I2: `POST /admin/affiliate/accrue` (finance_admin) runs the daily revenue-share accrual for
 *    a trading day. Thin transport over the engine AffiliateService — invariants live in the
 *    0017/0018 RPCs.
 */

const BASE = "/api/v1";

/** Affiliate domain-error code -> HTTP status. */
const AFFILIATE_STATUS: Readonly<Record<string, number>> = {
  USER_NOT_FOUND: 404,
  NOT_FOUND: 404,
  INVALID_PERIOD: 400,
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

/** Register the affiliate routes (enrollment requires a bearer token; accrual is finance_admin). */
export function registerAffiliateRoutes(router: Router, deps: ApiDeps): void {
  const auth = requireAuth(deps.verifier);
  const financeAdmin = requireRole("finance_admin");

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

  // Operational: run the daily revenue-share accrual for a trading day (idempotent). In
  // production a daily cron calls this (or the RPC directly via service role).
  router.post(`${BASE}/admin/affiliate/accrue`, auth, financeAdmin, async (ctx: Ctx) => {
    const body = ctx.body && typeof ctx.body === "object" ? (ctx.body as Record<string, unknown>) : {};
    const period = body.date;
    if (typeof period !== "string") throw new ApiError("VALIDATION", "date (YYYY-MM-DD) is required", 400);
    const r = await domain(() => deps.affiliate.accrueDaily(period));
    return { period, buckets: r.buckets, totalCommissionCents: r.totalCommissionCents };
  });
}
