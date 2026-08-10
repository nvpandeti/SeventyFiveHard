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
  debugLog('logs', 'Resolved upsert target record', {
    userId,
    dateISO,
    existingLogId: existing?.id ?? null,
    existingDate: existing?.date ?? null,
    existingDayNumber: typeof existing?.day_number === 'number' ? existing.day_number : null,
    existingCompleted: !!existing?.completed,
  });
  if (existing?.completed) {
    const details = 'This day is already submitted and cannot be edited.';
    debugWarn('logs', 'Blocked upsert for completed daily log', {
      userId,
      dateISO,
      logId: existing.id,
    });
    throw new Error(details);
  }

  // Create payload always includes user + date; update payload omits them to avoid
  // PocketBase re-validating the unique (user, date) index against a differently
  // normalised date string (e.g. stored "2026-08-09 00:00:00.000Z" vs sent "2026-08-09").
  const createBody: FormData | Record<string, unknown> = photoUri
    ? buildFormData({ ...payload, user: userId, date: dateISO }, photoUri)
    : { ...payload, user: userId, date: dateISO };
  const updateBody: FormData | Record<string, unknown> = photoUri
    ? buildFormData({ ...payload }, photoUri)
    : { ...payload };

  try {
    if (existing) {
      try {
        const updated = await pb.collection('daily_logs').update<DailyLog>(existing.id, updateBody as any);
        debugLog('logs', 'Updated existing daily log', {
          userId,
          dateISO,
          logId: updated.id,
          completed: updated.completed,
        });
        return updated;
      } catch (updateErr: any) {
        debugWarn('logs', 'Primary update failed', {
          userId,
          dateISO,
          logId: existing.id,
          backendDate: existing.date,
          backendDayNumber: typeof existing.day_number === 'number' ? existing.day_number : null,
          responseMessage: updateErr?.response?.message ?? null,
          responseData: updateErr?.response?.data ?? null,
        });
        if (shouldRetryUpdateWithIdentityFields(updateErr)) {
          debugWarn('logs', 'Primary update failed; retrying with identity fields', {
            userId,
            dateISO,
            logId: existing.id,
          });

          const canonicalDate = normalizeRecordDate(existing.date) || dateISO;
          const retryBody: FormData | Record<string, unknown> = photoUri
            ? buildFormData({ ...payload, user: userId, date: canonicalDate }, photoUri)
            : { ...payload, user: userId, date: canonicalDate };

          debugLog('logs', 'Retrying update with canonical identity fields', {
            userId,
            dateISO,
            logId: existing.id,
            canonicalDate,
            hasPhotoUpload: !!photoUri,
          });

          const retried = await pb.collection('daily_logs').update<DailyLog>(existing.id, retryBody as any);
          debugLog('logs', 'Recovered daily log update on retry', {
            userId,
            dateISO,
            logId: retried.id,
            completed: retried.completed,
          });
          return retried;
        }

        throw updateErr;
      }
    }
    const created = await pb.collection('daily_logs').create<DailyLog>(createBody as any);
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
        const recovered = await pb.collection('daily_logs').update<DailyLog>(conflicted.id, updateBody as any);
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
      existingLogId: existing?.id ?? null,
      existingDate: existing?.date ?? null,
      existingDayNumber: typeof existing?.day_number === 'number' ? existing.day_number : null,
      details,
      responseMessage: err?.response?.message ?? null,
      responseData: err?.response?.data ?? null,
      error: err,
    });
    throw new Error(details);
  }
}

function isUniqueCreateConflict(err: any): boolean {
  const status = Number(err?.status ?? err?.response?.status ?? 0);
  if (status !== 0 && status !== 400 && status !== 409) {
    return false;
  }

  const messages: string[] = [];
  const data = err?.response?.data;
  if (typeof err?.message === 'string') messages.push(err.message);
  if (typeof err?.response?.message === 'string') messages.push(err.response.message);

  if (data && typeof data === 'object') {
    Object.values(data).forEach((value) => {
      if (value && typeof value === 'object' && typeof (value as any).message === 'string') {
        messages.push((value as any).message);
      }
      if (value && typeof value === 'object' && typeof (value as any).code === 'string') {
        messages.push((value as any).code);
      }
      if (typeof value === 'string') {
        messages.push(value);
      }
    });
  }

  const blob = messages.join(' | ').toLowerCase();
  if (!blob) return false;

  return (
    blob.includes('must be unique')
    || blob.includes('already exists')
    || blob.includes('duplicate')
    || blob.includes('not_unique')
    || blob.includes('unique constraint')
  );
}

function normalizeRecordDate(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.length >= 10 ? trimmed.slice(0, 10) : trimmed;
}

function shouldRetryUpdateWithIdentityFields(err: any): boolean {
  const status = Number(err?.status ?? err?.response?.status ?? 0);
  if (status !== 400) {
    return false;
  }

  const responseMessage = String(err?.response?.message ?? '').toLowerCase();
  const dataMessage = String(err?.response?.data?.message ?? '').toLowerCase();
  const topMessage = String(err?.message ?? '').toLowerCase();

  // Retry only for opaque/generic failures where backend doesn't expose a field-level cause.
  return (
    responseMessage.includes('something went wrong')
    || dataMessage.includes('something went wrong')
    || topMessage.includes('something went wrong')
  );
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
    if (typeof err?.response?.message === 'string' && err.response.message.trim().length > 0) {
      return err.response.message;
    }
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

/** Fetch recent logs for the social feed (across dates). */
export async function listFeedLogs(limit = 100): Promise<DailyLog[]> {
  debugLog('logs', 'Fetching social feed logs', { limit });
  const items = await pb
    .collection('daily_logs')
    .getList<DailyLog>(1, limit, {
      expand: 'user',
      sort: '-date,-created',
    });
  debugLog('logs', 'Fetched social feed logs', { limit, count: items.items.length });
  return items.items;
}

/** @deprecated Use listFeedLogs for the main feed UI. */
export async function listTodaysLogs(): Promise<DailyLog[]> {
  const today = todayISO();
  const items = await pb
    .collection('daily_logs')
    .getFullList<DailyLog>({
      filter: `date = "${today}"`,
      expand: 'user',
      sort: '-created',
    });
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
