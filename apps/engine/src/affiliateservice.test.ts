import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryIdentityRepository } from "./identity.js";
import { AffiliateService } from "./affiliateservice.js";
import { AuthService } from "./authservice.js";
import { REFERRAL_CODE_ALPHABET, REFERRAL_CODE_LENGTH } from "@printpesa/shared";

const HASH = "scrypt$32768$8$1$abcdefghijklmnop$abcdefghijklmnop"; // length >= 20 (repo gate)
const JWT = { jwtSecret: "test-secret-which-is-long-enough-123456", jwtTtlSeconds: 3600 };

test("AffiliateService.enroll: mints a canonical code, promotes player -> marketer, idempotent", async () => {
  const repo = new InMemoryIdentityRepository();
  const svc = new AffiliateService(repo);
  const { userId } = await repo.register("254700000001", "marketer1", HASH);

  const first = await svc.enroll(userId);
  assert.equal(first.referralCode.length, REFERRAL_CODE_LENGTH);
  for (const ch of first.referralCode) assert.ok(REFERRAL_CODE_ALPHABET.includes(ch), `bad char ${ch}`);
  assert.equal(first.commissionRate, 0.2);
  assert.equal(first.status, "active");
  assert.equal(first.role, "marketer");
  assert.equal(first.referralPath, `/r/${first.referralCode}`);

  const second = await svc.enroll(userId);
  assert.equal(second.referralCode, first.referralCode); // stable + idempotent
  assert.equal(second.role, "marketer");
});

test("AffiliateService.enroll: throws USER_NOT_FOUND for an unknown user", async () => {
  const svc = new AffiliateService(new InMemoryIdentityRepository());
  await assert.rejects(svc.enroll("00000000-0000-0000-0000-000000000000"), /USER_NOT_FOUND/);
});

test("register attribution: first-touch via a valid code (case-insensitive); unknown/absent ignored", async () => {
  const repo = new InMemoryIdentityRepository();
  const svc = new AffiliateService(repo);
  const aff = await repo.register("254700000002", "marketer2", HASH);
  const { referralCode } = await svc.enroll(aff.userId);

  const referred = await repo.register("254700000003", "player_a", HASH, referralCode.toLowerCase());
  assert.equal(repo.referredByOf(referred.userId), aff.userId);
  assert.equal(repo.referralCount(aff.userId), 1);

  const noCode = await repo.register("254700000004", "player_b", HASH);
  assert.equal(repo.referredByOf(noCode.userId), null);

  const unknown = await repo.register("254700000005", "player_c", HASH, "ZZZZ2222"); // well-formed, unknown
  assert.equal(repo.referredByOf(unknown.userId), null);
  assert.equal(repo.referralCount(aff.userId), 1); // unchanged
});

test("AuthService.register: rejects a malformed referral code, attributes a valid one", async () => {
  const repo = new InMemoryIdentityRepository();
  const auth = new AuthService(repo, JWT);
  const svc = new AffiliateService(repo);
  const aff = await auth.register({ phone: "0700000006", username: "marketer3", password: "Password1" });
  const { referralCode } = await svc.enroll(aff.userId);

  await assert.rejects(
    auth.register({ phone: "0700000007", username: "player_d", password: "Password1", referralCode: "bad" }),
    /INVALID_REFERRAL_CODE/,
  );
  const ok = await auth.register({ phone: "0700000008", username: "player_e", password: "Password1", referralCode });
  assert.equal(repo.referredByOf(ok.userId), aff.userId);
});

test("accrueDaily: 20% of zero-floored daily GGR; idempotent; rejects a malformed period", async () => {
  const repo = new InMemoryIdentityRepository();
  const svc = new AffiliateService(repo);
  const aff = await repo.register("254700000010", "mk_acc", HASH);
  const code = (await svc.enroll(aff.userId)).referralCode;
  const ref = await repo.register("254700000011", "pl_acc", HASH, code);

  // loss day: (10000-2500) + (5000-0) = 12500 GGR -> floor(12500*0.20) = 2500 commission
  repo.recordSettledPlay(ref.userId, "2026-06-10", 10000, 2500);
  repo.recordSettledPlay(ref.userId, "2026-06-10", 5000, 0);
  // winning day: (1000-5000) = -4000 -> floored to 0 -> no bucket
  repo.recordSettledPlay(ref.userId, "2026-06-11", 1000, 5000);

  assert.deepEqual(await svc.accrueDaily("2026-06-10"), { buckets: 1, totalCommissionCents: 2500 });
  assert.deepEqual(await svc.accrueDaily("2026-06-11"), { buckets: 0, totalCommissionCents: 0 });
  assert.deepEqual(await svc.accrueDaily("2026-06-10"), { buckets: 1, totalCommissionCents: 2500 }); // idempotent
  await assert.rejects(svc.accrueDaily("06/10/2026"), /INVALID_PERIOD/);
});
