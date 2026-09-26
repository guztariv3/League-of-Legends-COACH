import { describe, expect, it } from "vitest";
import type { Insight } from "@coach/insights";
import { parseCatalog, suggestItems, type PlayerView } from "@coach/itemization";
import { championJson, itemJson } from "../../itemization/src/test-fixture.js";
import { decide, fromInsight, fromItemSuggestions, isAdjustment, pickNow, rankDecisions, type CoachDecision } from "./index.js";

const d = (id: string, priority: CoachDecision["priority"], confidence: number, kind: CoachDecision["kind"] = "item") =>
  decide({ id, kind, basis: "hypothesis", priority, confidence, headline: id, reasons: ["because"] });

describe("decision contract", () => {
  it("refuses a decision without a reason and clamps confidence", () => {
    expect(() => decide({ id: "x", kind: "item", basis: "fact", priority: "info", confidence: 0.5, headline: "x", reasons: ["  ", ""] })).toThrow(/no reason/);
    expect(d("a", "info", 7).confidence).toBe(1);
    expect(d("a", "info", -1).confidence).toBe(0);
  });

  it("ranks by priority, then confidence", () => {
    const ranked = rankDecisions([d("low", "info", 0.9), d("hi", "critical", 0.4), d("mid", "important", 0.8), d("mid2", "important", 0.6)]);
    expect(ranked.map((x) => x.id)).toEqual(["hi", "mid", "mid2", "low"]);
  });

  it("keeps the current Now card unless something more pressing appears", () => {
    const options = [d("a", "important", 0.9), d("b", "important", 0.6)];
    expect(pickNow(options)?.id).toBe("a");
    expect(pickNow(options, "b")?.id).toBe("b");
    expect(pickNow([...options, d("c", "critical", 0.5)], "b")?.id).toBe("c");
    expect(pickNow(options, "gone")?.id).toBe("a");
    expect(pickNow([])).toBeNull();
  });

  it("flags a changed recommendation of the same kind as an adjustment", () => {
    expect(isAdjustment(d("item:1", "info", 1), d("item:2", "info", 1))).toBe(true);
    expect(isAdjustment(d("item:1", "info", 1), d("item:1", "info", 1))).toBe(false);
    expect(isAdjustment(d("item:1", "info", 1), d("skill:3", "info", 1, "skill"))).toBe(false);
    expect(isAdjustment(null, d("item:1", "info", 1))).toBe(false);
  });
});

describe("adapters", () => {
  const catalog = parseCatalog(itemJson, championJson);
  const p = (championId: string, items: number[] = [], kills = 0, deaths = 0): PlayerView => ({ championId, champion: championId, items, kills, deaths, level: 11 });

  it("turns item suggestions into explained decisions with the enemy numbers as evidence", () => {
    const s = suggestItems({ catalog, map: 11, gold: 1000, me: p("Ahri", [6655]), enemies: [p("Syndra", [3089], 6), p("Brand", [6655], 4), p("Lux"), p("Malphite"), p("Jinx")] });
    const [item, boots] = fromItemSuggestions(s);
    expect(item).toMatchObject({ id: `item:${s.next!.item.id}`, kind: "item", headline: `Next: ${s.next!.item.name}`, basis: "hypothesis" });
    expect(item!.reasons.join(" ")).toMatch(/magic/);
    expect(item!.evidence.find((e) => e.label === "Enemy magic damage")?.source).toBe("this_game");
    expect(item!.alternatives.length).toBe(s.alternatives.length);
    expect(boots).toMatchObject({ kind: "boots", headline: `Boots: ${s.boots!.item.name}` });
  });

  it("turns an insight into a focus and drops suppressed ones", () => {
    const insight: Insight = {
      id: "early-deaths", kind: "observation", priority: "important", confidence: 0.7,
      title: "You die early in lane", detail: "2.1 deaths before 14:00 per game.", evidence: [{ label: "Games", value: "20" }],
      sampleSize: 20, matchIds: [], metric: "earlyDeaths", review: "Look at your first two deaths.",
    };
    expect(fromInsight(insight)).toMatchObject({ id: "focus:early-deaths", kind: "focus", basis: "observation", ref: "earlyDeaths" });
    expect(fromInsight(insight)!.evidence[0]).toMatchObject({ source: "your_games", sampleSize: 20 });
    expect(fromInsight({ ...insight, priority: "suppressed" })).toBeNull();
  });
});
