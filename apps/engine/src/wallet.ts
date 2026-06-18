import { randomUUID } from "node:crypto";
import { type Cents, assertCents } from "@printpesa/shared";
import type { Direction } from "@printpesa/shared";

/**
 * GameRepository: the durable, money-atomic boundary. "Open" (debit stake + insert
 * position + ledger) and "settle" (credit payout + update position + ledger) are each
 * ONE atomic, idempotent transaction. It also owns the fairness day rows and the
 * open-position scan used by crash recovery. Two implementations satisfy the contract:
 *  - InMemoryGameRepository  — for tests/dev (single-threaded => atomic).
 *  - PgGameRepository        — calls the SECURITY DEFINER RPCs fn_open_position /
 *                              fn_settle_position / fn_ensure_game_day / fn_reveal_game_day
 *                              (migrations 0010-0012) and reads the leak-safe v_fairness view.
 */
export interface OpenArgs {
  userId: string; stakeCents: Cents; direction: Direction; entryRate: number;
  durationS: number; gameDayId: number | null; nonce: number; openedAtMs: number;
}
export interface SettleArgs { positionId: string; exitRate: number; result: "win" | "loss"; multiplier: number; payoutCents: Cents; }
export interface OpenResult { positionId: string; newBalance: Cents; }
export interface SettleResult { settled: boolean; newBalance: Cents; }

/** A still-open position as persisted — the durable facts needed to recompute its outcome. */
export interface OpenPositionRow {
  id: string; userId: string; stakeCents: Cents; direction: Direction;
  durationS: number; openedAtMs: number; entryRate: number; gameDayId: number | null; nonce: number;
}

/** Public fairness record for a day (commitment always; seed only after reveal). */
export interface FairnessRecord {
  gameDayId: number | null; tradeDate: string; serverSeedHash: string;
  serverSeed: string | null; revealedAt: string | null;
}

export interface GameRepository {
  getBalance(userId: string): Promise<Cents>;
  openPosition(a: OpenArgs): Promise<OpenResult>;
  settlePosition(a: SettleArgs): Promise<SettleResult>;
  /** Idempotently commit a game day (stores hash; seed stays hidden). Returns its id. */
  ensureGameDay(tradeDate: string, serverSeedHash: string): Promise<number | null>;
  /** Reveal a past day's seed (commitment- and past-only-checked in the DB). Returns whether it took effect. */
  revealSeed(tradeDate: string, serverSeed: string): Promise<boolean>;
  /** All positions still open — the crash-recovery work list. */
  listOpenPositions(): Promise<OpenPositionRow[]>;
  /** Public fairness record for a day, or null if the day is unknown. */
  getFairness(tradeDate: string): Promise<FairnessRecord | null>;
}

/** Minimal query surface compatible with `pg`'s Pool/Client. */
export interface Querier { query(text: string, params: unknown[]): Promise<{ rows: any[] }>; }

interface MemPos {
  id: string; userId: string; stake: Cents; status: "open" | "settled";
  direction: Direction; durationS: number; openedAtMs: number; entryRate: number;
  gameDayId: number | null; nonce: number;
}
interface MemLedger { userId: string; type: "stake" | "payout" | "seed"; amount: Cents; ref: string; }
interface MemDay { id: number; tradeDate: string; serverSeedHash: string; serverSeed: string | null; revealedAt: string | null; }

export class InMemoryGameRepository implements GameRepository {
  private balances = new Map<string, Cents>();
  private positions = new Map<string, MemPos>();
  private days = new Map<string, MemDay>();
  private nextDayId = 1;
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
    this.positions.set(id, {
      id, userId: a.userId, stake: a.stakeCents, status: "open",
      direction: a.direction, durationS: a.durationS, openedAtMs: a.openedAtMs,
      entryRate: a.entryRate, gameDayId: a.gameDayId, nonce: a.nonce,
    });
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

  async ensureGameDay(tradeDate: string, serverSeedHash: string): Promise<number | null> {
    const existing = this.days.get(tradeDate);
    if (existing) return existing.id;
    const day: MemDay = { id: this.nextDayId++, tradeDate, serverSeedHash, serverSeed: null, revealedAt: null };
    this.days.set(tradeDate, day);
    return day.id;
  }

  async revealSeed(tradeDate: string, serverSeed: string): Promise<boolean> {
    const day = this.days.get(tradeDate);
    if (!day || day.revealedAt !== null) return false; // unknown or already revealed -> no-op
    day.serverSeed = serverSeed;
    day.revealedAt = new Date().toISOString();
    return true;
  }

