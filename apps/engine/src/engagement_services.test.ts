import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryEngagementRepository } from "./engagement.js";
import { ChatService } from "./chatservice.js";
import { ActivityService } from "./activityservice.js";

test("ChatService: accepts, sanitizes, persists, and broadcasts via repo", async () => {
  const repo = new InMemoryEngagementRepository();
  const clock = { ms: 0 };
  const chat = new ChatService(repo, { rateLimitMs: 2000 }, () => clock.ms);
  const r = await chat.post("u1", "njeri.ke", "  hello  world  ");
  assert.ok(r.ok && r.row.message === "hello world" && r.row.username === "njeri.ke");
  assert.equal((await repo.listRecentChat(10)).length, 1);
});

test("ChatService: rate limit 1 msg / 2s per user; other users unaffected", async () => {
  const repo = new InMemoryEngagementRepository();
  const clock = { ms: 10_000 };
  const chat = new ChatService(repo, { rateLimitMs: 2000 }, () => clock.ms);
  assert.equal((await chat.post("u1", "a", "first")).ok, true);
  const blocked = await chat.post("u1", "a", "too soon");
  assert.equal(blocked.ok, false);
  assert.equal((blocked as any).code, "RATE_LIMITED");
  assert.equal((await chat.post("u2", "b", "different user ok")).ok, true); // independent limiter
  clock.ms += 2000; // window elapsed
  assert.equal((await chat.post("u1", "a", "now allowed")).ok, true);
  assert.equal((await repo.listRecentChat(10)).length, 3);
});

test("ChatService: rejected (empty/over-length) messages are not persisted and don't consume the rate window", async () => {
  const repo = new InMemoryEngagementRepository();
  const clock = { ms: 0 };
  const chat = new ChatService(repo, { rateLimitMs: 2000 }, () => clock.ms);
  const empty = await chat.post("u1", "a", "    ");
  assert.equal(empty.ok, false);
  assert.deepEqual((empty as any).reasons, ["empty"]);
  // since the rejected post didn't consume the window, a valid post at the same instant is accepted
  assert.equal((await chat.post("u1", "a", "real message")).ok, true);
  assert.equal((await repo.listRecentChat(10)).length, 1);
});

test("ChatService: sanitized content (link/number/profanity) is persisted clean with reasons", async () => {
  const repo = new InMemoryEngagementRepository();
  const chat = new ChatService(repo, {}, () => 0);
  const r = await chat.post("u1", "a", "dm www.scam.io or 0712345678 shit");
  assert.ok(r.ok);
  assert.ok(!/scam\.io/.test(r.row.message) && !/0712345678/.test(r.row.message) && !/shit/.test(r.row.message));
  for (const reason of ["link", "number", "profanity"]) assert.ok(r.reasons.includes(reason));
});

test("ChatService: hide removes a message from the recent feed", async () => {
  const repo = new InMemoryEngagementRepository();
  const chat = new ChatService(repo, {}, () => 0);
  const r = await chat.post("u1", "a", "hide me");
  assert.ok(r.ok);
  assert.equal(await chat.hide(r.row.id), true);
  assert.equal((await chat.recent()).length, 0);
});

test("ActivityService: simulated tick persists (flagged) and emits; deterministic per counter", async () => {
  const repo = new InMemoryEngagementRepository();
  const emitted: any[] = [];
  const svc = new ActivityService(repo, (row) => emitted.push(row), { enabled: false, simSeed: "fixed" });
  const a = await svc.tickOnce();
  assert.equal(a.isSimulated, true);
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].id, a.id);
  // a fresh service with the same seed reproduces the same first event content
  const svc2 = new ActivityService(new InMemoryEngagementRepository(), () => {}, { enabled: false, simSeed: "fixed" });
  const b = await svc2.tickOnce();
  assert.equal(a.kind, b.kind);
  assert.equal(a.username, b.username);
  assert.equal(a.message, b.message);
});

test("ActivityService: real-event recorders persist with is_simulated=false and proper messages", async () => {
  const repo = new InMemoryEngagementRepository();
  const svc = new ActivityService(repo, () => {}, { enabled: false });
  const win = await svc.recordWin("wanj***", 1_250_00, 3.5);
  assert.equal(win.isSimulated, false);
  assert.match(win.message, /@wanj\*\*\* just won KES 1,250\.00 on a ×3\.50 trade/);
  await svc.recordWithdrawal("msshiro", 5_000_00);
  await svc.recordSignup("newbie");
  const recent = await svc.recent(10);
  assert.equal(recent.length, 3);
  assert.ok(recent.every((r) => r.isSimulated === false));
});
