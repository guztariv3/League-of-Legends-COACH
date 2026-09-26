import { describe, expect, it } from "vitest";
import { analyzeMatch, type MatchAnalysis } from "@coach/analysis";
import { normalizeMatch } from "@coach/domain";
import { analyzeDraft } from "@coach/draft";
import { fetchBundle, syntheticSource } from "@coach/knowledge";
import { generateHistory } from "@coach/synthetic";
import { gamePlan } from "./index.js";

const bundle = await fetchBundle(syntheticSource());
const history: MatchAnalysis[] = generateHistory({ seed: 8, puuid: "me", gameName: "Me", tagLine: "T", platform: "euw1", count: 80 })
  .map((g) => analyzeMatch(normalizeMatch(g.match), g.timeline, "me"))
  .filter((a): a is MatchAnalysis => a !== null);

function plan(myChampion: string, enemies: string[], laneOpponent?: string, allies: string[] = ["Brannoc", "Oshra", "Sylvaine", "Harrow"], games = history) {
  const input = { myChampion, allies, enemies, laneOpponent };
  const draft = analyzeDraft(input, bundle.champions, games);
  return gamePlan({ myChampion, laneOpponent, enemies, draft, history: games, bundle });
}

describe("coach game plan", () => {
  it("names the biggest threat from the enemy composition, as a hypothesis with its rating", () => {
    const p = plan("Aurelith", ["Korvane", "Brannoc", "Myrr", "Ilsa", "Dravok"], "Korvane");
    expect(p.biggestThreat?.basis).toBe("hypothesis");
    expect(["Korvane", "Ilsa"]).toContain(p.biggestThreat?.text);
    expect(p.biggestThreat?.why).toMatch(/damage rating/);
    expect(p.enemyPowerSpike?.text).toBe("Korvane: level 6 and their first completed item");
    expect(p.enemyPowerSpike?.why).toMatch(/general tendency/);
  });

  it("uses the player's own first-item timing and loadout with the champion", () => {
    const p = plan("Aurelith", ["Korvane", "Brannoc", "Myrr", "Ilsa", "Dravok"], "Korvane");
    expect(p.loadout.games).toBeGreaterThanOrEqual(3);
    expect(p.loadout.maxOrder).toEqual(["Q", "W", "E"]);
    expect(p.loadout.spells?.ids).toHaveLength(2);
    expect(p.yourPowerSpike?.basis).toBe("observation");
    expect(p.yourPowerSpike?.text).toMatch(/around minute \d+/);
    expect(p.primaryObjective).not.toBeNull();
  });

  it("falls back to facts, never to invented numbers, without the player's games", () => {
    const p = plan("Aurelith", ["Korvane", "Brannoc"], "Korvane", [], []);
    expect(p.yourPowerSpike).toMatchObject({ text: "Level 6", basis: "fact" });
    expect(p.loadout).toMatchObject({ games: 0, keystone: null, spells: null, maxOrder: null, firstItem: null });
    expect(p.primaryObjective?.text).toBe("Reach Level 6 without falling behind");
  });

  it("points at position when the team has no frontline, and at vision against several assassins", () => {
    const p = plan("Aurelith", ["Korvane", "Oshra", "Myrr"], undefined, ["Sylvaine", "Ilsa", "Veyl"]);
    expect(p.lookFor?.text).toBe("Fights where you have the better position");
    expect(p.avoid?.text).toBe("Walking alone without vision");
  });
});
