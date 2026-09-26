import { describe, expect, it } from "vitest";
import { analyzeMatch, type MatchAnalysis } from "@coach/analysis";
import { normalizeMatch } from "@coach/domain";
import { generateHistory, type GenerateOptions } from "@coach/synthetic";
import { describeTarget, evaluateGoal, goalMet, proposeTarget, suggestGoals } from "./goals.js";
import { generateInsights } from "./index.js";

function analyses(opts: Partial<GenerateOptions> = {}): MatchAnalysis[] {
  return generateHistory({ seed: 21, puuid: "me", gameName: "Me", tagLine: "T", platform: "euw1", count: 60, ...opts })
    .map((g) => analyzeMatch(normalizeMatch(g.match), g.timeline, "me"))
    .filter((a): a is MatchAnalysis => a !== null);
}

describe("goals", () => {
  const all = analyses({ traits: { earlyDeathRisk: 1 } });

  it("proposes targets from the player's own better games", () => {
    const p = proposeTarget("earlyDeaths", all)!;
    expect(p.spec.target).toBeGreaterThanOrEqual(0);
    expect(p.baselineRate).toBeGreaterThan(0);
    expect(p.baselineRate).toBeLessThan(1);
    expect(describeTarget(p.spec)).toMatch(/at most/);
    expect(proposeTarget("earlyDeaths", all.slice(0, 3))).toBeNull();
  });

  it("never applies SR-only metrics to ARAM games", () => {
    for (const a of all.filter((x) => x.mode === "aram")) {
      expect(goalMet({ metric: "earlyDeaths", target: 1 }, a)).toBeNull();
      expect(goalMet({ metric: "csPerMin", target: 5 }, a)).toBeNull();
    }
  });

  it("does not declare mastery from a few good games", () => {
    const spec = { metric: "earlyDeaths" as const, target: 10 }; // trivially met
    const few = evaluateGoal(spec, 0.2, all.filter((a) => a.mode === "summoners_rift").slice(0, 5));
    expect(few.status).toBe("in_progress");
    const many = evaluateGoal(spec, 0.2, all.filter((a) => a.mode === "summoners_rift"));
    expect(many.status).toBe("consolidated");
    expect(evaluateGoal(spec, 0.2, []).status).toBe("collecting");
  });

  it("suggests at most one goal from an important insight and skips existing metrics", () => {
    const { insights } = generateInsights({ analyses: all, dataSource: "synthetic" });
    const s = suggestGoals(insights, all, []);
    expect(s.length).toBeLessThanOrEqual(1);
    if (s[0]) expect(suggestGoals(insights, all, [s[0].metric])).toHaveLength(0);
  });
});

describe("focus and corrections", () => {
  const all = analyses({ traits: { earlyDeathRisk: 1 }, count: 80 });

  it("hides dismissed insights", () => {
    const base = generateInsights({ analyses: all, dataSource: "synthetic" });
    const first = base.insights[0]!;
    const after = generateInsights({ analyses: all, dataSource: "synthetic" }, { dismissed: [first.id] });
    expect(after.insights.map((i) => i.id)).not.toContain(first.id);
  });

  it("puts focus-matching insights first without hiding the others", () => {
    const base = generateInsights({ analyses: all, dataSource: "synthetic" }, { maxVisible: 10 });
    const withMetric = base.insights.find((i) => i.metric);
    if (!withMetric) return;
    const focused = generateInsights({ analyses: all, dataSource: "synthetic" }, { maxVisible: 10, focus: withMetric.metric });
    expect(focused.insights[0]!.metric).toBe(withMetric.metric);
    expect(focused.insights).toHaveLength(base.insights.length);
  });
});
