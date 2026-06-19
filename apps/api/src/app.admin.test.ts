import { test } from "node:test";
import assert from "node:assert/strict";
import { startTestApi, type TestApi } from "./testutil.js";

const json = (res: Response): Promise<any> => res.json() as Promise<any>;

interface ReqOpts { token?: string; body?: unknown; }
function req(api: TestApi, method: string, path: string, opts: ReqOpts = {}): Promise<Response> {
  const headers: Record<string, string> = {};
  if (opts.token) headers["authorization"] = `Bearer ${opts.token}`;
  const init: RequestInit = { method, headers };
  if (opts.body !== undefined) {
    headers["content-type"] = "application/json";
    init.body = JSON.stringify(opts.body);
  }
  return fetch(`${api.baseUrl}${path}`, init);
}

async function register(api: TestApi, phone: string, username: string, body: Record<string, unknown> = {}): Promise<string> {
  const res = await req(api, "POST", "/api/v1/auth/register", { body: { phone, username, password: "Password1", ...body } });
  assert.equal(res.status, 201, `register ${username} -> ${res.status}`);
  return (await json(res)).userId as string;
}

test("admin routes are role-gated: a player token is forbidden", async () => {
  const api = await startTestApi();
  try {
    const uid = await register(api, "0712000001", "gateuser");
    const res = await req(api, "GET", "/api/v1/admin/overview", { token: uid }); // role defaults to player
    assert.equal(res.status, 403);
  } finally { await api.close(); }
});

test("admin lists users and reads the overview", async () => {
  const api = await startTestApi();
  try {
    await register(api, "0712000002", "user_a");
    await register(api, "0712000003", "user_b");
    const list = await req(api, "GET", "/api/v1/admin/users", { token: "admin-1:admin" });
    assert.equal(list.status, 200);
    const body = await json(list);
    assert.ok(Array.isArray(body.items) && body.items.length >= 2);
    const ov = await json(await req(api, "GET", "/api/v1/admin/overview", { token: "admin-1:admin" }));
    assert.ok(ov.users.total >= 2);
  } finally { await api.close(); }
});

test("admin suspend blocks login and is audited", async () => {
  const api = await startTestApi();
  try {
    const uid = await register(api, "0712000004", "victim");
    const ok = await req(api, "POST", "/api/v1/auth/login", { body: { phone: "0712000004", password: "Password1" } });
    assert.equal(ok.status, 200);

    const sus = await req(api, "POST", `/api/v1/admin/users/${uid}/suspend`, { token: "admin-9:admin", body: { reason: "abuse" } });
    assert.equal(sus.status, 200);
    assert.equal((await json(sus)).status, "suspended");

    const blocked = await req(api, "POST", "/api/v1/auth/login", { body: { phone: "0712000004", password: "Password1" } });
    assert.equal(blocked.status, 403);

    const audit = await json(await req(api, "GET", "/api/v1/admin/audit", { token: "admin-9:admin" }));
    assert.ok(audit.items.some((a: any) => a.action === "user.status" && a.targetId === uid));
  } finally { await api.close(); }
});

test("admin cannot suspend another admin; a superadmin can", async () => {
  const api = await startTestApi();
  try {
    const uid = await register(api, "0712000005", "staff");
    api.identity.adminSetRole(uid, "admin"); // target is now an admin
    const denied = await req(api, "POST", `/api/v1/admin/users/${uid}/suspend`, { token: "admin-2:admin" });
    assert.equal(denied.status, 403);
    const allowed = await req(api, "POST", `/api/v1/admin/users/${uid}/suspend`, { token: "root-1:superadmin" });
    assert.equal(allowed.status, 200);
  } finally { await api.close(); }
});

