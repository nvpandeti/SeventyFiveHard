import { pb } from '../lib/pocketbase';
import type { DailyLog } from '../types';
import { todayISO } from '../utils/date';
import { debugError, debugLog, debugWarn } from './debug';
import { createPocketBaseFilePart } from './pocketbaseFile';

/** Fetch (or return null) the current user's log for a given ISO date. */
export async function getMyLogForDate(dateISO: string = todayISO()): Promise<DailyLog | null> {
  const userId = pb.authStore.record?.id;
  if (!userId) {
    debugWarn('logs', 'Skipping getMyLogForDate; no signed in user', { dateISO });
    return null;
  }
  debugLog('logs', 'Fetching my log for date', { userId, dateISO });
  try {
    const record = await pb
      .collection('daily_logs')
      .getFirstListItem<DailyLog>(`user = "${userId}" && date = "${dateISO}"`);
    debugLog('logs', 'Fetched my log for date', { userId, dateISO, logId: record.id });
    return record;
  } catch (err: any) {
    if (err?.status === 404) {
      const fallback = await findExistingLogByCalendarDay(userId, dateISO);
      if (fallback) {
        debugLog('logs', 'Recovered log via calendar-day fallback', {
          userId,
          dateISO,
          logId: fallback.id,
          backendDate: fallback.date,
        });
        return fallback;
      }
      debugLog('logs', 'No log found for date', { userId, dateISO });
      return null;
    }
    debugError('logs', 'Failed to fetch my log for date', err);
    throw err;
  }
}

interface UpsertPayload {
  diet_ok: boolean;
  workout_1: boolean;
  workout_2: boolean;
  water_ok: boolean;
  reading_ok: boolean;
  completed: boolean;
  progress_photo?: string;
}

export async function upsertMyLog(
  dateISO: string,
  payload: UpsertPayload,
  photoUri?: string,
): Promise<DailyLog> {
  const userId = pb.authStore.record?.id;
  if (!userId) {
    debugWarn('logs', 'Attempted upsert without signed in user', { dateISO });
    throw new Error('Not signed in');
  }

  debugLog('logs', 'Upserting my log', {
    userId,
    dateISO,
    hasPhotoUpload: !!photoUri,
    completed: payload.completed,
  });

  const existing = await getMyLogForDate(dateISO);

  // Use FormData when uploading a photo so PocketBase can accept the file.
  const body: FormData | Record<string, unknown> = photoUri
    ? buildFormData({ ...payload, user: userId, date: dateISO }, photoUri)
    : { ...payload, user: userId, date: dateISO };

  try {
    if (existing) {
      const updated = await pb.collection('daily_logs').update<DailyLog>(existing.id, body as any);
      debugLog('logs', 'Updated existing daily log', {
        userId,
        dateISO,
        logId: updated.id,
        completed: updated.completed,
      });
      return updated;
    }
    const created = await pb.collection('daily_logs').create<DailyLog>(body as any);
    debugLog('logs', 'Created new daily log', {
      userId,
      dateISO,
      logId: created.id,
      completed: created.completed,
    });
    return created;
  } catch (err: any) {
    if (!existing && isUniqueCreateConflict(err)) {
      debugWarn('logs', 'Create hit unique constraint; attempting recovery update', {
        userId,
        dateISO,
      });
      const conflicted = await findExistingLogByCalendarDay(userId, dateISO);
      if (conflicted) {
        const recovered = await pb.collection('daily_logs').update<DailyLog>(conflicted.id, body as any);
        debugLog('logs', 'Recovered from unique create conflict by updating existing log', {
          userId,
          dateISO,
          logId: recovered.id,
          completed: recovered.completed,
        });
        return recovered;
      }
    }

    const details = explainPocketBaseError(err, existing ? 'Failed to update log' : 'Failed to create log');
    debugError('logs', 'Upsert failed', {
      userId,
      dateISO,
      hasPhotoUpload: !!photoUri,
      details,
      error: err,
    });
    throw new Error(details);
  }
}

function isUniqueCreateConflict(err: any): boolean {
  const data = err?.response?.data;
  if (!data || typeof data !== 'object') return false;

  const hasDateUnique = typeof (data as any)?.date?.message === 'string'
    && (data as any).date.message.includes('Value must be unique');
  const hasUserUnique = typeof (data as any)?.user?.message === 'string'
    && (data as any).user.message.includes('Value must be unique');

  return hasDateUnique || hasUserUnique;
}

function normalizeRecordDate(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.length >= 10 ? trimmed.slice(0, 10) : trimmed;
}

async function findExistingLogByCalendarDay(userId: string, dateISO: string): Promise<DailyLog | null> {
  const list = await pb.collection('daily_logs').getList<DailyLog>(1, 20, {
    filter: `user = "${userId}"`,
    sort: '-date',
  });

  return list.items.find((item) => normalizeRecordDate(item.date) === dateISO) ?? null;
}

function explainPocketBaseError(err: any, fallback: string): string {
  const data = err?.response?.data;
  if (!data || typeof data !== 'object') {
    return err?.message ?? fallback;
  }

  if (typeof data.message === 'string' && data.message.trim().length > 0) {
    return data.message;
  }

  const fieldMessages = Object.entries(data)
    .filter(([key, value]) => key !== 'code' && key !== 'message' && value && typeof value === 'object')
    .map(([key, value]) => {
      const message = (value as any)?.message;
      return typeof message === 'string' && message.trim().length > 0 ? `${key}: ${message}` : null;
    })
    .filter((value): value is string => !!value);

  if (fieldMessages.length > 0) {
    return `${fallback}. ${fieldMessages.join(', ')}`;
  }

  return err?.message ?? fallback;
}

function buildFormData(fields: Record<string, unknown>, photoUri: string): FormData {
  const form = new FormData();
  Object.entries(fields).forEach(([k, v]) => {
    form.append(k, typeof v === 'boolean' ? String(v) : (v as string));
  });
  // React Native's FormData accepts an object with { uri, name, type },
  // but the DOM lib types only know about Blob | string. Cast to any here.
  form.append('progress_photo', createPocketBaseFilePart(photoUri, 'photo') as any);
  return form;
}

/** Fetch every user's log for today for the social feed. */
export async function listTodaysLogs(): Promise<DailyLog[]> {
  const today = todayISO();
  debugLog('logs', 'Fetching social feed logs', { date: today });
  const items = await pb
    .collection('daily_logs')
    .getFullList<DailyLog>({
      filter: `date = "${today}"`,
      expand: 'user',
      sort: '-created',
    });
  debugLog('logs', 'Fetched social feed logs', { date: today, count: items.length });
  return items;
}

/** Fetch a specific user's recent logs (for the profile screen). */
export async function listUserLogs(userId: string, limit = 30): Promise<DailyLog[]> {
  debugLog('logs', 'Fetching user log history', { userId, limit });
  const result = await pb.collection('daily_logs').getList<DailyLog>(1, limit, {
    filter: `user = "${userId}"`,
    sort: '-date',
  });
  debugLog('logs', 'Fetched user log history', {
    userId,
    limit,
    count: result.items.length,
    totalItems: result.totalItems,
  });
  return result.items;
}

/** Return the PocketBase file URL for a record's progress photo. */
export function photoUrl(log: DailyLog): string | null {
  if (!log.progress_photo) {
    debugLog('logs', 'No progress photo on log', { logId: log.id });
    return null;
  }
  debugLog('logs', 'Resolving progress photo URL', { logId: log.id });
  return pb.files.getURL(log as any, log.progress_photo);
}
