import { describe, expect, it } from "vitest";
import { normalizeMatch } from "@coach/domain";
import { generateHistory, type GenerateOptions } from "@coach/synthetic";
import { analyzeMatch, type MatchAnalysis } from "./match.js";
import { buildTimeline, detectAnomalies, findInflection, findInflections } from "./longitudinal.js";

function analyses(opts: Partial<GenerateOptions> = {}): MatchAnalysis[] {
  return generateHistory({ seed: 31, puuid: "me", gameName: "Me", tagLine: "T", platform: "euw1", count: 120, ...opts })
    .map((g) => analyzeMatch(normalizeMatch(g.match), g.timeline, "me"))
    .filter((a): a is MatchAnalysis => a !== null);
}

describe("inflection points", () => {
  it("does not invent changes in a stable player", () => {
    // Patch split set outside the history so the environment is constant.
    const found = findInflections(analyses({ patchSplitIndex: 0, traits: { csPerMin: 6.5 } }));
    expect(found.filter((f) => f.metric === "csPerMin")).toHaveLength(0);
  });

  it("finds a real improvement and attributes it to the player when the environment is stable", () => {
    const inf = findInflection(analyses({ patchSplitIndex: 0, traits: { csPerMin: 5.5, improvement: { fromIndex: 50, csPerMinDelta: 1.8 } } }), "csPerMin")!;
    expect(inf).not.toBeNull();
    expect(inf.direction).toBe("improved");
    expect(inf.after.mean - inf.before.mean).toBeGreaterThan(1);
    expect(inf.attribution).toBe("player");
    expect(inf.kind).toBe("observation");
  });

  it("refuses to credit the player when the change coincides with a patch change", () => {
    const inf = findInflection(analyses({ patchSplitIndex: 50, traits: { csPerMin: 5.5, improvement: { fromIndex: 50, csPerMinDelta: 1.8 } } }), "csPerMin")!;
    expect(inf).not.toBeNull();
    expect(inf.attribution).not.toBe("player");
    expect(inf.kind).toBe("hypothesis");
    expect(inf.context.join(" ")).toMatch(/parche/);
  });
});

describe("anomalies", () => {
  it("calls a single odd game variance, never a change", () => {
    for (const a of detectAnomalies(analyses({ patchSplitIndex: 0 }))) {
      if (a.count < 3) expect(a.verdict).toBe("variance");
    }
  });

  it("flags a sustained shift in the latest games as a possible (not consolidated) change", () => {
    const list = detectAnomalies(analyses({ patchSplitIndex: 0, traits: { csPerMin: 5, improvement: { fromIndex: 5, csPerMinDelta: 4 } } }));
    const cs = list.find((a) => a.metric === "csPerMin" && a.direction === "better");
    expect(cs?.verdict).toBe("possible_change");
    expect(cs?.explanation).toMatch(/aún no está consolidado/);
  });
});

describe("timeline", () => {
  it("lists patch changes and consolidated inflections in chronological order", () => {
    const all = analyses({ patchSplitIndex: 60, traits: { csPerMin: 5.5, improvement: { fromIndex: 30, csPerMinDelta: 1.8 } } });
    const tl = buildTimeline(all, findInflections(all));
    expect(tl.some((e) => e.type === "patch")).toBe(true);
    expect(tl.some((e) => e.type === "inflection")).toBe(true);
    for (let i = 1; i < tl.length; i++) expect(tl[i]!.at).toBeGreaterThanOrEqual(tl[i - 1]!.at);
  });
});
