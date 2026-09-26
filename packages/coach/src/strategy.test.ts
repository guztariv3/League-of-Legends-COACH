import { describe, expect, it } from "vitest";
import { AllGameData, emptyState, goldDifference, objectives, PolicyEngine, reduceState } from "@coach/live";
import { strategyFacts } from "./index.js";

const player = (name: string, team: "ORDER" | "CHAOS", position: string, gold: number) => ({
  championName: name, riotId: `${name}#NA1`, team, position, level: 11, items: [{ itemID: 1, price: gold, count: 1 }],
});
const state = (events: Record<string, unknown>[] = [], mid = 5000) => reduceState(emptyState(), AllGameData.parse({
  activePlayer: { riotId: "Ahri#NA1", level: 11, currentGold: 300 },
  allPlayers: [
    player("Ahri", "ORDER", "MIDDLE", mid), player("Garen", "ORDER", "TOP", 4000),
    player("Syndra", "CHAOS", "MIDDLE", 3600), player("Darius", "CHAOS", "TOP", 3000),
  ],
  events: { Events: events },
  gameData: { gameMode: "CLASSIC", gameTime: 1200, mapNumber: 11 },
}));

describe("strategy facts", () => {
  it("reports team and lane item-gold gaps as facts, not orders", () => {
    const s = state();
    const facts = strategyFacts({ gold: goldDifference(s), objectives: objectives(s), myName: "Ahri#NA1" });
    expect(facts.map((f) => f.headline)).toEqual(["Your team is 2.4k item gold ahead", "You are 1.4k item gold ahead of Syndra"]);
    expect(facts.every((f) => f.basis === "fact" && f.kind === "strategy")).toBe(true);
    const policy = new PolicyEngine();
    for (const f of facts) expect(policy.check("objective_taken", `${f.headline}. ${f.reasons.join(" ")}`).allowed).toBe(true);
  });

  it("stays quiet on small gaps and sums up dragons", () => {
    const s = state([
      { EventID: 1, EventName: "DragonKill", EventTime: 300, KillerName: "Garen#NA1", DragonType: "Fire" },
      { EventID: 2, EventName: "DragonKill", EventTime: 900, KillerName: "Garen#NA1", DragonType: "Earth" },
    ], 3700);
    const facts = strategyFacts({ gold: goldDifference(s), objectives: objectives(s), myName: "Ahri#NA1" });
    expect(facts.map((f) => f.headline)).toEqual(["Dragons: your team 2 · enemy 0"]);
    expect(facts[0]!.reasons[0]).toBe("Your team: 2 (Fire, Earth). Enemy team: 0.");
  });
});
