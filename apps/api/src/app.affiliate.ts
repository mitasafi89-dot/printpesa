import { Router, ApiError, requireAuth, requireRole, type Ctx } from "./http.js";
import type { PageQuery } from "@printpesa/engine";
import type { ApiDeps } from "./app.js";

/**
 * Affiliate routes:
 *  - I1: `POST /affiliate/enroll` (marketer enrollment) + referral attribution at registration.
 *  - I2: `POST /admin/affiliate/accrue` (finance_admin) runs the daily revenue-share accrual.
 *  - I3: marketer dashboard reads — `GET /affiliate/summary`, `/affiliate/referrals`,
 *    `/affiliate/commissions` (marketer-gated, cursor-paginated). Thin transport over the engine
 *    AffiliateService — invariants live in the 0017/0018 RPCs.
 */

const BASE = "/api/v1";

/** Affiliate domain-error code -> HTTP status. */
const AFFILIATE_STATUS: Readonly<Record<string, number>> = {
  USER_NOT_FOUND: 404,
  NOT_FOUND: 404,
  NOT_AFFILIATE: 404,
  INVALID_PERIOD: 400,
};

/** Parse cursor pagination params from the query string (limit clamped by the repository). */
function pageQuery(ctx: Ctx): PageQuery {
  const limitRaw = ctx.query.get("limit");
  return { limit: limitRaw === null ? undefined : Number(limitRaw), cursor: ctx.query.get("cursor") };
}

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

/** Register the affiliate routes (enrollment + dashboard require a bearer token; accrual is finance_admin). */
export function registerAffiliateRoutes(router: Router, deps: ApiDeps): void {
  const auth = requireAuth(deps.verifier);
  const financeAdmin = requireRole("finance_admin");
  const marketer = requireRole("marketer");

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

  // ── Marketer dashboard (I3) ──
  router.get(`${BASE}/affiliate/summary`, auth, marketer, async (ctx: Ctx) =>
    domain(() => deps.affiliate.summary(ctx.claims!.userId)));

  router.get(`${BASE}/affiliate/referrals`, auth, marketer, async (ctx: Ctx) =>
    domain(() => deps.affiliate.listReferrals(ctx.claims!.userId, pageQuery(ctx))));

  router.get(`${BASE}/affiliate/commissions`, auth, marketer, async (ctx: Ctx) =>
    domain(() => deps.affiliate.listCommissions(ctx.claims!.userId, pageQuery(ctx))));

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
