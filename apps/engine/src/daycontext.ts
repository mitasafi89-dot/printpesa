import {
  CurveGenerator, SettlementEngine, type GameConfig,
  dateKeyUTC, dayStartMs as dayStartMsForKey, deriveDaySeed, commitment,
} from "@printpesa/shared";
import type { GameRepository } from "./wallet.js";

/**
 * Everything the engine needs to run, score, and recover a single UTC trading day —
 * all deterministically derived from (masterSeed, dateKey). Building a context is a
 * pure computation (curve + per-direction RTP calibration); the only side effect is
 * `ensureGameDay`, which commits the day's seed hash to the database.
 */
export interface DayContext {
  gameDayId: number | null;   // null until the DB row is ensured
  dateKey: string;            // "YYYY-MM-DD" (UTC)
  dayStartMs: number;         // epoch ms of UTC midnight
  seed: string;               // recomputable day seed (hex) — never persisted as plaintext pre-reveal
  seedHash: string;           // SHA-256(seed) — the public commitment
  curve: CurveGenerator;
  settlement: SettlementEngine;
}

export interface SeedManagerOptions {
  /** Calibration sample count for the SettlementEngine. Omit to use the engine default (200k). */
  calibrationSamples?: number;
}

/**
 * SeedManager owns the lifecycle of daily contexts:
 *  - builds + caches a DayContext per date key (idempotent),
 *  - commits each day's seed-hash to the DB (so fairness is publishable before reveal),
 *  - exposes the active day synchronously to the hot path via getActive(),
 *  - rotates at the UTC boundary and reveals the previous day's seed.
 *
 * Determinism is the whole point: the same (masterSeed, dateKey, calibrationSamples)
 * always yields byte-identical curve/threshold parameters, so a position's outcome can
 * be recomputed after a crash without reading any secret from the database.
 */
export class SeedManager {
  private readonly cache = new Map<string, DayContext>();
  private activeKey: string | null = null;

  constructor(
    private readonly masterSeed: string,
    private readonly cfg: GameConfig,
    private readonly repo: GameRepository,
    private readonly now: () => number = () => Date.now(),
    private readonly opts: SeedManagerOptions = {},
  ) {
    if (!masterSeed) throw new Error("masterSeed is required");
  }

  /** Pure build (no I/O): derive seed, hash, curve and calibrated settlement for a day. */
  private build(dateKey: string): DayContext {
    const seed = deriveDaySeed(this.masterSeed, dateKey);
    const seedHash = commitment(seed);
    const curve = new CurveGenerator(seed, this.cfg);
    const settlement = this.opts.calibrationSamples
      ? new SettlementEngine(curve, this.cfg, "calibration", this.cfg.defaultDurationS, 3600, this.opts.calibrationSamples)
      : new SettlementEngine(curve, this.cfg);
    return { gameDayId: null, dateKey, dayStartMs: dayStartMsForKey(dateKey), seed, seedHash, curve, settlement };
  }

  /** Get (or build+cache) the context for a date key, ensuring its DB row exists. */
  async contextFor(dateKey: string): Promise<DayContext> {
    let ctx = this.cache.get(dateKey);
    if (!ctx) { ctx = this.build(dateKey); this.cache.set(dateKey, ctx); }
    if (ctx.gameDayId === null) ctx.gameDayId = await this.repo.ensureGameDay(dateKey, ctx.seedHash);
    return ctx;
  }

  /** Initialise (or re-point) the active day to the current UTC day. Idempotent. */
  async init(): Promise<DayContext> {
    const key = dateKeyUTC(this.now());
    const ctx = await this.contextFor(key);
    this.activeKey = key;
    return ctx;
  }

  /** Synchronous active-day accessor for the hot path. Throws if not initialised/ready. */
  getActive(): DayContext {
    if (!this.activeKey) throw new Error("SeedManager not initialised — call init() first");
    const ctx = this.cache.get(this.activeKey);
    if (!ctx || ctx.gameDayId === null) throw new Error("active day context is not ready");
    return ctx;
  }

  /**
   * Advance to the current UTC day and reveal the seed of the day we just left (if any
   * and if it is now in the past). Safe to call repeatedly; only reveals once per day.
   */
  async rotate(): Promise<{ active: DayContext; revealed: string | null }> {
    const prevKey = this.activeKey;
    const active = await this.init();
    let revealed: string | null = null;
    if (prevKey && prevKey !== active.dateKey) {
      const prev = this.cache.get(prevKey);
      if (prev && (await this.repo.revealSeed(prevKey, prev.seed))) revealed = prevKey;
    }
    return { active, revealed };
  }
}
