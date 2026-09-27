import { describe, expect, it } from "vitest";
import { clockSample, describeOffset, MAX_SYNC_RTT_MS, ServerClock, SYNC_EVERY_MS } from "./clock.js";

const SERVER = 1_800_000_000_000;
const TEN_MIN = 10 * 60_000;

describe("server clock for the Live relay", () => {
  it("measures a PC clock that runs ahead or behind, from the round trip midpoint", () => {
    // PC 10 min ahead: it sends at SERVER+10min, the site answers SERVER+100ms, 200 ms round trip.
    const ahead = clockSample(SERVER + TEN_MIN, SERVER + 100, SERVER + TEN_MIN + 200)!;
    expect(ahead.offset).toBe(-TEN_MIN);
    const behind = clockSample(SERVER - TEN_MIN, SERVER + 100, SERVER - TEN_MIN + 200)!;
    expect(behind.offset).toBe(TEN_MIN);
    expect(clockSample(SERVER, SERVER + 50, SERVER + 100)!.offset).toBe(0);
  });

  it("discards samples with an unusable round trip", () => {
    expect(clockSample(0, SERVER, MAX_SYNC_RTT_MS + 1)).toBeNull();
    expect(clockSample(100, SERVER, 50)).toBeNull();
    expect(clockSample(0, Number.NaN, 10)).toBeNull();
  });

  it("stamps the moment data was observed, so old data stays old in server time", () => {
    const clock = new ServerClock();
    expect(clock.toServer(SERVER)).toBeNull(); // no measurement: nothing is stamped with a guess
    clock.update(clockSample(SERVER + TEN_MIN, SERVER + 100, SERVER + TEN_MIN + 200));
    const now = SERVER + TEN_MIN + 1000;
    expect(clock.toServer(now)).toBe(SERVER + 1000);
    // Read 60 s ago (client clock): still 60 s old after conversion, however late it is sent.
    expect(clock.toServer(now - 60_000)).toBe(SERVER + 1000 - 60_000);
  });

  it("re-measures after a while, after invalidation, and follows a changed PC clock", () => {
    const clock = new ServerClock();
    expect(clock.needsSync(0)).toBe(true);
    clock.update(clockSample(1000, SERVER, 1100));
    expect(clock.needsSync(1100 + SYNC_EVERY_MS - 1)).toBe(false);
    expect(clock.needsSync(1100 + SYNC_EVERY_MS + 1)).toBe(true);
    clock.invalidate();
    expect(clock.needsSync(1200)).toBe(true);
    clock.update(clockSample(5000, SERVER, 5100));
    clock.update(clockSample(5000 + TEN_MIN, SERVER + 10, 5100 + TEN_MIN)); // clock moved forward
    expect(clock.offset).toBe(SERVER + 10 - (5050 + TEN_MIN));
  });

  it("describes the difference for the player", () => {
    expect(describeOffset(TEN_MIN)).toBe("10 min behind the site");
    expect(describeOffset(-45_000)).toBe("45 s ahead of the site");
  });
});
