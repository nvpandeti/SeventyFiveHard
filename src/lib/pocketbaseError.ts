function firstNonEmptyString(values: Array<unknown>): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }
  return null;
}

export function explainAuthError(error: unknown): string {
  const err = error as any;
  const status = Number(err?.status ?? err?.response?.status ?? 0);

  const explicitMessage = firstNonEmptyString([
    err?.response?.message,
    err?.response?.data?.message,
    err?.response?.data?.identity?.message,
    err?.response?.data?.password?.message,
  ]);

  if (status === 400) {
    if (explicitMessage) {
      return explicitMessage;
    }
    return 'Invalid email or password.';
  }

  if (status === 403) {
    return explicitMessage ?? 'Your account is not allowed to sign in.';
  }

  if (status === 404 || status === 0) {
    return 'Cannot reach backend. Check EXPO_PUBLIC_PB_URL and ensure PocketBase is online.';
  }

  if (explicitMessage) {
    return explicitMessage;
  }

  if (typeof err?.message === 'string' && err.message.trim().length > 0) {
    return err.message;
  }

  return 'Sign-in failed.';
}
