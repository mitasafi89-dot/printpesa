import { sanitizeChat, MAX_CHAT_LEN } from "@printpesa/shared";
import type { EngagementRepository, ChatRow } from "./engagement.js";

export type ChatPostResult =
  | { ok: true; row: ChatRow; reasons: string[] }      // reasons = sanitizations applied (link/number/profanity)
  | { ok: false; code: "RATE_LIMITED" | "REJECTED"; reasons: string[] };

export interface ChatOptions {
  rateLimitMs?: number;  // min gap between accepted posts per user (default 2000 — 1 msg / 2s)
  recentLimit?: number;  // messages returned on join (default 50)
  maxLen?: number;       // max chars (default MAX_CHAT_LEN)
}

/**
 * ChatService: server-authoritative chat. Enforces a per-user rate limit, sanitizes input
 * (strips links/phone numbers, masks profanity, length cap), persists, and supports
 * moderation (hide). The display username is the server-resolved profile handle, never
 * trusted from the client.
 */
export class ChatService {
  private readonly lastPostMs = new Map<string, number>();
  private readonly rateLimitMs: number;
  private readonly recentLimit: number;
  private readonly maxLen: number;

  constructor(
    private readonly repo: EngagementRepository,
    opts: ChatOptions = {},
    private readonly now: () => number = () => Date.now(),
  ) {
    this.rateLimitMs = opts.rateLimitMs ?? 2000;
    this.recentLimit = opts.recentLimit ?? 50;
    this.maxLen = opts.maxLen ?? MAX_CHAT_LEN;
  }

  /** Validate + sanitize + persist a message. Rate limit is consumed only on acceptance. */
  async post(userId: string, username: string, raw: string): Promise<ChatPostResult> {
    const t = this.now();
    const last = this.lastPostMs.get(userId) ?? -Infinity;
    if (t - last < this.rateLimitMs) return { ok: false, code: "RATE_LIMITED", reasons: ["rate_limited"] };
    const s = sanitizeChat(raw, this.maxLen);
    if (!s.ok) return { ok: false, code: "REJECTED", reasons: s.reasons };
    this.lastPostMs.set(userId, t);
    const row = await this.repo.insertChat({ userId, username, message: s.text });
    return { ok: true, row, reasons: s.reasons };
  }

  recent(): Promise<ChatRow[]> { return this.repo.listRecentChat(this.recentLimit); }
  hide(id: number): Promise<boolean> { return this.repo.hideChat(id); }
}