test("admin manual balance adjustment credits the wallet, requires a reason, and is audited", async () => {
  const api = await startTestApi();
  try {
    const uid = await register(api, "0712000010", "adj_target");

    const credit = await req(api, "POST", `/api/v1/admin/wallets/${uid}/adjust`, { token: "fin-1:admin", body: { amountCents: 25_000, reason: "manual credit" } });
    assert.equal(credit.status, 200);
    const cb = await json(credit);
    assert.equal(cb.newBalanceCents, 25_000);
    assert.equal(cb.direction, "credit");
    assert.equal(await api.payRepo.getBalance(uid), 25_000);

    // direction:debit applies a negative adjustment regardless of magnitude sign
    const debit = await req(api, "POST", `/api/v1/admin/wallets/${uid}/adjust`, { token: "fin-1:admin", body: { amountCents: 5_000, direction: "debit", reason: "clawback" } });
    assert.equal((await json(debit)).newBalanceCents, 20_000);

    const noReason = await req(api, "POST", `/api/v1/admin/wallets/${uid}/adjust`, { token: "fin-1:admin", body: { amountCents: 1_000 } });
    assert.equal(noReason.status, 400);

    const audit = await json(await req(api, "GET", "/api/v1/admin/audit", { token: "fin-1:admin" }));
    assert.ok(audit.items.some((a: any) => a.action === "balance.adjust" && a.targetId === uid));
  } finally { await api.close(); }
});

test("admin deposits monitor lists deposits and the reconcile read returns a summary + stale list", async () => {
  const api = await startTestApi();
  try {
    const dep = await api.payRepo.createDeposit("u-test", 30_000, "254700000099");
    await api.payRepo.attachStk(dep, "m1", "chk-x"); // -> processing (non-terminal)

    const list = await json(await req(api, "GET", "/api/v1/admin/deposits", { token: "fin-1:admin" }));
    assert.ok(Array.isArray(list.items) && list.items.length >= 1);
    assert.ok(list.items.some((d: any) => d.checkoutRequestId === "chk-x" && d.status === "processing"));

    const rec = await json(await req(api, "GET", "/api/v1/admin/deposits/reconcile?staleMinutes=0", { token: "fin-1:admin" }));
    assert.equal(rec.staleMinutes, 0);
    assert.ok(Array.isArray(rec.summary));
    assert.ok(rec.stale.some((d: any) => d.checkoutRequestId === "chk-x"));
  } finally { await api.close(); }
});

test("admin reports: per-day & per-user JSON, CSV export, and the date-range filter (J4)", async () => {
  const api = await startTestApi();
  try {
    const uid = await register(api, "0712000030", "reporter");
    api.payRepo.seed(uid, 0);

    // A settled play on a fixed trade-date + a success deposit (lands on "today").
    api.identity.recordSettledPlay(uid, "2026-06-10", 10_000, 2_500); // turnover 10000, ggr 7500
    const dep = await api.payRepo.createDeposit(uid, 50_000, "0712000030");
    await api.payRepo.attachStk(dep, "m", "chk-r");
    await api.payRepo.completeDeposit("chk-r", 0, "ok", "RCPT", {});
    const today = new Date().toISOString().slice(0, 10);

    // Per-user JSON.
    const users = (await json(await req(api, "GET", "/api/v1/admin/reports/users", { token: "admin-1:admin" }))).items as any[];
    const urow = users.find((r) => r.userId === uid)!;
    assert.equal(urow.turnoverCents, 10_000);
    assert.equal(urow.ggrCents, 7_500);
    assert.equal(urow.depositsCents, 50_000);

    // Per-day JSON: game day carries turnover/GGR; the deposit day carries the cash.
    const daily = (await json(await req(api, "GET", "/api/v1/admin/reports/daily", { token: "admin-1:admin" }))).items as any[];
    const d10 = daily.find((r) => r.date === "2026-06-10")!;
    assert.equal(d10.turnoverCents, 10_000);
    assert.equal(d10.ggrCents, 7_500);
    assert.equal(daily.find((r) => r.date === today)!.depositsCents, 50_000);

    // CSV export: content-type + header + a data row.
    const csvRes = await req(api, "GET", "/api/v1/admin/reports/daily?format=csv", { token: "admin-1:admin" });
    assert.equal(csvRes.status, 200);
    assert.match(csvRes.headers.get("content-type") ?? "", /text\/csv/);
    const csvLines = (await csvRes.text()).trim().split("\r\n");
    assert.equal(csvLines[0], "date,deposits_cents,withdrawals_cents,turnover_cents,ggr_cents");
    assert.ok(csvLines.some((l) => l.startsWith("2026-06-10,")));

    // Date-range filter excludes the old game day.
    const filtered = (await json(await req(api, "GET", "/api/v1/admin/reports/daily?from=2030-01-01", { token: "admin-1:admin" }))).items as any[];
    assert.ok(!filtered.some((r) => r.date === "2026-06-10"));

    // Malformed date -> 400; player token -> 403.
    assert.equal((await req(api, "GET", "/api/v1/admin/reports/daily?from=2026/06/10", { token: "admin-1:admin" })).status, 400);
    assert.equal((await req(api, "GET", "/api/v1/admin/reports/daily", { token: uid })).status, 403);
  } finally { await api.close(); }
});

