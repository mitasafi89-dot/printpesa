export function formatDateTime(ms: number): string {
  return new Date(ms).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' });
}

/** Short, compact "time ago" label (e.g. "now", "12s", "5m", "3h", "2d"). */
export function formatRelativeTime(ms: number, nowMs: number = Date.now()): string {
  const diff = Math.max(0, nowMs - ms);
  const s = Math.floor(diff / 1000);
  if (s < 5) return 'now';
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

/** Clock time only (e.g. "14:05") — used for chat timestamps. */
export function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' });
}
