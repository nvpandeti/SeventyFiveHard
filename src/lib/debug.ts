import { DEBUG_LOGS } from '../config';

type LogPayload = Record<string, unknown>;

function stamp(scope: string, message: string): string {
  return `[DEBUG][${new Date().toISOString()}][${scope}] ${message}`;
}

function normalizeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return { error };
}

export function debugEnabled(): boolean {
  return DEBUG_LOGS;
}

export function debugLog(scope: string, message: string, payload?: LogPayload): void {
  if (!DEBUG_LOGS) return;
  if (payload) {
    console.log(stamp(scope, message), payload);
    return;
  }
  console.log(stamp(scope, message));
}

export function debugWarn(scope: string, message: string, payload?: LogPayload): void {
  if (!DEBUG_LOGS) return;
  if (payload) {
    console.warn(stamp(scope, message), payload);
    return;
  }
  console.warn(stamp(scope, message));
}

export function debugError(scope: string, message: string, error?: unknown): void {
  if (!DEBUG_LOGS) return;
  if (typeof error === 'undefined') {
    console.error(stamp(scope, message));
    return;
  }
  console.error(stamp(scope, message), normalizeError(error));
}
