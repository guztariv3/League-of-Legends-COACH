import { describe, expect, it } from "vitest";
import { normalizeMatch } from "@coach/domain";
import { generateHistory, SYNTHETIC_CHAMPIONS, type GenerateOptions } from "@coach/synthetic";
import { analyzeMatch, type MatchAnalysis } from "./match.js";
import { adaptationByOpponentClass, adaptationToLead } from "./adaptation.js";

const tags = new Map(SYNTHETIC_CHAMPIONS.map((c) => [c.id, c.tags as string[]]));
function analyses(opts: Partial<GenerateOptions> = {}): MatchAnalysis[] {
  return generateHistory({ seed: 41, puuid: "me", gameName: "Me", tagLine: "T", platform: "euw1", count: 150, ...opts })
    .map((g) => analyzeMatch(normalizeMatch(g.match), g.timeline, "me"))
    .filter((a): a is MatchAnalysis => a !== null);
}

describe("adaptability", () => {
  it("only produces hypotheses, and needs at least 5 games per context", () => {
    const res = adaptationByOpponentClass(analyses(), (id) => tags.get(id));
    expect(res.length).toBeGreaterThan(0);
    for (const c of res) {
      expect(c.kind).toBe("hypothesis");
      expect(c.games).toBeGreaterThanOrEqual(5);
    }
  });

  it("does not claim (in)sufficient adaptation for a player without context effects", () => {
    const res = adaptationByOpponentClass(analyses({ traits: { earlyDeathRisk: 0.3 } }), (id) => tags.get(id));
    expect(res.filter((c) => c.verdict !== "no_clear_difference").length).toBeLessThanOrEqual(1);
  });

  it("skips opponents with unknown class", () => {
    expect(adaptationByOpponentClass(analyses(), () => undefined)).toHaveLength(0);
  });

  it("evaluates risk with a lead", () => {
    const lead = adaptationToLead(analyses());
    if (lead) expect(["insufficient", "no_clear_difference"]).toContain(lead.verdict);
  });
});

describe("adaptability (positive case)", () => {
  it("detects extra early risk against one class of lane opponent", () => {
    const res = adaptationByOpponentClass(analyses({ count: 200, traits: { earlyDeathRisk: 0.1, riskVsClass: { tag: "Assassin", delta: 0.9 } } }), (id) => tags.get(id));
    const vs = res.find((c) => c.id === "vs-Assassin");
    expect(vs?.verdict).toBe("insufficient");
  });
});
