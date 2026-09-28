import { describe, expect, it } from "vitest";
import { ageOf, CLOCK_JUMP_MS, clockSample, describeOffset, MAX_SYNC_RTT_MS, ServerClock, SYNC_EVERY_MS, type Stamp } from "./clock.js";

const SERVER = 1_800_000_000_000;
const TEN_MIN = 10 * 60_000;
/** A PC whose wall clock is `skew` off the server's; `mono` is its monotonic clock. */
const at = (mono: number, skew = 0): Stamp => ({ wall: SERVER + skew + mono, mono });

describe("server clock for the Live relay", () => {
  it("measures a PC clock that runs ahead or behind, from the round trip midpoint", () => {
    // 200 ms round trip; the site answers with its time at the midpoint.
    const ahead = clockSample(at(1000, TEN_MIN), SERVER + 1100, at(1200, TEN_MIN))!;
    expect(ahead.offset).toBe(-TEN_MIN);
    expect(ahead.monoOffset).toBe(SERVER);
    const behind = clockSample(at(1000, -TEN_MIN), SERVER + 1100, at(1200, -TEN_MIN))!;
    expect(behind.offset).toBe(TEN_MIN);
    expect(clockSample(at(0), SERVER + 50, at(100))!.offset).toBe(0);
  });

  it("discards samples with an unusable round trip", () => {
    expect(clockSample(at(0), SERVER, at(MAX_SYNC_RTT_MS + 1))).toBeNull();
    expect(clockSample(at(100), SERVER, at(50))).toBeNull();
    expect(clockSample(at(0), Number.NaN, at(10))).toBeNull();
  });

  it("stamps the moment data was acquired, so old data stays old in server time", () => {
    const clock = new ServerClock();
    expect(clock.capturedAt(at(0), at(0))).toBeNull(); // no measurement: nothing is stamped with a guess
    clock.update(clockSample(at(1000, TEN_MIN), SERVER + 1100, at(1200, TEN_MIN)));
    const now = at(5000, TEN_MIN);
    expect(clock.capturedAt(now, now)).toBe(SERVER + 5000);
    // Acquired 60 s before it is sent: still 60 s old after conversion, however late it is sent.
    expect(clock.capturedAt(at(5000, TEN_MIN), at(65_000, TEN_MIN))).toBe(SERVER + 5000);
  });

  it("a PC clock change and a re-measurement between acquisition and sending never make a capture younger", () => {
    const clock = new ServerClock();
    clock.update(clockSample(at(0), SERVER + 50, at(100)));
    const acquired = at(1000); // true server time of the read: SERVER + 1000
    // 30 s later the player sets the PC clock back 25 s; the relay re-measures.
    const later = at(31_000, -25_000);
    expect(clock.needsSync(later)).toBe(true); // wall and monotonic clocks disagree
    clock.update(clockSample(at(30_900, -25_000), SERVER + 30_950, later));
    expect(clock.offset).toBe(25_000);
    // Still acquired at SERVER + 1000: 30 s old, not 5 s.
    expect(clock.capturedAt(acquired, later)).toBe(SERVER + 1000);
    // Clock set forward instead: the wall age is larger, so the capture only looks older.
    const forward = at(31_000, 60_000);
    clock.update(clockSample(at(30_900, 60_000), SERVER + 30_950, forward));
    expect(clock.capturedAt(acquired, forward)).toBe(SERVER + 31_000 - 90_000);
    // Without re-measuring, a set-back wall clock does not move the capture either.
    const fresh = new ServerClock();
    fresh.update(clockSample(at(0), SERVER + 50, at(100)));
    expect(fresh.capturedAt(acquired, at(31_000, -25_000))).toBe(SERVER + 1000);
  });

  it("uses the larger age when the monotonic clock stood still (PC asleep)", () => {
    // Monotonic clock advanced 1 s while the wall clock advanced 90 s.
    expect(ageOf({ wall: 0, mono: 0 }, { wall: 90_000, mono: 1000 })).toBe(90_000);
    expect(ageOf({ wall: 0, mono: 0 }, { wall: -60_000, mono: 1000 })).toBe(1000);
  });

  it("re-measures after a while, after invalidation, and when the PC clock jumps", () => {
    const clock = new ServerClock();
    expect(clock.needsSync(at(0))).toBe(true);
    clock.update(clockSample(at(1000), SERVER, at(1100)));
    expect(clock.needsSync(at(1100 + SYNC_EVERY_MS - 1))).toBe(false);
    expect(clock.needsSync(at(1100 + SYNC_EVERY_MS + 1))).toBe(true);
    expect(clock.needsSync(at(2000, CLOCK_JUMP_MS + 1))).toBe(true);
    expect(clock.needsSync(at(2000, CLOCK_JUMP_MS - 1))).toBe(false);
    clock.invalidate();
    expect(clock.needsSync(at(1200))).toBe(true);
  });

  it("describes the difference for the player", () => {
    expect(describeOffset(TEN_MIN)).toBe("10 min behind the site");
    expect(describeOffset(-45_000)).toBe("45 s ahead of the site");
  });
});