  async listOpenPositions(): Promise<OpenPositionRow[]> {
    const out: OpenPositionRow[] = [];
    for (const p of this.positions.values()) {
      if (p.status !== "open") continue;
      out.push({ id: p.id, userId: p.userId, stakeCents: p.stake, direction: p.direction, durationS: p.durationS, openedAtMs: p.openedAtMs, entryRate: p.entryRate, gameDayId: p.gameDayId, nonce: p.nonce });
    }
    return out;
  }

  async getFairness(tradeDate: string): Promise<FairnessRecord | null> {
    const day = this.days.get(tradeDate);
    if (!day) return null;
    // mirror v_fairness: expose seed only after reveal
    return { gameDayId: day.id, tradeDate: day.tradeDate, serverSeedHash: day.serverSeedHash, serverSeed: day.revealedAt ? day.serverSeed : null, revealedAt: day.revealedAt };
  }
}

/** bigint columns arrive as strings from pg; values are < 2^53 so Number() is exact. */
const toCents = (v: unknown): Cents => (typeof v === "string" ? Number(v) : (v as number));
const toMs = (v: unknown): number => (v instanceof Date ? v.getTime() : new Date(String(v)).getTime());

export class PgGameRepository implements GameRepository {
  constructor(private readonly q: Querier) {}
  async getBalance(userId: string): Promise<Cents> {
    const r = await this.q.query("select real_balance from wallets where user_id = $1", [userId]);
    return r.rows.length ? toCents(r.rows[0].real_balance) : 0;
  }
  async openPosition(a: OpenArgs): Promise<OpenResult> {
    // matches migration 0012: fn_open_position(user,stake,direction,entry_rate,duration_s,game_day,nonce,opened_at)
    const r = await this.q.query("select position_id, new_balance from fn_open_position($1,$2,$3,$4,$5,$6,$7,$8)",
      [a.userId, a.stakeCents, a.direction, a.entryRate, a.durationS, a.gameDayId, a.nonce, new Date(a.openedAtMs).toISOString()]);
    return { positionId: r.rows[0].position_id, newBalance: toCents(r.rows[0].new_balance) };
  }
  async settlePosition(a: SettleArgs): Promise<SettleResult> {
    const r = await this.q.query("select settled, new_balance from fn_settle_position($1,$2,$3,$4,$5)",
      [a.positionId, a.exitRate, a.result, a.multiplier, a.payoutCents]);
    return { settled: r.rows[0].settled, newBalance: toCents(r.rows[0].new_balance) };
  }
  async ensureGameDay(tradeDate: string, serverSeedHash: string): Promise<number | null> {
    const r = await this.q.query("select fn_ensure_game_day($1,$2) as id", [tradeDate, serverSeedHash]);
    const id = r.rows[0]?.id;
    return id === null || id === undefined ? null : Number(id);
  }
  async revealSeed(tradeDate: string, serverSeed: string): Promise<boolean> {
    const r = await this.q.query("select fn_reveal_game_day($1,$2) as ok", [tradeDate, serverSeed]);
    return Boolean(r.rows[0]?.ok);
  }
  async listOpenPositions(): Promise<OpenPositionRow[]> {
    const r = await this.q.query(
      "select id, user_id, stake, direction, duration_s, opened_at, entry_rate, game_day_id, nonce from positions where status = 'open' order by opened_at", []);
    return r.rows.map((x) => ({
      id: String(x.id), userId: String(x.user_id), stakeCents: toCents(x.stake), direction: x.direction as Direction,
      durationS: Number(x.duration_s), openedAtMs: toMs(x.opened_at), entryRate: Number(x.entry_rate),
      gameDayId: x.game_day_id === null || x.game_day_id === undefined ? null : Number(x.game_day_id), nonce: Number(x.nonce),
    }));
  }
  async getFairness(tradeDate: string): Promise<FairnessRecord | null> {
    const r = await this.q.query("select id, trade_date, server_seed_hash, server_seed, revealed_at from v_fairness where trade_date = $1", [tradeDate]);
    if (!r.rows.length) return null;
    const x = r.rows[0];
    return {
      gameDayId: x.id === null || x.id === undefined ? null : Number(x.id),
      tradeDate: x.trade_date instanceof Date ? x.trade_date.toISOString().slice(0, 10) : String(x.trade_date),
      serverSeedHash: String(x.server_seed_hash), serverSeed: x.server_seed ?? null,
      revealedAt: x.revealed_at ? (x.revealed_at instanceof Date ? x.revealed_at.toISOString() : String(x.revealed_at)) : null,
    };
  }
}
