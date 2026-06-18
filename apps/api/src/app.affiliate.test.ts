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

// ───────────────────────────────────────────── enroll ─────────────────────────────────────────
test("POST /affiliate/enroll → 200 mints a code, promotes to marketer, is idempotent", async () => {
  const api = await startTestApi();
  try {
    const userId = await register(api, "0712345678", "alice");

    const res = await req(api, "POST", "/api/v1/affiliate/enroll", { token: userId });
    assert.equal(res.status, 200);
    const body = await json(res);
    assert.equal(typeof body.referralCode, "string");
    assert.equal(body.referralCode.length, 8);
    assert.equal(body.commissionRate, 0.2);
    assert.equal(body.status, "active");
    assert.equal(body.role, "marketer");
    assert.equal(body.referralPath, `/r/${body.referralCode}`);

    const again = await json(await req(api, "POST", "/api/v1/affiliate/enroll", { token: userId }));
    assert.equal(again.referralCode, body.referralCode); // idempotent, stable code
  } finally { await api.close(); }
});

test("POST /affiliate/enroll → 401 without a bearer token", async () => {
  const api = await startTestApi();
  try {
    const res = await req(api, "POST", "/api/v1/affiliate/enroll");
    assert.equal(res.status, 401);
  } finally { await api.close(); }
});

// ─────────────────────────────────────────── attribution ──────────────────────────────────────
test("POST /auth/register with referral_code attributes the new account (first-touch)", async () => {
  const api = await startTestApi();
  try {
    const affId = await register(api, "0712345678", "marketer");
    const enroll = await json(await req(api, "POST", "/api/v1/affiliate/enroll", { token: affId }));
    const code: string = enroll.referralCode;

    const referredId = await register(api, "0722333444", "referred", { referral_code: code.toLowerCase() });
    assert.equal(api.identity.referredByOf(referredId), affId);
    assert.equal(api.identity.referralCount(affId), 1);

    const organicId = await register(api, "0733444555", "organic");
    assert.equal(api.identity.referredByOf(organicId), null);
  } finally { await api.close(); }
});

test("POST /auth/register → 400 INVALID_REFERRAL_CODE on a malformed code", async () => {
  const api = await startTestApi();
  try {
    const res = await req(api, "POST", "/api/v1/auth/register", {
      body: { phone: "0712345678", username: "bob", password: "Password1", referral_code: "bad" },
    });
    assert.equal(res.status, 400);
    assert.equal((await json(res)).error.code, "INVALID_REFERRAL_CODE");
  } finally { await api.close(); }
});

// ─────────────────────────────────────── accrual (admin) ──────────────────────────────────────
test("POST /admin/affiliate/accrue: finance_admin only, accrues 20% of referred GGR", async () => {
  const api = await startTestApi();
  try {
    const affId = await register(api, "0712345678", "marketer");
    const code: string = (await json(await req(api, "POST", "/api/v1/affiliate/enroll", { token: affId }))).referralCode;
    const refId = await register(api, "0722333444", "referred", { referral_code: code });
    api.identity.recordSettledPlay(refId, "2026-06-10", 10000, 2500); // GGR 7500 -> commission 1500

    // a plain player cannot accrue
    const forbidden = await req(api, "POST", "/api/v1/admin/affiliate/accrue", { token: refId, body: { date: "2026-06-10" } });
    assert.equal(forbidden.status, 403);

    // missing date -> 400
    const bad = await req(api, "POST", "/api/v1/admin/affiliate/accrue", { token: `${affId}:finance_admin`, body: {} });
    assert.equal(bad.status, 400);

    // finance_admin succeeds
    const ok = await req(api, "POST", "/api/v1/admin/affiliate/accrue", { token: `${affId}:finance_admin`, body: { date: "2026-06-10" } });
    assert.equal(ok.status, 200);
    const body = await json(ok);
    assert.equal(body.buckets, 1);
    assert.equal(body.totalCommissionCents, 1500);
  } finally { await api.close(); }
});