// ──────────────────────────────────────────────── J5: game config + RTP monitor + seed rotation ──

test("J5 game config: admin reads; only superadmin edits; validates; audited", async () => {
  const api = await startTestApi();
  try {
    const cfg = await json(await req(api, "GET", "/api/v1/admin/game-config", { token: "admin-1:admin" }));
    assert.equal(cfg.houseEdge, 0.75);
    assert.equal(cfg.rtpTarget, 0.25);

    // a day-to-day admin cannot edit config (superadmin only)
    assert.equal((await req(api, "PATCH", "/api/v1/admin/game-config", { token: "admin-1:admin", body: { houseEdge: 0.7 } })).status, 403);

    // superadmin edits a partial patch; rtpTarget is recomputed from house_edge
    const upd = await req(api, "PATCH", "/api/v1/admin/game-config", { token: "root:superadmin", body: { houseEdge: 0.7, maxStakeCents: 6_000_000 } });
    assert.equal(upd.status, 200);
    const u = await json(upd);
    assert.equal(u.houseEdge, 0.7);
    assert.ok(Math.abs(u.rtpTarget - 0.3) < 1e-9);
    assert.equal(u.maxStakeCents, 6_000_000);
    assert.equal(u.minStakeCents, 5000); // untouched key preserved

    // out-of-range value -> 400; non-integer cents -> 400; empty patch -> 400
    assert.equal((await req(api, "PATCH", "/api/v1/admin/game-config", { token: "root:superadmin", body: { houseEdge: 1.5 } })).status, 400);
    assert.equal((await req(api, "PATCH", "/api/v1/admin/game-config", { token: "root:superadmin", body: { minStakeCents: 50.5 } })).status, 400);
    assert.equal((await req(api, "PATCH", "/api/v1/admin/game-config", { token: "root:superadmin", body: {} })).status, 400);

    const audit = await json(await req(api, "GET", "/api/v1/admin/audit", { token: "root:superadmin" }));
    assert.ok(audit.items.some((a: any) => a.action === "game.config"));
  } finally { await api.close(); }
});

test("J5 RTP monitor: target derived from house_edge, rolling windows, no alert on empty data", async () => {
  const api = await startTestApi();
  try {
    const rtp = await json(await req(api, "GET", "/api/v1/admin/rtp", { token: "admin-1:admin" }));
    assert.equal(rtp.targetRtp, 0.25);
    assert.ok(Array.isArray(rtp.windows) && rtp.windows.length === 3);
    assert.equal(rtp.windows[2].window, "all");
    assert.equal(rtp.windows[2].realisedRtp, null); // no settled positions yet
    assert.equal(rtp.alert, false);
    // player is forbidden
    const uid = await register(api, "0712220001", "rtp_player");
    assert.equal((await req(api, "GET", "/api/v1/admin/rtp", { token: uid })).status, 403);
  } finally { await api.close(); }
});

test("J5 seed rotation: superadmin-only, future-day-only, bumps version, listed + audited", async () => {
  const api = await startTestApi();
  try {
    // day-to-day admin cannot rotate
    assert.equal((await req(api, "POST", "/api/v1/admin/seeds/rotate", { token: "admin-1:admin", body: { tradeDate: "2999-01-01" } })).status, 403);
    // malformed date -> 400; past date -> 409
    assert.equal((await req(api, "POST", "/api/v1/admin/seeds/rotate", { token: "root:superadmin", body: { tradeDate: "nope" } })).status, 400);
    assert.equal((await req(api, "POST", "/api/v1/admin/seeds/rotate", { token: "root:superadmin", body: { tradeDate: "2000-01-01" } })).status, 409);

    // future day rotates: version 1 then 2
    const r1 = await json(await req(api, "POST", "/api/v1/admin/seeds/rotate", { token: "root:superadmin", body: { tradeDate: "2999-01-01" } }));
    assert.equal(r1.seedVersion, 1);
    const r2 = await json(await req(api, "POST", "/api/v1/admin/seeds/rotate", { token: "root:superadmin", body: { tradeDate: "2999-01-01" } }));
    assert.equal(r2.seedVersion, 2);

    const seeds = await json(await req(api, "GET", "/api/v1/admin/seeds", { token: "admin-1:admin" }));
    assert.ok(seeds.items.some((s: any) => s.tradeDate === "2999-01-01" && s.seedVersion === 2));

    const audit = await json(await req(api, "GET", "/api/v1/admin/audit", { token: "root:superadmin" }));
    assert.ok(audit.items.some((a: any) => a.action === "game.seed_rotate" && a.targetId === "2999-01-01"));
  } finally { await api.close(); }
});

