/** Returns local date in YYYY-MM-DD (no timezone shift). */
export function todayISO(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseDateInput(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  // Fast path for date-only strings we write in this app.
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const dateOnly = new Date(`${trimmed}T00:00:00`);
    return Number.isNaN(dateOnly.getTime()) ? null : dateOnly;
  }

  // PocketBase datetime strings often use a space separator.
  const normalized = trimmed.includes(' ') ? trimmed.replace(' ', 'T') : trimmed;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return null;

  // Compare by local calendar day only.
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

/** Number of whole days between two ISO date strings, inclusive of today. */
export function daysSince(startISO: string, nowISO: string = todayISO()): number {
  const start = parseDateInput(startISO);
  const now = parseDateInput(nowISO);
  if (!start || !now) return 1;

  const diffMs = now.getTime() - start.getTime();
  const day = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return Math.max(1, day + 1); // day 1 = start day
}

/** Normalize user.current_day values from API to a safe day number. */
export function normalizeCurrentDay(currentDay: unknown): number {
  const value = Number(currentDay ?? 1);
  return Math.max(1, Number.isFinite(value) ? value : 1);
}

export function formatFriendlyDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}
