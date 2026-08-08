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

/** Total number of days in the 75 Hard challenge. */
export const CHALLENGE_LENGTH = 75;
