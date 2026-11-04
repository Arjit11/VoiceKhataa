/**
 * lib/rateLimit.ts
 *
 * In-memory sliding-window rate limiter.
 * 60 requests per 60 seconds per IP.
 * Resets on cold start (acceptable for a demo/single-instance deploy).
 */

const WINDOW_MS  = 60_000; // 60 seconds
const MAX_REQ    = 60;     // per window per IP

interface Record {
  timestamps: number[];
}

// Module-level store — persists across requests within the same process.
const store = new Map<string, Record>();

/** Returns { ok: true } if under the limit, or { ok: false, retryAfter } if over. */
export function checkRateLimit(ip: string): { ok: boolean; retryAfter?: number } {
  const now   = Date.now();
  const entry = store.get(ip) ?? { timestamps: [] };

  // Slide the window: drop timestamps older than WINDOW_MS
  entry.timestamps = entry.timestamps.filter((t) => now - t < WINDOW_MS);

  if (entry.timestamps.length >= MAX_REQ) {
    // Oldest timestamp tells us when the first slot opens up
    const oldestTs   = entry.timestamps[0];
    const retryAfter = Math.ceil((oldestTs + WINDOW_MS - now) / 1000);
    store.set(ip, entry);
    return { ok: false, retryAfter };
  }

  entry.timestamps.push(now);
  store.set(ip, entry);
  return { ok: true };
}
