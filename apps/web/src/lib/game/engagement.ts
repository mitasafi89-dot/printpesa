import type { ActivityKind } from '@printpesa/shared';

/**
 * WebSocket engagement contract (FE5) — mirrors the engine DTOs in
 * `apps/engine/src/server.ts` (`activityDto` / `chatDto`). All money values are
 * integer KES cents. The engine is authoritative; the client only renders.
 */

/** S→C: one live activity-feed row (`activity`, or an item of `activity_batch`). */
export interface ActivityItem {
  kind: ActivityKind;
  username: string;
  amountCents: number | null;
  message: string;
  ts: number;
}

/** S→C: one chat message (`chat`, or an item of `chat_batch`). */
export interface ChatMessageItem {
  id: number;
  username: string;
  message: string;
  ts: number;
}

/**
 * S→C chat rejection surfaced inline (never as a "trade" toast). The engine emits
 * `error { code, reasons }` with `RATE_LIMITED` (posting too fast) or `REJECTED`
 * (message blocked by the sanitizer) for `send_chat`. `nonce` lets the UI react
 * even when the same code repeats.
 */
export interface ChatError {
  code: 'RATE_LIMITED' | 'REJECTED';
  reasons: string[];
  nonce: number;
}

/** Codes the engine uses exclusively for chat rejections (vs. trade errors). */
export const CHAT_ERROR_CODES = ['RATE_LIMITED', 'REJECTED'] as const;

export function isChatErrorCode(code: string): code is ChatError['code'] {
  return (CHAT_ERROR_CODES as readonly string[]).includes(code);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Runtime guard for an inbound activity row (defends against malformed frames). */
export function isActivityItem(v: unknown): v is ActivityItem {
  if (typeof v !== 'object' || v === null) return false;
  const a = v as Record<string, unknown>;
  return (
    typeof a.kind === 'string' &&
    typeof a.username === 'string' &&
    typeof a.message === 'string' &&
    isFiniteNumber(a.ts) &&
    (a.amountCents === null || isFiniteNumber(a.amountCents))
  );
}

/** Runtime guard for an inbound chat row. */
export function isChatMessageItem(v: unknown): v is ChatMessageItem {
  if (typeof v !== 'object' || v === null) return false;
  const c = v as Record<string, unknown>;
  return (
    isFiniteNumber(c.id) &&
    typeof c.username === 'string' &&
    typeof c.message === 'string' &&
    isFiniteNumber(c.ts)
  );
}