// ──────────────────────────────────────────── J6: affiliate payout queue + chat moderation ──────

test("J6 affiliate payout queue: admin lists requests and approves (audited)", async () => {
  const api = await startTestApi();
  try {
    const affId = await register(api, "0712345678", "marketer");
    const code: string = (await json(await req(api, "POST", "/api/v1/affiliate/enroll", { token: affId }))).referralCode;
    const refId = await register(api, "0722333444", "referred", { referral_code: code });
    api.identity.recordSettledPlay(refId, "2026-06-10", 10000, 2500); // GGR 7500 -> 20% = 1500
    await req(api, "POST", "/api/v1/admin/affiliate/accrue", { token: `${affId}:admin`, body: { date: "2026-06-10" } });
    const payout = await json(await req(api, "POST", "/api/v1/affiliate/payouts", { token: `${affId}:marketer` }));

    // queue list, filtered to requested
    const queue = await json(await req(api, "GET", "/api/v1/admin/affiliate/payouts?status=requested", { token: "admin-1:admin" }));
    assert.ok(queue.items.some((p: any) => p.payoutId === payout.payoutId && p.amountCents === 1500 && p.username === "marketer"));

    // approve dispatches B2C (stub) and is audited
    const appr = await req(api, "POST", `/api/v1/admin/affiliate/payouts/${payout.payoutId}/approve`, { token: "admin-9:admin" });
    assert.equal(appr.status, 200);
    assert.equal((await json(appr)).approved, true);

    const audit = await json(await req(api, "GET", "/api/v1/admin/audit", { token: "admin-9:admin" }));
    assert.ok(audit.items.some((a: any) => a.action === "affiliate.payout.approve" && a.targetId === payout.payoutId));

    // a player cannot view the queue
    const uid = await register(api, "0712220009", "pq_player");
    assert.equal((await req(api, "GET", "/api/v1/admin/affiliate/payouts", { token: uid })).status, 403);
  } finally { await api.close(); }
});

test("J6 chat moderation: list, hide (excluded), includeHidden, unhide, 404 + audit", async () => {
  const api = await startTestApi();
  try {
    const msg = await api.engage.insertChat({ userId: null, username: "ann", message: "gm everyone" });

    // default list shows the visible message
    let list = await json(await req(api, "GET", "/api/v1/admin/chat", { token: "admin-1:admin" }));
    assert.ok(list.items.some((m: any) => m.id === msg.id && m.isHidden === false));

    // hide it -> excluded from the default list, present (hidden) with includeHidden
    assert.equal((await req(api, "POST", `/api/v1/admin/chat/${msg.id}/hide`, { token: "mod-1:admin" })).status, 200);
    list = await json(await req(api, "GET", "/api/v1/admin/chat", { token: "admin-1:admin" }));
    assert.ok(!list.items.some((m: any) => m.id === msg.id));
    const all = await json(await req(api, "GET", "/api/v1/admin/chat?includeHidden=true", { token: "admin-1:admin" }));
    assert.ok(all.items.some((m: any) => m.id === msg.id && m.isHidden === true));

    // hiding again is a no-op -> 404; unhide restores it
    assert.equal((await req(api, "POST", `/api/v1/admin/chat/${msg.id}/hide`, { token: "mod-1:admin" })).status, 404);
    assert.equal((await req(api, "POST", `/api/v1/admin/chat/${msg.id}/unhide`, { token: "mod-1:admin" })).status, 200);
    assert.equal((await req(api, "POST", "/api/v1/admin/chat/999999/hide", { token: "mod-1:admin" })).status, 404);

    const audit = await json(await req(api, "GET", "/api/v1/admin/audit", { token: "mod-1:admin" }));
    assert.ok(audit.items.some((a: any) => a.action === "chat.hide"));
    assert.ok(audit.items.some((a: any) => a.action === "chat.unhide"));
  } finally { await api.close(); }
});
