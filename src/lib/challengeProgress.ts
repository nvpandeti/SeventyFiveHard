import type { AppUser } from '../types';

export interface ProgressSnapshot {
  currentDay: number;
  completedDays: number;
}

function toSafeInt(value: unknown, fallback: number, min: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.floor(parsed));
}

export function getProgressSnapshot(user: Pick<AppUser, 'current_day' | 'completed_days'> | null | undefined): ProgressSnapshot {
  return {
    currentDay: toSafeInt(user?.current_day, 1, 1),
    completedDays: toSafeInt(user?.completed_days, 0, 0),
  };
}

export function getNextProgressAfterMidnight(
  user: Pick<AppUser, 'current_day' | 'completed_days'> | null | undefined,
  submittedYesterday: boolean,
): ProgressSnapshot {
  const snapshot = getProgressSnapshot(user);
  if (!submittedYesterday) {
    return { currentDay: 1, completedDays: 0 };
  }

  return {
    currentDay: snapshot.currentDay + 1,
    completedDays: snapshot.completedDays + 1,
  };
}

export function getCurrentDayLogDayNumber(
  previousDayCompleted: boolean,
  previousDayNumber: unknown,
): number {
  if (!previousDayCompleted) {
    return 1;
  }

  return toSafeInt(previousDayNumber, 1, 1) + 1;
}

export function getCurrentDayLogDayNumberRepair(
  currentLogDayNumber: unknown,
  previousDayCompleted: boolean,
  previousDayNumber: unknown,
): { expectedDayNumber: number; needsRepair: boolean } {
  const expectedDayNumber = getCurrentDayLogDayNumber(previousDayCompleted, previousDayNumber);
  const normalizedCurrent = toSafeInt(currentLogDayNumber, 1, 1);

  return {
    expectedDayNumber,
    needsRepair: normalizedCurrent !== expectedDayNumber,
  };
}
