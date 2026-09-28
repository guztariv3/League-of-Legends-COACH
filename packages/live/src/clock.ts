/**
 * Server time for the private web Live relay. A PC whose clock is minutes off can still share:
 * the companion measures the site's clock (NTP-style, from one request's round trip) and stamps
 * each frame with the moment its data was *acquired*, expressed in server time. The site keeps
 * judging freshness by absolute server time, so data acquired long ago stays old however late
 * it is sent, and a replayed request never becomes current.
 *
 * The offset is measured against the monotonic clock (`performance.now()`), not the PC's wall
 * clock, so changing the PC time after a capture cannot move that capture. A capture's age is the
 * larger of its monotonic and wall-clock ages: if either clock jumps or stops (sleep), data can
 * only look older, never newer.
 */

/** A round trip longer than this gives too uncertain an offset; the sample is discarded. */
export const MAX_SYNC_RTT_MS = 3000;
/** Re-measure the offset this often (clocks drift and can be changed while the app runs). */
export const SYNC_EVERY_MS = 5 * 60_000;
/** Offsets beyond this are worth telling the player about (their PC clock is off). */
export const NOTABLE_OFFSET_MS = 10_000;
/** Wall and monotonic clocks disagreeing by more than this since the last sample: re-measure. */
export const CLOCK_JUMP_MS = 2000;

/** One moment on both local clocks: the PC's wall clock and the monotonic clock. */
export interface Stamp { wall: number; mono: number }
export const stampNow = (): Stamp => ({ wall: Date.now(), mono: performance.now() });

export interface ClockSample {
  /** Server − PC wall clock: how far the PC clock is off (for the player). */
  offset: number;
  /** Server − monotonic clock: what frames are stamped with. */
  monoOffset: number;
  rtt: number;
  at: Stamp;
}

/**
 * Offsets from one request: sent at `t0`, answered with `serverTime`, received at `t1`. Null when
 * the round trip is unusable.
 */
export function clockSample(t0: Stamp, serverTime: number, t1: Stamp): ClockSample | null {
  const rtt = t1.mono - t0.mono;
  if (!Number.isFinite(serverTime) || rtt < 0 || rtt > MAX_SYNC_RTT_MS) return null;
  return {
    offset: Math.round(serverTime - (t0.wall + t1.wall) / 2),
    monoOffset: serverTime - (t0.mono + t1.mono) / 2,
    rtt, at: t1,
  };
}

/** How long ago `acquired` was: the larger of both clocks' readings, never negative. */
export function ageOf(acquired: Stamp, now: Stamp): number {
  return Math.max(0, now.mono - acquired.mono, now.wall - acquired.wall);
}

export class ServerClock {
  private sample: ClockSample | null = null;

  /** Keeps the new sample (the latest measurement wins: the PC clock may have been changed). */
  update(sample: ClockSample | null): boolean {
    if (!sample) return false;
    this.sample = sample;
    return true;
  }

  /**
   * True before the first measurement, when it is old, after a rejection, or when the wall clock
   * moved differently from the monotonic one (the PC time was changed, or the PC slept).
   */
  needsSync(now: Stamp): boolean {
    const s = this.sample;
    if (!s) return true;
    const mono = now.mono - s.at.mono;
    return mono > SYNC_EVERY_MS || Math.abs(now.wall - s.at.wall - mono) > CLOCK_JUMP_MS;
  }

  invalidate(): void { this.sample = null; }

  get offset(): number | null { return this.sample?.offset ?? null; }

  /**
   * Server time at which data acquired at `acquired` was read, seen from `now`: the server's
   * current time minus the capture's age. Null without a measurement: nothing is stamped with a
   * guess. A later re-measurement or PC clock change never makes a capture younger.
   */
  capturedAt(acquired: Stamp, now: Stamp): number | null {
    if (!this.sample) return null;
    return Math.round(now.mono + this.sample.monoOffset - ageOf(acquired, now));
  }
}

/** "7 min", "45 s": how far the PC clock is from the site's, for the status line. */
export function describeOffset(offset: number): string {
  const s = Math.abs(offset) / 1000;
  const size = s >= 90 ? `${Math.round(s / 60)} min` : `${Math.round(s)} s`;
  return `${size} ${offset > 0 ? "behind" : "ahead of"} the site`;
}
