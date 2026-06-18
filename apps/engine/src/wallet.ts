import { randomUUID } from "node:crypto";
import { type Cents, assertCents } from "@printpesa/shared";
import type { Direction } from "@printpesa/shared";

/**
 * GameRepository: the durable, money-atomic boundary. "Open" (debit stake + insert
 * position + ledger) and "settle" (credit payout + update position + ledger) are each
 * ONE atomic, idempotent transaction. Two implementations satisfy the same contract:
 *  - InMemoryGameRepository  — for tests/dev (single-threaded => atomic).
 *  - PgGameRepository        — calls the SECURITY DEFINER RPCs fn_open_position /
 *                              fn_settle_position (migration 0010), verified live.
 */
export interface OpenArgs { userId: string; stakeCents: Cents; direction: Direction; entryRate: number; durationS: number; gameDayId: number | null; nonce: number; }
export interface SettleArgs { positionId: string; exitRate: number; result: "win" | "loss"; multiplier: number; payoutCents: Cents; }
export interface OpenResult { positionId: string; newBalance: Cents; }
export interface SettleResult { settled: boolean; newBalance: Cents; }

export interface GameRepository {
  getBalance(userId: string): Promise<Cents>;
  openPosition(a: OpenArgs): Promise<OpenResult>;
  settlePosition(a: SettleArgs): Promise<SettleResult>;
}

/** Minimal query surface compatible with `pg`'s Pool/Client. */
export interface Querier { query(text: string, params: unknown[]): Promise<{ rows: any[] }>; }

interface MemPos { id: string; userId: string; stake: Cents; status: "open" | "settled"; }
interface MemLedger { userId: string; type: "stake" | "payout" | "seed"; amount: Cents; ref: string; }

export class InMemoryGameRepository implements GameRepository {
  private balances = new Map<string, Cents>();
  private positions = new Map<string, MemPos>();
  readonly ledger: MemLedger[] = [];

  seed(userId: string, amount: Cents): void { this.balances.set(userId, assertCents(amount)); this.ledger.push({ userId, type: "seed", amount, ref: "seed" }); }
  async getBalance(userId: string): Promise<Cents> { return this.balances.get(userId) ?? 0; }

  async openPosition(a: OpenArgs): Promise<OpenResult> {
    if (a.stakeCents <= 0) throw new Error("INVALID_STAKE");
    const bal = this.balances.get(a.userId);
    if (bal === undefined) throw new Error("WALLET_NOT_FOUND");
    if (bal < a.stakeCents) throw new Error("INSUFFICIENT_FUNDS");
    const next = bal - a.stakeCents; this.balances.set(a.userId, next);
    const id = randomUUID();
    this.positions.set(id, { id, userId: a.userId, stake: a.stakeCents, status: "open" });
    this.ledger.push({ userId: a.userId, type: "stake", amount: -a.stakeCents, ref: `positions:${id}` });
    return { positionId: id, newBalance: next };
  }

  async settlePosition(a: SettleArgs): Promise<SettleResult> {
    if (a.payoutCents < 0) throw new Error("INVALID_PAYOUT");
    const p = this.positions.get(a.positionId);
    if (!p) throw new Error("POSITION_NOT_FOUND");
    if (p.status !== "open") return { settled: false, newBalance: this.balances.get(p.userId) ?? 0 }; // idempotent
    p.status = "settled";
    let bal = this.balances.get(p.userId) ?? 0;
    if (a.payoutCents > 0) { bal += a.payoutCents; this.balances.set(p.userId, bal); this.ledger.push({ userId: p.userId, type: "payout", amount: a.payoutCents, ref: `positions:${a.positionId}` }); }
    return { settled: true, newBalance: bal };
  }
}

/** bigint columns arrive as strings from pg; values are < 2^53 so Number() is exact. */
const toCents = (v: unknown): Cents => (typeof v === "string" ? Number(v) : (v as number));

export class PgGameRepository implements GameRepository {
  constructor(private readonly q: Querier) {}
  async getBalance(userId: string): Promise<Cents> {
    const r = await this.q.query("select real_balance from wallets where user_id = $1", [userId]);
    return r.rows.length ? toCents(r.rows[0].real_balance) : 0;
  }
  async openPosition(a: OpenArgs): Promise<OpenResult> {
    const r = await this.q.query("select position_id, new_balance from fn_open_position($1,$2,$3,$4,$5,$6,$7)",
      [a.userId, a.stakeCents, a.direction, a.entryRate, a.durationS, a.gameDayId, a.nonce]);
    return { positionId: r.rows[0].position_id, newBalance: toCents(r.rows[0].new_balance) };
  }
  async settlePosition(a: SettleArgs): Promise<SettleResult> {
    const r = await this.q.query("select settled, new_balance from fn_settle_position($1,$2,$3,$4,$5)",
      [a.positionId, a.exitRate, a.result, a.multiplier, a.payoutCents]);
    return { settled: r.rows[0].settled, newBalance: toCents(r.rows[0].new_balance) };
  }
}
