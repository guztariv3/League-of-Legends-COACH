import { describe, expect, it } from "vitest";
import { normalizeMatch } from "@coach/domain";
import { generateHistory } from "@coach/synthetic";
import { analyzeMatch, ANALYSIS_VERSION } from "./match.js";

describe("analysis v4", () => {
  it("records skill order, purchases and the new lane metrics", () => {
    const [game] = generateHistory({ seed: 404, count: 12, puuid: "me", gameName: "Me", tagLine: "NA1", platform: "na1" })
      .filter((g) => g.timeline && g.match.info.gameMode === "CLASSIC" && g.scenario !== "remake");
    const a = analyzeMatch(normalizeMatch(game!.match), game!.timeline, "me")!;
    expect(a.analysisVersion).toBe(ANALYSIS_VERSION);
    expect(a.skillOrder?.slice(0, 6)).toEqual([1, 2, 3, 1, 1, 4]);
    expect(a.purchases?.length).toBeGreaterThan(0);
    expect(a.damagePerMin).toBeGreaterThan(0);
    expect(a.goldShare).toBeGreaterThan(0);
    expect(a.goldShare).toBeLessThan(1);
    expect(a.soloDeaths).not.toBeNull();
    expect(a.damageTaken).toBeGreaterThan(0);
    if (a.durationSec >= 900 && a.laneOpponentChampion) expect(a.csDiff15).not.toBeNull();
  });

  it("keeps the timeline-only facts empty when there is no timeline", () => {
    const [game] = generateHistory({ seed: 404, count: 12, puuid: "me", gameName: "Me", tagLine: "NA1", platform: "na1" })
      .filter((g) => g.match.info.gameMode === "CLASSIC");
    const a = analyzeMatch(normalizeMatch(game!.match), null, "me")!;
    expect(a.skillOrder).toBeNull();
    expect(a.purchases).toBeNull();
    expect(a.soloDeaths).toBeNull();
    expect(a.csDiff15).toBeNull();
  });
});
