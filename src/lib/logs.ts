import { pb } from '../lib/pocketbase';
import type { DailyLog } from '../types';
import { todayISO } from '../utils/date';

/** Fetch (or return null) the current user's log for a given ISO date. */
export async function getMyLogForDate(dateISO: string = todayISO()): Promise<DailyLog | null> {
  const userId = pb.authStore.record?.id;
  if (!userId) return null;
  try {
    const record = await pb
      .collection('daily_logs')
      .getFirstListItem<DailyLog>(`user = "${userId}" && date = "${dateISO}"`);
    return record;
  } catch (err: any) {
    if (err?.status === 404) return null;
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
  if (!userId) throw new Error('Not signed in');

  const existing = await getMyLogForDate(dateISO);

  // Use FormData when uploading a photo so PocketBase can accept the file.
  const body: FormData | Record<string, unknown> = photoUri
    ? buildFormData({ ...payload, user: userId, date: dateISO }, photoUri)
    : { ...payload, user: userId, date: dateISO };

  if (existing) {
    return pb.collection('daily_logs').update<DailyLog>(existing.id, body as any);
  }
  return pb.collection('daily_logs').create<DailyLog>(body as any);
}

function buildFormData(fields: Record<string, unknown>, photoUri: string): FormData {
  const form = new FormData();
  Object.entries(fields).forEach(([k, v]) => {
    form.append(k, typeof v === 'boolean' ? String(v) : (v as string));
  });
  const filename = photoUri.split('/').pop() ?? `photo-${Date.now()}.jpg`;
  const ext = filename.includes('.') ? filename.split('.').pop() : 'jpg';
  // React Native's FormData accepts an object with { uri, name, type },
  // but the DOM lib types only know about Blob | string. Cast to any here.
  const filePart: any = {
    uri: photoUri,
    name: filename,
    type: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
  };
  form.append('progress_photo', filePart);
  return form;
}

/** Fetch every user's log for today for the social feed. */
export async function listTodaysLogs(): Promise<DailyLog[]> {
  const today = todayISO();
  return pb
    .collection('daily_logs')
    .getFullList<DailyLog>({
      filter: `date = "${today}"`,
      expand: 'user',
      sort: '-created',
    });
}

/** Fetch a specific user's recent logs (for the profile screen). */
export async function listUserLogs(userId: string, limit = 30): Promise<DailyLog[]> {
  const result = await pb.collection('daily_logs').getList<DailyLog>(1, limit, {
    filter: `user = "${userId}"`,
    sort: '-date',
  });
  return result.items;
}

/** Return the PocketBase file URL for a record's progress photo. */
export function photoUrl(log: DailyLog): string | null {
  if (!log.progress_photo) return null;
  return pb.files.getURL(log as any, log.progress_photo);
}
