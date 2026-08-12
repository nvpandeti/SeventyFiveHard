export const DEFAULT_TIMEZONE = 'America/New_York';

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function toISODate(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function shiftISODate(isoDate: string, days: number): string {
  const [yearText, monthText, dayText] = isoDate.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const utc = new Date(Date.UTC(year, month - 1, day));
  utc.setUTCDate(utc.getUTCDate() + days);
  return toISODate(utc.getUTCFullYear(), utc.getUTCMonth() + 1, utc.getUTCDate());
}

function getZonedDateParts(date: Date, timezone: string): { year: number; month: number; day: number } {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const year = Number(parts.find((p) => p.type === 'year')?.value ?? '0');
  const month = Number(parts.find((p) => p.type === 'month')?.value ?? '0');
  const day = Number(parts.find((p) => p.type === 'day')?.value ?? '0');
  return { year, month, day };
}

function parseOffsetMinutes(tzNamePart: string): number {
  const normalized = tzNamePart.replace('UTC', 'GMT');
  if (normalized === 'GMT') return 0;

  const match = normalized.match(/^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/);
  if (!match) {
    throw new Error(`Unsupported timezone offset format: ${tzNamePart}`);
  }

  const sign = match[1] === '-' ? -1 : 1;
  const hours = Number(match[2]);
  const minutes = Number(match[3] ?? '0');
  return sign * (hours * 60 + minutes);
}

function getOffsetMinutesAt(date: Date, timezone: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    timeZoneName: 'shortOffset',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const tzName = parts.find((p) => p.type === 'timeZoneName')?.value;
  if (!tzName) {
    throw new Error('Missing timezone offset part');
  }

  return parseOffsetMinutes(tzName);
}

function localDateTimeToUtcMillis(
  dateISO: string,
  hour: number,
  minute: number,
  second: number,
  timezone: string,
): number {
  const [yearText, monthText, dayText] = dateISO.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const naiveUtcMillis = Date.UTC(year, month - 1, day, hour, minute, second);

  // Iteratively resolve timezone offset around the target local timestamp.
  let guess = naiveUtcMillis;
  for (let i = 0; i < 6; i += 1) {
    const offsetMinutes = getOffsetMinutesAt(new Date(guess), timezone);
    const adjusted = naiveUtcMillis - offsetMinutes * 60 * 1000;
    if (adjusted === guess) break;
    guess = adjusted;
  }

  return guess;
}

function isValidTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function normalizeTimezone(value: unknown): string {
  const text = String(value ?? '').trim();
  if (!text) return DEFAULT_TIMEZONE;
  return isValidTimezone(text) ? text : DEFAULT_TIMEZONE;
}

export interface ScheduledRolloverWindow {
  timezoneName: string;
  todayISO: string;
  rolloverDateISO: string;
  nextRolloverAtUTCISO: string;
}

export function computeScheduledRolloverWindow(
  now: Date,
  timezoneValue: unknown,
): ScheduledRolloverWindow {
  const timezoneName = normalizeTimezone(timezoneValue);
  const todayParts = getZonedDateParts(now, timezoneName);
  const todayISO = toISODate(todayParts.year, todayParts.month, todayParts.day);
  const rolloverDateISO = shiftISODate(todayISO, -1);
  const nextLocalDateISO = shiftISODate(todayISO, 1);
  const nextRolloverAtUTCISO = new Date(
    localDateTimeToUtcMillis(nextLocalDateISO, 0, 0, 0, timezoneName),
  ).toISOString();

  return {
    timezoneName,
    todayISO,
    rolloverDateISO,
    nextRolloverAtUTCISO,
  };
}

export function isRolloverDue(nextRolloverAtUTCISO: string, now: Date): boolean {
  const nextMs = Date.parse(String(nextRolloverAtUTCISO ?? ''));
  if (!Number.isFinite(nextMs)) return true;
  return nextMs <= now.getTime();
}
