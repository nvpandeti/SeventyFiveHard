/**
 * App configuration.
 *
 * Set EXPO_PUBLIC_PB_URL in a .env file (or an app.config.ts extra field)
 * to point the app at your Cloudflare Tunnel URL, e.g.
 *   EXPO_PUBLIC_PB_URL=https://random-subdomain.trycloudflare.com
 *
 * Falls back to a local address for development on a simulator.
 */
export const PB_URL =
  process.env.EXPO_PUBLIC_PB_URL?.trim() || 'http://127.0.0.1:8090';

function parseBooleanEnv(raw?: string): boolean {
  if (!raw) return false;
  const value = raw.trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes' || value === 'on';
}

/**
 * Toggle verbose app logging.
 * Set EXPO_PUBLIC_DEBUG_LOGS=true in .env to enable.
 */
export const DEBUG_LOGS = parseBooleanEnv(process.env.EXPO_PUBLIC_DEBUG_LOGS);

/**
 * Optional debug-only PocketBase superuser credentials for manual admin actions
 * from the app (e.g. triggering rollover).
 */
export const PB_SUPERUSER_EMAIL =
  process.env.EXPO_PUBLIC_PB_SUPERUSER_EMAIL?.trim() || '';
export const PB_SUPERUSER_PASSWORD =
  process.env.EXPO_PUBLIC_PB_SUPERUSER_PASSWORD?.trim() || '';

/**
 * Toggle visibility of the manual rollover debug button on Today screen.
 * Set EXPO_PUBLIC_SHOW_DEBUG_RUN_ROLLOVER_BUTTON=true in .env to show it.
 */
export const SHOW_DEBUG_RUN_ROLLOVER_BUTTON = parseBooleanEnv(
  process.env.EXPO_PUBLIC_SHOW_DEBUG_RUN_ROLLOVER_BUTTON,
);

/** Total number of days in the 75 Hard challenge. */
export const CHALLENGE_LENGTH = 75;
