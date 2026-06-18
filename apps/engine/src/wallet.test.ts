import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryGameRepository, PgGameRepository, type Querier } from "./wallet.js";

test("InMemory repo: open debits, settle credits once (idempotent), loss credits nothing", async () => {
  const r = new InMemoryGameRepository();
  r.seed("u", 100000);
  const o = await r.openPosition({ userId: "u", stakeCents: 20000, direction: "buy", entryRate: 0.2, durationS: 10, gameDayId: null, nonce: 1 });
  assert.equal(o.newBalance, 80000);
  const s1 = await r.settlePosition({ positionId: o.positionId, exitRate: 0.25, result: "win", multiplier: 2.5, payoutCents: 50000 });
  assert.deepEqual(s1, { settled: true, newBalance: 130000 });
  const s2 = await r.settlePosition({ positionId: o.positionId, exitRate: 0.25, result: "win", multiplier: 2.5, payoutCents: 50000 });
  assert.equal(s2.settled, false);
  assert.equal(await r.getBalance("u"), 130000);

  r.seed("v", 30000);
  const ol = await r.openPosition({ userId: "v", stakeCents: 20000, direction: "sell", entryRate: 0.2, durationS: 10, gameDayId: null, nonce: 2 });
  const sl = await r.settlePosition({ positionId: ol.positionId, exitRate: 0.1, result: "loss", multiplier: 0, payoutCents: 0 });
  assert.deepEqual(sl, { settled: true, newBalance: 10000 });
});

test("InMemory repo: insufficient funds + unknown position", async () => {
  const r = new InMemoryGameRepository();
  r.seed("u", 1000);
  await assert.rejects(() => r.openPosition({ userId: "u", stakeCents: 20000, direction: "buy", entryRate: 0.2, durationS: 10, gameDayId: null, nonce: 1 }), /INSUFFICIENT_FUNDS/);
  await assert.rejects(() => r.settlePosition({ positionId: "nope", exitRate: 0, result: "loss", multiplier: 0, payoutCents: 0 }), /POSITION_NOT_FOUND/);
});

test("Pg repo: calls the RPCs with correct params and parses bigint strings", async () => {
  const calls: { text: string; params: unknown[] }[] = [];
  const fake: Querier = {
    async query(text, params) {
      calls.push({ text, params });
      if (text.includes("fn_open_position")) return { rows: [{ position_id: "p-1", new_balance: "80000" }] };
      if (text.includes("fn_settle_position")) return { rows: [{ settled: true, new_balance: "130000" }] };
      if (text.includes("real_balance")) return { rows: [{ real_balance: "5000" }] };
      return { rows: [] };
    },
  };
  const r = new PgGameRepository(fake);
  const o = await r.openPosition({ userId: "u", stakeCents: 20000, direction: "buy", entryRate: 0.21, durationS: 10, gameDayId: null, nonce: 7 });
  assert.deepEqual(o, { positionId: "p-1", newBalance: 80000 });
  assert.ok(calls[0]!.text.includes("fn_open_position"));
  assert.deepEqual(calls[0]!.params, ["u", 20000, "buy", 0.21, 10, null, 7]);
  const s = await r.settlePosition({ positionId: "p-1", exitRate: 0.25, result: "win", multiplier: 2.5, payoutCents: 50000 });
  assert.deepEqual(s, { settled: true, newBalance: 130000 });
  assert.equal(await r.getBalance("u"), 5000);
});
