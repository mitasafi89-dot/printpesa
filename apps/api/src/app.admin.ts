import { Router, ApiError, requireAuth, requireRole, type Ctx } from "./http.js";
import type { PageQuery, AdminUserListQuery, AdminWithdrawalListQuery, AdminDepositListQuery } from "@printpesa/engine";
import type { ApiDeps } from "./app.js";

/**
 * Admin back office routes (J2) — all admin-gated (the hierarchy admits superadmin too):
 *  - GET    /admin/overview                       dashboard KPIs
 *  - GET    /admin/users?role&status&q&cursor      user list (keyset)
 *  - GET    /admin/users/:id                        user detail
 *  - POST   /admin/users/:id/{suspend|ban|reactivate}   set status (audited; 0021 RPC)
 *  - PATCH  /admin/affiliates/:id/rate              set commission rate (audited; 0021 RPC)
 *  - POST   /admin/wallets/:id/adjust               manual credit/debit (J3; audited; 0022 RPC)
 *  - GET    /admin/withdrawals?status&cursor        withdrawal queue (read)
 *  - GET    /admin/deposits?status&cursor           deposits monitor (J3; STK statuses)
 *  - GET    /admin/deposits/reconcile?staleMinutes  deposits reconcile read (J3)
 *  - GET    /admin/audit?cursor                     audit trail (read)
 * Thin transport over the engine AdminService — guards/audit live in the RPCs / in-memory mirror.
 */

const BASE = "/api/v1";

/** Admin domain-error code -> HTTP status. */
const ADMIN_STATUS: Readonly<Record<string, number>> = {
  NOT_AUTHORIZED: 403,
  INSUFFICIENT_PRIVILEGE: 403,
  NO_SELF_ACTION: 409,
  INVALID_STATUS: 400,
  INVALID_RATE: 400,
  INVALID_AMOUNT: 400,
  REASON_REQUIRED: 400,
  INSUFFICIENT_FUNDS: 409,
  USER_NOT_FOUND: 404,
  WALLET_NOT_FOUND: 404,
  NOT_AFFILIATE: 404,
  NOT_FOUND: 404,
};

/** suspend/ban/reactivate -> the account status the RPC applies. */
const STATUS_ACTION: Readonly<Record<string, string>> = { suspend: "suspended", ban: "banned", reactivate: "active" };

/** Run an AdminService call, translating thrown domain error codes into controlled ApiErrors. */
async function domain<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ApiError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    const code = message.split(":")[0]!.trim();
    const status = ADMIN_STATUS[code];
    if (status) throw new ApiError(code, message, status);
    throw err;
  }
}

/** Parse cursor pagination params (limit clamped by the repository). */
function pageQuery(ctx: Ctx): PageQuery {
  const limitRaw = ctx.query.get("limit");
  return { limit: limitRaw === null ? undefined : Number(limitRaw), cursor: ctx.query.get("cursor") };
}

export function registerAdminRoutes(router: Router, deps: ApiDeps): void {
  const auth = requireAuth(deps.verifier);
  const admin = requireRole("admin");

  router.get(`${BASE}/admin/overview`, auth, admin, async () => deps.admin.overview());

  router.get(`${BASE}/admin/users`, auth, admin, async (ctx: Ctx) => {
    const q: AdminUserListQuery = {
      ...pageQuery(ctx),
      role: ctx.query.get("role") ?? undefined,
      status: ctx.query.get("status") ?? undefined,
      q: ctx.query.get("q") ?? undefined,
    };
    return deps.admin.listUsers(q);
  });

  router.get(`${BASE}/admin/users/:id`, auth, admin, async (ctx: Ctx) =>
    domain(() => deps.admin.getUserDetail(ctx.params.id!)));

  for (const action of Object.keys(STATUS_ACTION)) {
    router.post(`${BASE}/admin/users/:id/${action}`, auth, admin, async (ctx: Ctx) => {
      const body = ctx.body && typeof ctx.body === "object" ? (ctx.body as Record<string, unknown>) : {};
      const reason = typeof body.reason === "string" ? body.reason : null;
      return domain(() => deps.admin.setUserStatus(ctx.claims!.userId, ctx.claims!.role ?? "player", ctx.params.id!, STATUS_ACTION[action]!, reason));
    });
  }

  router.patch(`${BASE}/admin/affiliates/:id/rate`, auth, admin, async (ctx: Ctx) => {
    const body = ctx.body && typeof ctx.body === "object" ? (ctx.body as Record<string, unknown>) : {};
    const rate = typeof body.rate === "number" ? body.rate : Number(body.rate);
    if (!Number.isFinite(rate)) throw new ApiError("VALIDATION", "rate (0..1) is required", 400);
    return domain(() => deps.admin.setCommissionRate(ctx.claims!.userId, ctx.claims!.role ?? "player", ctx.params.id!, rate));
  });

  router.post(`${BASE}/admin/wallets/:id/adjust`, auth, admin, async (ctx: Ctx) => {
    const body = ctx.body && typeof ctx.body === "object" ? (ctx.body as Record<string, unknown>) : {};
    const reason = typeof body.reason === "string" ? body.reason : "";
    if (reason.trim() === "") throw new ApiError("REASON_REQUIRED", "reason is required", 400);
    const raw = body.amountCents ?? body.amount;
    const magnitude = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isInteger(magnitude) || magnitude === 0) throw new ApiError("INVALID_AMOUNT", "amountCents must be a non-zero integer (cents)", 400);
    // Optional explicit direction makes the sign unambiguous; otherwise a signed amount is taken as-is.
    const dir = body.direction;
    const signed = dir === "credit" || dir === "debit" ? Math.abs(magnitude) * (dir === "debit" ? -1 : 1) : magnitude;
    return domain(() => deps.admin.adjustBalance(ctx.claims!.userId, ctx.claims!.role ?? "player", ctx.params.id!, signed, reason));
  });

  router.get(`${BASE}/admin/withdrawals`, auth, admin, async (ctx: Ctx) => {
    const q: AdminWithdrawalListQuery = { ...pageQuery(ctx), status: ctx.query.get("status") ?? undefined };
    return deps.admin.listWithdrawals(q);
  });

  router.get(`${BASE}/admin/deposits/reconcile`, auth, admin, async (ctx: Ctx) => {
    const raw = ctx.query.get("staleMinutes");
    const n = raw === null ? 15 : Number(raw);
    return deps.admin.depositsReconcile(Number.isFinite(n) && n >= 0 ? n : 15);
  });

  router.get(`${BASE}/admin/deposits`, auth, admin, async (ctx: Ctx) => {
    const q: AdminDepositListQuery = { ...pageQuery(ctx), status: ctx.query.get("status") ?? undefined };
    return deps.admin.listDeposits(q);
  });

  router.get(`${BASE}/admin/audit`, auth, admin, async (ctx: Ctx) => deps.admin.listAudit(pageQuery(ctx)));
}
