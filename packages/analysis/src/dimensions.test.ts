import { describe, expect, it } from "vitest";
import { normalizeMatch } from "@coach/domain";
import { generateHistory, type GenerateOptions } from "@coach/synthetic";
import { analyzeMatch, type MatchAnalysis } from "./match.js";
import { buildProfile, gameStateOf, gameStateSplit, patternScope } from "./dimensions.js";

function analyses(opts: Partial<GenerateOptions> = {}): MatchAnalysis[] {
  return generateHistory({ seed: 11, puuid: "me", gameName: "Me", tagLine: "T", platform: "euw1", count: 80, ...opts })
    .map((g) => analyzeMatch(normalizeMatch(g.match), g.timeline, "me"))
    .filter((a): a is MatchAnalysis => a !== null);
}

describe("game state", () => {
  const all = analyses();

  it("classifies only SR games with a timeline past minute 15", () => {
    for (const a of all) {
      if (a.mode !== "summoners_rift" || !a.hasTimeline || a.durationSec <= 900) expect(gameStateOf(a)).toBeNull();
    }
    expect(all.some((a) => gameStateOf(a) !== null)).toBe(true);
  });

  it("wins more often when ahead than when behind (synthetic sanity)", () => {
    const [ahead, , behind] = gameStateSplit(all);
    expect(ahead!.games).toBeGreaterThan(3);
    expect(behind!.games).toBeGreaterThan(3);
    expect(ahead!.winRate).toBeGreaterThan(behind!.winRate);
  });
});

describe("profile", () => {
  it("has no overall score and does not apply SR metrics to ARAM", () => {
    const profiles = buildProfile(analyses());
    const aram = profiles.find((p) => p.mode === "aram");
    const sr = profiles.find((p) => p.mode === "summoners_rift")!;
    expect(sr.dimensions.map((d) => d.id)).toEqual(expect.arrayContaining(["lane", "farm", "risk", "teamfight", "pool"]));
    if (aram) expect(aram.dimensions.map((d) => d.id)).not.toContain("farm");
    expect(JSON.stringify(profiles)).not.toMatch(/score/i);
  });

  it("skips farm for supports", () => {
    const profiles = buildProfile(analyses({ traits: { mainRole: "UTILITY", mainChampions: ["Myrr", "Harrow"] } }));
    expect(profiles.find((p) => p.mode === "summoners_rift")!.dimensions.map((d) => d.id)).not.toContain("farm");
  });
});

describe("cross-champion patterns", () => {
  const early = (a: MatchAnalysis) => (a.earlyDeaths === null ? null : a.earlyDeaths >= 2);

  it("detects a champion-specific pattern", () => {
    const res = patternScope(analyses({ traits: { earlyDeathRisk: 0.05, riskyChampion: "Aurelith" }, count: 120 }), early);
    expect(res.scope).toBe("champion");
    expect(res.champion).toBe("Aurelith");
  });

  it("detects a global pattern", () => {
    const res = patternScope(analyses({ traits: { earlyDeathRisk: 1 }, count: 120 }), early);
    expect(res.scope).toBe("global");
  });
});
