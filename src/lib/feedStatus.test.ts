import { describe, expect, it } from 'vitest';
import { getFeedLogStatus } from './feedStatus';

const TODAY = '2026-08-09';
const YESTERDAY = '2026-08-08';
const TOMORROW = '2026-08-10';

describe('getFeedLogStatus', () => {
  it('returns complete when log is completed regardless of date', () => {
    expect(getFeedLogStatus(TODAY, true, TODAY)).toBe('complete');
    expect(getFeedLogStatus(YESTERDAY, true, TODAY)).toBe('complete');
    expect(getFeedLogStatus(TOMORROW, true, TODAY)).toBe('complete');
  });

  it('returns in-progress for todays log that is not yet completed', () => {
    expect(getFeedLogStatus(TODAY, false, TODAY)).toBe('in-progress');
  });

  it('returns failed for a past day that was not completed', () => {
    // 'failed' status exists so callers can decide how to render it (e.g. no badge)
    expect(getFeedLogStatus(YESTERDAY, false, TODAY)).toBe('failed');
    expect(getFeedLogStatus('2026-01-01', false, TODAY)).toBe('failed');
  });

  it('handles PocketBase datetime strings with time component', () => {
    expect(getFeedLogStatus('2026-08-08 14:30:00.000Z', false, TODAY)).toBe('failed');
    expect(getFeedLogStatus('2026-08-08 14:30:00.000Z', true, TODAY)).toBe('complete');
  });
});
