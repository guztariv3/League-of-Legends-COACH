/**
 * Server time for the private web Live relay. A PC whose clock is minutes off can still share:
 * the companion measures the site's clock (NTP-style, from one request's round trip) and stamps
 * each frame with the moment its data was *observed*, converted to server time. The site keeps
 * judging freshness by absolute server time, so data observed long ago stays old however late
 * it is sent, and a replayed request never becomes current.
 */

/** A round trip longer than this gives too uncertain an offset; the sample is discarded. */
export const MAX_SYNC_RTT_MS = 3000;
/** Re-measure the offset this often (clocks drift and can be changed while the app runs). */
export const SYNC_EVERY_MS = 5 * 60_000;
/** Offsets beyond this are worth telling the player about (their PC clock is off). */
export const NOTABLE_OFFSET_MS = 10_000;

export interface ClockSample { offset: number; rtt: number; at: number }

/**
 * Offset (server − client) from one request: sent at `t0`, answered with `serverTime`, received
 * at `t1`, all but `serverTime` in the client's clock. Null when the round trip is unusable.
 */
export function clockSample(t0: number, serverTime: number, t1: number): ClockSample | null {
  const rtt = t1 - t0;
  if (!Number.isFinite(serverTime) || rtt < 0 || rtt > MAX_SYNC_RTT_MS) return null;
  return { offset: Math.round(serverTime - (t0 + t1) / 2), rtt, at: t1 };
}

export class ServerClock {
  private sample: ClockSample | null = null;

  /** Keeps the new sample (the latest measurement wins: the PC clock may have been changed). */
  update(sample: ClockSample | null): boolean {
    if (!sample) return false;
    this.sample = sample;
    return true;
  }

  /** True before the first measurement, when it is old, or after a rejection. */
  needsSync(now: number): boolean {
    return !this.sample || now - this.sample.at > SYNC_EVERY_MS;
  }

  invalidate(): void { this.sample = null; }

  get offset(): number | null { return this.sample?.offset ?? null; }

  /**
   * Server time of a moment in the client's clock (e.g. when the data was read). Null without a
   * measurement: nothing is stamped with a guess.
   */
  toServer(clientMs: number): number | null {
    return this.sample ? Math.round(clientMs + this.sample.offset) : null;
  }
}

/** "7 min", "45 s": how far the PC clock is from the site's, for the status line. */
export function describeOffset(offset: number): string {
  const s = Math.abs(offset) / 1000;
  const size = s >= 90 ? `${Math.round(s / 60)} min` : `${Math.round(s)} s`;
  return `${size} ${offset > 0 ? "behind" : "ahead of"} the site`;
}
