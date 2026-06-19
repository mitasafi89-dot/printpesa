'use client';

import { useEffect, useRef, useState } from 'react';
import { useGameSocket } from '@/lib/game/GameSocketProvider';
import { useSession } from '@/lib/auth/session';
import type { ChatError, ChatMessageItem } from '@/lib/game/engagement';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { cn } from '@/lib/cn';
import { formatClock } from '@/lib/format';

const MAX_LEN = 200;
const COOLDOWN_MS = 2000; // mirrors the engine's 1-message / 2s rate limit

/** Map a chat rejection to a friendly, action-oriented inline message. */
function chatErrorMessage(err: ChatError): string {
  if (err.code === 'RATE_LIMITED') return "You're sending messages too fast — wait a moment.";
  const r = new Set(err.reasons);
  if (r.has('too_long')) return `Message too long (max ${MAX_LEN} characters).`;
  if (r.has('empty')) return 'Message is empty after filtering.';
  const blocked: string[] = [];
  if (r.has('link')) blocked.push('links');
  if (r.has('number')) blocked.push('phone numbers');
  if (r.has('profanity')) blocked.push('profanity');
  if (blocked.length > 0) return `Message blocked — ${blocked.join(', ')} are not allowed.`;
  return 'Message rejected.';
}

function ChatLine({ msg, mine }: { msg: ChatMessageItem; mine: boolean }) {
  return (
    <li className="px-1 py-1.5 text-sm">
      <span className={cn('font-medium', mine ? 'text-accent' : 'text-fg')}>{msg.username}</span>
      <span className="ml-2 text-[11px] tabular-nums text-muted">{formatClock(msg.ts)}</span>
      <p className="break-words text-fg/90">{msg.message}</p>
    </li>
  );
}

export function Chat() {
  const { chat, sendChat, subscribeChat, chatError } = useGameSocket();
  const token = useSession((s) => s.token);
  const username = useSession((s) => s.user?.username ?? null);

  const [text, setText] = useState('');
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [onCooldown, setOnCooldown] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const lastNonce = useRef(0);

  // Refresh the backfill on mount (also covers a remount after navigation).
  useEffect(() => {
    subscribeChat();
  }, [subscribeChat]);

  // Auto-scroll to the newest message.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.length]);

  // Surface server rejections inline (rate-limit / sanitizer).
  useEffect(() => {
    if (chatError && chatError.nonce !== lastNonce.current) {
      lastNonce.current = chatError.nonce;
      setInlineError(chatErrorMessage(chatError));
    }
  }, [chatError]);

  // Tick the cooldown flag off when it expires.
  useEffect(() => {
    if (cooldownUntil <= Date.now()) {
      setOnCooldown(false);
      return;
    }
    setOnCooldown(true);
    const t = setTimeout(() => setOnCooldown(false), cooldownUntil - Date.now());
    return () => clearTimeout(t);
  }, [cooldownUntil]);

  const loggedIn = Boolean(token);
  const trimmed = text.trim();
  const canSend = loggedIn && trimmed.length > 0 && !onCooldown;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSend) return;
    if (sendChat(trimmed)) {
      setText('');
      setInlineError(null);
      setCooldownUntil(Date.now() + COOLDOWN_MS);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto" aria-live="polite" aria-label="Chat messages">
        {chat.length === 0 ? (
          <EmptyState title="No messages yet" description="Be the first to say something." />
        ) : (
          <ul className="flex flex-col divide-y divide-border/60">
            {chat.map((m) => (
              <ChatLine key={m.id} msg={m} mine={username !== null && m.username === username} />
            ))}
          </ul>
        )}
      </div>

      {inlineError ? (
        <p role="alert" className="px-1 pt-2 text-xs text-down">
          {inlineError}
        </p>
      ) : null}

      <form onSubmit={submit} className="mt-2 flex items-center gap-2">
        <input
          type="text"
          value={text}
          maxLength={MAX_LEN}
          onChange={(e) => {
            setText(e.target.value);
            if (inlineError) setInlineError(null);
          }}
          disabled={!loggedIn}
          placeholder={loggedIn ? 'Say something…' : 'Log in to chat'}
          aria-label="Chat message"
          className={cn(
            'h-11 w-full rounded-xl border border-border bg-surface-2 px-3 text-sm text-fg placeholder:text-muted',
            'outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60',
          )}
        />
        <Button type="submit" size="md" disabled={!canSend} className="shrink-0">
          {onCooldown ? 'Wait…' : 'Send'}
        </Button>
      </form>
    </div>
  );
}
