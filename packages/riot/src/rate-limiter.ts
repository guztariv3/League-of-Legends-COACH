/**
 * Sliding-window rate limiter driven by Riot's rate-limit headers.
 *
 * Riot sends limits as "count:seconds" pairs, e.g. `X-App-Rate-Limit: 20:1,100:120`,
 * and enforces them per routing value (per region). Each (scope, key) keeps its own
 * windows. Before the first response we start from the conservative development-key
 * defaults, then adopt whatever the server reports.
 */
export interface Window {
  limit: number;
  seconds: number;
}

export const DEV_KEY_APP_LIMITS: Window[] = [
  { limit: 20, seconds: 1 },
  { limit: 100, seconds: 120 },
];

export function parseLimitHeader(value: string | null): Window[] | null {
  if (!value) return null;
  const windows: Window[] = [];
  for (const part of value.split(",")) {
    const [l, s] = part.trim().split(":").map(Number);
    if (!Number.isFinite(l) || !Number.isFinite(s) || !l || !s) return null;
    windows.push({ limit: l, seconds: s });
  }
  return windows.length ? windows : null;
}

interface Bucket {
  windows: Window[];
  /** Request timestamps (ms), oldest first. */
  hits: number[];
  /** Hard block until this time (after a 429). */
  blockedUntil: number;
}

export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly now: () => number = Date.now,
    private readonly defaults: Window[] = DEV_KEY_APP_LIMITS,
  ) {}

  private bucket(key: string, fallback: Window[]): Bucket {
    let b = this.buckets.get(key);
    if (!b) {
      b = { windows: fallback, hits: [], blockedUntil: 0 };
      this.buckets.set(key, b);
    }
    return b;
  }

  /** Milliseconds to wait before a request on these keys is allowed (0 = go). */
  delayFor(keys: { key: string; fallback?: Window[] }[]): number {
    const t = this.now();
    let wait = 0;
    for (const { key, fallback } of keys) {
      const b = this.bucket(key, fallback ?? this.defaults);
      wait = Math.max(wait, b.blockedUntil - t);
      const longest = Math.max(...b.windows.map((w) => w.seconds)) * 1000;
      while (b.hits.length && b.hits[0]! <= t - longest) b.hits.shift();
      for (const w of b.windows) {
        const since = t - w.seconds * 1000;
        const inWindow = b.hits.filter((h) => h > since);
        if (inWindow.length >= w.limit) {
          const oldest = inWindow[inWindow.length - w.limit]!;
          wait = Math.max(wait, oldest + w.seconds * 1000 - t + 1);
        }
      }
    }
    return Math.max(0, wait);
  }

  record(keys: string[]): void {
    const t = this.now();
    for (const k of keys) this.bucket(k, this.defaults).hits.push(t);
  }

  updateLimits(key: string, windows: Window[] | null): void {
    if (windows) this.bucket(key, windows).windows = windows;
  }

  block(key: string, ms: number): void {
    const b = this.bucket(key, this.defaults);
    b.blockedUntil = Math.max(b.blockedUntil, this.now() + ms);
  }
}
