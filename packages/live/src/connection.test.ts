import { describe, expect, it } from "vitest";
import { ConnectionHealth, CONNECTION_GRACE_MS } from "./connection.js";

describe("live connection continuity", () => {
  it("keeps a brief interruption reconnecting and resets the grace period on recovery", () => {
    const c = new ConnectionHealth();
    expect(c.observe(true, 0)).toBe("fresh");
    expect(c.observe(false, 1000)).toBe("reconnecting");
    expect(c.observe(false, 20_000)).toBe("reconnecting");
    expect(c.observe(true, 21_000)).toBe("fresh");
    expect(c.observe(false, 40_000)).toBe("reconnecting");
    expect(c.observe(false, 40_000 + CONNECTION_GRACE_MS - 1)).toBe("reconnecting");
    expect(c.observe(false, 40_000 + CONNECTION_GRACE_MS)).toBe("ended");
    expect(c.observe(true, 80_000)).toBe("fresh");
  });
});
