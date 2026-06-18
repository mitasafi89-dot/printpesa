import { SeededRng, simulateActivity, activityMessage, type ActivityKind, type Cents } from "@printpesa/shared";
import type { EngagementRepository, ActivityRow } from "./engagement.js";

export interface ActivityOptions {
  enabled?: boolean;    // run the simulated-event generator (default true)
  cadenceMs?: number;   // interval between simulated events (default 4000)
  simSeed?: string;     // deterministic generation seed (default "activity-sim")
}

/**
 * ActivityService owns the "Live Activity" feed:
 *  - a deterministic simulated-event generator that keeps the feed lively at low traffic
 *    (clearly flagged is_simulated=true), and
 *  - a real-event API (record*) for genuine wins/withdrawals/bonuses/signups.
 * Every event is persisted (audit trail) and emitted to the broadcast hook.
 */
export class ActivityService {
  private timer: NodeJS.Timeout | undefined;
  private counter = 0;
  private readonly enabled: boolean;
  private readonly cadenceMs: number;
  private readonly simSeed: string;

  constructor(
    private readonly repo: EngagementRepository,
    private readonly emit: (row: ActivityRow) => void,
    opts: ActivityOptions = {},
  ) {
    this.enabled = opts.enabled ?? true;
    this.cadenceMs = opts.cadenceMs ?? 4000;
    this.simSeed = opts.simSeed ?? "activity-sim";
  }

  private async record(kind: ActivityKind, username: string, amountCents: Cents | null, isSimulated: boolean, message: string): Promise<ActivityRow> {
    const row = await this.repo.insertActivity({ kind, username, amountCents, isSimulated, message });
    this.emit(row);
    return row;
  }

  // --- real events (caller supplies an already display-safe handle) ---
  recordWin(username: string, amountCents: Cents, multiplier?: number): Promise<ActivityRow> {
    return this.record("win", username, amountCents, false, activityMessage("win", username, amountCents, multiplier));
  }
  recordWithdrawal(username: string, amountCents: Cents): Promise<ActivityRow> {
    return this.record("withdrawal", username, amountCents, false, activityMessage("withdrawal", username, amountCents));
  }
  recordBonus(username: string, amountCents: Cents): Promise<ActivityRow> {
    return this.record("bonus", username, amountCents, false, activityMessage("bonus", username, amountCents));
  }
  recordSignup(username: string): Promise<ActivityRow> {
    return this.record("signup", username, null, false, activityMessage("signup", username, null));
  }

  // --- simulated events ---
  /** Generate, persist and emit exactly one simulated event (deterministic per counter). */
  async tickOnce(): Promise<ActivityRow> {
    const ev = simulateActivity(new SeededRng(this.simSeed, `sim:${this.counter++}`));
    return this.record(ev.kind, ev.username, ev.amountCents, true, ev.message);
  }

  start(): void {
    if (!this.enabled || this.timer) return;
    this.timer = setInterval(() => { void this.tickOnce().catch(() => {}); }, this.cadenceMs);
    this.timer.unref?.();
  }
  stop(): void { if (this.timer) { clearInterval(this.timer); this.timer = undefined; } }

  recent(limit = 30): Promise<ActivityRow[]> { return this.repo.listRecentActivity(limit); }
}
