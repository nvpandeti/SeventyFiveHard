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

/** Total number of days in the 75 Hard challenge. */
export const CHALLENGE_LENGTH = 75;
