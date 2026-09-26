import { describe, expect, it } from "vitest";
import { analyzeMatch, type MatchAnalysis } from "@coach/analysis";
import { normalizeMatch } from "@coach/domain";
import { fetchBundle, syntheticSource } from "@coach/knowledge";
import { generateHistory } from "@coach/synthetic";
import { analyzeDraft, composition } from "./index.js";

const bundle = await fetchBundle(syntheticSource());
const champs = new Map(bundle.champions.map((c) => [c.id, c]));
const history: MatchAnalysis[] = generateHistory({ seed: 8, puuid: "me", gameName: "Me", tagLine: "T", platform: "euw1", count: 80 })
  .map((g) => analyzeMatch(normalizeMatch(g.match), g.timeline, "me"))
  .filter((a): a is MatchAnalysis => a !== null);

describe("composition", () => {
  it("counts frontline from official class tags and estimates damage from ratings", () => {
    const c = composition(["Brannoc", "Talgrim", "Aurelith"], champs);
    expect(c.frontline).toBe(2);
    expect(c.magicShare).toBeGreaterThan(0);
    expect(c.magicShare).toBeLessThan(1);
    expect(c.unrated).toBe(0);
  });
});

describe("draft analysis", () => {
  it("flags a mostly-magic enemy as a hypothesis, never a fact", () => {
    const d = analyzeDraft({ myChampion: "Aurelith", allies: ["Brannoc", "Oshra", "Sylvaine", "Harrow"], enemies: ["Veyl", "Myrr", "Aurelith", "Nimue", "Brannoc"] }, bundle.champions, history);
    const p = [...d.keyPoints, ...d.morePoints].find((x) => x.id === "enemy-damage")!;
    expect(p.kind).toBe("hypothesis");
    expect(p.title).toMatch(/magic/);
  });

  it("shows at most 3 key points and keeps the rest on demand", () => {
    const d = analyzeDraft({ myChampion: "Aurelith", allies: ["Korvane", "Sylvaine", "Ilsa", "Nimue"], enemies: ["Brannoc", "Dravok", "Talgrim", "Korvane", "Oshra"], laneOpponent: "Korvane" }, bundle.champions, history);
    expect(d.keyPoints.length).toBeLessThanOrEqual(3);
    expect(d.keyPoints.map((p) => p.weight)).toEqual([...d.keyPoints.map((p) => p.weight)].sort((a, b) => b - a));
    expect([...d.keyPoints, ...d.morePoints].some((p) => p.id === "no-frontline")).toBe(true);
  });

  it("uses the player's own history with sample sizes", () => {
    const d = analyzeDraft({ myChampion: "Aurelith", allies: [], enemies: ["Korvane"], laneOpponent: "Korvane" }, bundle.champions, history);
    const own = history.filter((a) => a.analyzable && a.championName === "Aurelith");
    expect(d.personal.withChampion.games).toBe(own.length);
    expect(d.personal.vsOpponent).not.toBeNull();
  });

  it("reports unknown champions instead of guessing", () => {
    const d = analyzeDraft({ myChampion: "Aurelith", allies: ["NotAChampion"], enemies: [] }, bundle.champions, history);
    expect(d.unknownChampions).toEqual(["NotAChampion"]);
  });
});
