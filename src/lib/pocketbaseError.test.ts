import { describe, expect, it } from 'vitest';
import { explainAuthError } from './pocketbaseError';

describe('explainAuthError', () => {
  it('maps 400 auth failures to a helpful credential message', () => {
    expect(explainAuthError({ status: 400 })).toBe('Invalid email or password.');
  });

  it('prefers backend response message when provided', () => {
    expect(
      explainAuthError({
        status: 400,
        response: { message: 'Failed to authenticate.' },
      }),
    ).toBe('Failed to authenticate.');
  });

  it('maps network-like failures to backend connectivity guidance', () => {
    expect(explainAuthError({ status: 0 })).toContain('Cannot reach backend');
    expect(explainAuthError({ status: 404 })).toContain('Cannot reach backend');
  });
});
