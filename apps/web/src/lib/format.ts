export function formatDateTime(ms: number): string {
  return new Date(ms).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' });
}
