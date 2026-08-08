/** Returns local date in YYYY-MM-DD (no timezone shift). */
export function todayISO(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Number of whole days between two ISO date strings, inclusive of today. */
export function daysSince(startISO: string, nowISO: string = todayISO()): number {
  const start = new Date(startISO + 'T00:00:00');
  const now = new Date(nowISO + 'T00:00:00');
  const diffMs = now.getTime() - start.getTime();
  const day = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return day + 1; // day 1 = start day
}

export function formatFriendlyDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}
