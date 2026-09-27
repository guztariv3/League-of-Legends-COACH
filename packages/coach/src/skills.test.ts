import { describe, expect, it } from "vitest";
import { adviseSkill, maxRank, usualMaxOrder, type Slot } from "./index.js";

const QMAX: Slot[] = [1, 2, 3, 1, 1, 4, 1, 2, 1, 2, 4, 2, 2, 3, 3, 4, 3, 3];
const EMAX: Slot[] = [3, 1, 2, 3, 3, 4, 3, 1, 3, 1, 4, 1, 1, 2, 2, 4, 2, 2];

describe("skill advisor", () => {
  it("knows the standard caps", () => {
    expect(maxRank(1, 1)).toBe(1);
    expect(maxRank(1, 3)).toBe(2);
    expect(maxRank(1, 18)).toBe(5);
    expect([5, 6, 11, 16].map((l) => maxRank(4, l))).toEqual([0, 1, 2, 3]);
  });

  it("recommends R whenever a rank opens, as a fact", () => {
    const d = adviseSkill({ champion: "Ahri", level: 6, ranks: { q: 3, w: 1, e: 1, r: 0 }, skillPoints: 1, history: [] })!;
    expect(d).toMatchObject({ headline: "Level up: R", basis: "fact", ref: "R" });
  });

  it("follows the player's own order, with how often they did it", () => {
    const d = adviseSkill({ champion: "Ahri", level: 4, ranks: { q: 1, w: 1, e: 1, r: 0 }, skillPoints: 1, history: [QMAX, QMAX, QMAX, EMAX] })!;
    expect(d).toMatchObject({ headline: "Level up: Q", basis: "observation" });
    expect(d.reasons[0]).toBe("In 3 of your last 4 games with Ahri you took Q at this point.");
    expect(d.evidence.find((e) => e.label === "You usually max")?.value).toBe("Q → W → E");
  });

  it("stays silent on basic abilities without enough of the player's games", () => {
    expect(adviseSkill({ champion: "Ahri", level: 4, ranks: { q: 1, w: 1, e: 1, r: 0 }, skillPoints: 1, history: [QMAX, QMAX] })).toBeNull();
  });

  it("never suggests an ability that can't take a rank now", () => {
    // Level 2: Q is capped at 1, so a history that took Q twice falls back to the other option.
    const history: Slot[][] = [[1, 1, 2], [1, 1, 2], [1, 2, 3], [1, 1, 3]];
    const d = adviseSkill({ champion: "Ahri", level: 2, ranks: { q: 1, w: 0, e: 0, r: 0 }, skillPoints: 1, history })!;
    expect(d.headline).toBe("Level up: W");
  });

  it("does nothing without points or for champions with their own ability rules", () => {
    expect(adviseSkill({ champion: "Ahri", level: 4, ranks: { q: 2, w: 1, e: 1, r: 0 }, skillPoints: 0, history: [QMAX, QMAX, QMAX] })).toBeNull();
    expect(adviseSkill({ champion: "Udyr", level: 3, ranks: { q: 1, w: 1, e: 0, r: 1 }, skillPoints: 1, history: [QMAX, QMAX, QMAX] })).toBeNull();
  });

  it("reads the usual max order", () => {
    expect(usualMaxOrder([QMAX, QMAX, EMAX])).toEqual([1, 2, 3]);
    expect(usualMaxOrder([[1, 2, 3]])).toBeNull();
  });

  describe("Master+ reference (phase 4)", () => {
    const reference = { max: ["Q", "W", "E"] as ("Q" | "W" | "E")[], sequence: [1, 3, 2, 1, 1, 4, 1, 2, 1], games: 700, total: 1000, patch: "16.19", patchLabel: "current" as const };

    it("follows the common first level-ups, labelled with the patch and the sample", () => {
      const d = adviseSkill({ champion: "Ahri", level: 2, ranks: { q: 1, w: 0, e: 0, r: 0 }, skillPoints: 1, history: [], reference })!;
      expect(d.headline).toBe("Level up: E");
      expect(d.reasons[0]).toMatch(/Master\+ players on patch 16\.19 most often take E at this level/);
      expect(d.evidence[0]).toMatchObject({ source: "global_stats", sampleSize: 1000 });
      expect(d.confidence).toBeLessThan(0.8); // a common order is never "strong"
    });

    it("after the first levels, follows the common max order within the caps", () => {
      // Level 10, Q already at its cap of 5: W is next in Q → W → E.
      const d = adviseSkill({ champion: "Ahri", level: 10, ranks: { q: 5, w: 2, e: 1, r: 1 }, skillPoints: 1, history: [], reference })!;
      expect(d.headline).toBe("Level up: W");
      expect(d.reasons[0]).toMatch(/max Q → W → E/);
    });

    it("says when the numbers come from the previous patch", () => {
      const d = adviseSkill({ champion: "Ahri", level: 2, ranks: { q: 1, w: 0, e: 0, r: 0 }, skillPoints: 1, history: [], reference: { ...reference, patchLabel: "previous", patch: "16.18" } })!;
      expect(d.reasons[0]).toMatch(/patch 16\.18 \(previous patch\)/);
    });

    it("the player's own order wins once there are enough games", () => {
      const d = adviseSkill({ champion: "Ahri", level: 4, ranks: { q: 1, w: 1, e: 1, r: 0 }, skillPoints: 1, history: [EMAX, EMAX, EMAX], reference })!;
      expect(d.headline).toBe("Level up: E");
      expect(d.evidence[0]!.source).toBe("your_games");
    });
  });
});
