import { describe, expect, it } from "vitest";
import { analyzeMatch, compareMeans, summarize, wilson, type MatchAnalysis } from "@coach/analysis";
import { normalizeMatch } from "@coach/domain";
import { generateHistory, type GenerateOptions } from "@coach/synthetic";
import { confidenceFor, generateInsights, matchHeadline } from "./index.js";

function analyses(opts: Partial<GenerateOptions> = {}): MatchAnalysis[] {
  return generateHistory({ seed: 3, puuid: "me", gameName: "Me", tagLine: "T", platform: "euw1", count: 50, ...opts })
    .map((g) => analyzeMatch(normalizeMatch(g.match), g.timeline, "me"))
    .filter((a): a is MatchAnalysis => a !== null);
}

describe("stats", () => {
  it("wilson interval widens with small samples", () => {
    const small = wilson(3, 5);
    const big = wilson(60, 100);
    expect(small.high - small.low).toBeGreaterThan(big.high - big.low);
  });
  it("does not call noise a consolidated change", () => {
    expect(compareMeans([5, 6, 5, 6], [6, 5, 6, 5]).consolidated).toBe(false);
    const a = Array.from({ length: 10 }, (_, i) => 8 + (i % 2) * 0.1);
    const b = Array.from({ length: 10 }, (_, i) => 6 + (i % 2) * 0.1);
    expect(compareMeans(a, b).consolidated).toBe(true);
  });
});

describe("analysis", () => {
  const all = analyses();

  it("excludes remakes and unsupported modes from aggregation", () => {
    const s = summarize(all);
    expect(s.analyzableGames).toBeLessThanOrEqual(s.totalGames);
    expect(s.modes.every((m) => m.mode !== "unsupported")).toBe(true);
  });

  it("does not apply Summoner's Rift metrics to ARAM", () => {
    for (const a of all.filter((x) => x.mode === "aram")) {
      expect(a.csPerMin).toBeNull();
      expect(a.goldDiff10).toBeNull();
      expect(a.earlyDeaths).toBeNull();
    }
  });
});

describe("insights", () => {
  it("says it does not know when data is insufficient", () => {
    const res = generateInsights({ analyses: analyses({ count: 3 }), dataSource: "synthetic" });
    expect(res.insufficientData).toBe(true);
    expect(res.insights).toHaveLength(0);
  });

  it("detects the early-death pattern of a risky synthetic player", () => {
    const res = generateInsights({
      analyses: analyses({ traits: { earlyDeathRisk: 1 } }),
      dataSource: "synthetic",
    });
    const early = res.insights.find((i) => i.id === "early-deaths");
    expect(early).toBeDefined();
    expect(early!.kind).toBe("observation");
    expect(early!.confidence).toBeGreaterThanOrEqual(0.45);
  });

  it("never shows more than the requested number of insights", () => {
    const res = generateInsights({ analyses: analyses({ traits: { earlyDeathRisk: 1 } }), dataSource: "synthetic" }, { maxVisible: 2 });
    expect(res.insights.length).toBeLessThanOrEqual(2);
  });

  it("caps hypothesis confidence below observations", () => {
    const h = confidenceFor({ sampleSize: 500, completeness: 1, kind: "hypothesis" });
    const o = confidenceFor({ sampleSize: 500, completeness: 1, kind: "observation" });
    expect(h).toBeLessThan(o);
  });

  it("produces headlines only for analyzable games", () => {
    const all = analyses();
    const remake = all.find((a) => !a.analyzable);
    if (remake) expect(matchHeadline(remake, { deathsPerMin: 0.2, kda: 3 })).toBeNull();
  });
});
