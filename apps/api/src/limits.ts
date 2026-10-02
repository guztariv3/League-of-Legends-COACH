import type { Context } from "hono";

/** Small fixed-window limiter (pairing-code guessing, sign-in and sign-up attempts). */
export class AttemptLimiter {
  private hits = new Map<string, { windowStart: number; n: number }>();
  constructor(private readonly max: number, private readonly windowMs: number, private readonly maxKeys = 10_000) {}
  allow(key: string, now = Date.now()): boolean {
    // Forget finished windows now and then, so a flood of distinct keys can't grow the map forever.
    if (this.hits.size >= this.maxKeys) for (const [k, v] of this.hits) if (now - v.windowStart >= this.windowMs) this.hits.delete(k);
    const h = this.hits.get(key);
    if (!h || now - h.windowStart >= this.windowMs) {
      // Do not evict active counters: rotating keys must not reset another caller's quota.
      if (!h && this.hits.size >= this.maxKeys) return false;
      this.hits.set(key, { windowStart: now, n: 1 });
      return true;
    }
    h.n = Math.min(h.n + 1, this.max + 1);
    return h.n <= this.max;
  }
}

// The proxy appends the real client address last; earlier entries can be forged by the client.
export const clientIp = (c: Context) => c.req.header("x-forwarded-for")?.split(",").pop()?.trim() || "local";
