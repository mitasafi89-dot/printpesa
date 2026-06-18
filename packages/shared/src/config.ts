import type { Cents } from "./money.js";

/** Game configuration, mirroring the public.game_config DB singleton. */
export interface GameConfig {
  houseEdge: number;        // 0.75 -> RTP 0.25
  maxMultiplier: number;    // 5.0
  minStakeCents: Cents;     // 5000 (KES 50)
  maxStakeCents: Cents;     // 5_000_000
  defaultDurationS: number; // 10
  tickRateMs: number;       // 150
  driftBias: number;        // visual green bias (does NOT affect fairness; see settlement)
  volatility: number;       // curve amplitude scaler
  /** Target fraction of positions that win (per direction). Tunes feel; RTP stays fixed. */
  targetWinRate: number;    // 0.125 default
}

export const DEFAULT_CONFIG: GameConfig = {
  houseEdge: 0.75,
  maxMultiplier: 5.0,
  minStakeCents: 5000,
  maxStakeCents: 5_000_000,
  defaultDurationS: 10,
  tickRateMs: 150,
  driftBias: 0.02,
  volatility: 1.0,
  targetWinRate: 0.125,
};

export function rtp(cfg: GameConfig): number {
  return 1 - cfg.houseEdge;
}

/**
 * Validate that the configured target win-rate can satisfy the RTP given the
 * multiplier cap. Required mean winning multiplier = RTP / winRate; it must lie
 * within (1, maxMultiplier]. Throws if the config is infeasible.
 */
export function assertFeasible(cfg: GameConfig): void {
  if (cfg.houseEdge < 0 || cfg.houseEdge >= 1) throw new Error(`houseEdge must be in [0,1): ${cfg.houseEdge}`);
  if (cfg.maxMultiplier <= 1) throw new Error(`maxMultiplier must be > 1: ${cfg.maxMultiplier}`);
  if (cfg.targetWinRate <= 0 || cfg.targetWinRate > 1) throw new Error(`targetWinRate must be in (0,1]: ${cfg.targetWinRate}`);
  const meanWinMult = rtp(cfg) / cfg.targetWinRate;
  if (meanWinMult <= 1) throw new Error(`infeasible: required mean win multiplier ${meanWinMult.toFixed(3)} <= 1 (raise targetWinRate or houseEdge)`);
  if (meanWinMult > cfg.maxMultiplier) {
    throw new Error(`infeasible: required mean win multiplier ${meanWinMult.toFixed(3)} > maxMultiplier ${cfg.maxMultiplier} (lower targetWinRate)`);
  }
}
