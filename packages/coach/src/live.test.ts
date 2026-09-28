import { describe, expect, it } from "vitest";
import { parseCatalog } from "@coach/itemization";
import { AllGameData, emptyState, reduceState } from "@coach/live";
import { championJson, itemJson } from "../../itemization/src/test-fixture.js";
import { certaintyOf, liveCoach, pickNow, type Slot } from "./index.js";

const catalog = parseCatalog(itemJson, championJson);
const QMAX: Slot[] = [1, 2, 3, 1, 1, 4, 1, 2, 1, 2, 4, 2, 2, 3, 3, 4, 3, 3];

function state(time: number, myItems: { itemID: number; price: number }[], abilities?: Record<string, number>, level = 1) {
  const p = (name: string, raw: string, team: "ORDER" | "CHAOS", position: string, items: { itemID: number; price: number }[] = []) =>
    ({ championName: name, rawChampionName: `game_character_displayname_${raw}`, riotId: `${name}#NA1`, team, position, level, items });
  return reduceState(emptyState(), AllGameData.parse({
    activePlayer: { riotId: "Garen#NA1", level, currentGold: 500, ...(abilities ? { abilities: Object.fromEntries(Object.entries(abilities).map(([k, v]) => [k, { abilityLevel: v }])) } : {}) },
    allPlayers: [p("Garen", "Garen", "ORDER", "TOP", myItems), p("Syndra", "Syndra", "CHAOS", "TOP")],
    events: { Events: [] },
    gameData: { gameMode: "CLASSIC", gameTime: time, mapNumber: 11 },
  }));
}

describe("live coach", () => {
  it("opens with the starting items for the matchup", () => {
    const c = liveCoach({ state: state(20, []), catalog });
    expect(c.starter?.items.map((i) => i.name)).toEqual(["Doran's Shield", "Health Potion"]);
    expect(pickNow(c.decisions)?.headline).toBe("Start: Doran's Shield + Health Potion");
  });

  it("switches to the next item once the game is under way", () => {
    const c = liveCoach({ state: state(600, [{ itemID: 1054, price: 450 }], undefined, 7), catalog });
    expect(c.starter).toBeNull();
    expect(c.decisions.find((d) => d.kind === "item")?.headline).toMatch(/^Next: /);
  });

  it("puts the ultimate first when a rank opens", () => {
    const c = liveCoach({ state: state(700, [{ itemID: 1054, price: 450 }], { Q: 3, W: 1, E: 1, R: 0 }, 6), catalog, skillHistory: [QMAX, QMAX, QMAX] });
    expect(c.skill?.headline).toBe("Level up: R");
  });

  it("uses the site's build engine answer when there is one, with the purchase path from the catalog", () => {
    const engine = {
      first: { id: 3165, name: "Morellonomicon", score: 1.4, why: ["It applies Grievous Wounds: Soraka: Q, W and R heal."] },
      next: [{ id: 3089, name: "Rabadon's Deathcap", score: 1.1, why: ["Gives 130 ability power."] }],
      boots: { id: 3111, name: "Mercury's Treads", score: 0.9, why: ["Gives 25 magic resist."] },
      situational: [{ id: 6655, name: "Luden's Companion", score: 0.8, why: [], when: "Against the shields from Lux." }],
      starter: null,
    };
    const c = liveCoach({ state: state(600, [{ itemID: 1026, price: 850 }], undefined, 7), catalog, engine });
    expect(c.items?.next?.item.name).toBe("Morellonomicon");
    expect(c.items?.next?.reasons[0]).toMatch(/Grievous Wounds/);
    expect(c.items?.next?.path.steps.find((st) => st.id === 1026)?.owned).toBe(true); // the Blasting Wand you have counts
    expect(c.items?.alternatives.map((a) => a.item.name)).toEqual(["Rabadon's Deathcap", "Luden's Companion"]);
    expect(c.items?.alternatives[1]?.reasons).toContain("Against the shields from Lux.");
    expect(c.items?.boots?.item.name).toBe("Mercury's Treads");
    expect(c.decisions.find((d) => d.kind === "item")?.headline).toBe("Next: Morellonomicon");
    // When the items arrive: Morellonomicon first (the Blasting Wand you hold lowers what's left), then boots and Rabadon's.
    expect(c.purchase?.milestones.map((m) => m.name)).toEqual(["Morellonomicon", "Mercury's Treads", "Rabadon's Deathcap"]);
    expect(c.purchase?.milestones[0]?.remaining).toBe(2950 - 850);
    expect(c.purchase?.pace).toBeGreaterThan(0);
    expect(c.purchase?.milestones[1]!.at!).toBeGreaterThan(c.purchase!.milestones[0]!.at!);
  });

  it("with enough gold, the item decision says what to buy now", () => {
    const engine = { first: { id: 3165, name: "Morellonomicon", score: 1.4, why: ["x"] }, next: [], boots: null, situational: [], starter: null };
    const base = state(600, [{ itemID: 1026, price: 850 }], undefined, 7);
    const c = liveCoach({ state: { ...base, gold: 900 }, catalog, engine });
    expect(c.purchase?.now?.buys.map((b) => b.name)).toEqual(["Oblivion Orb"]);
    expect(c.decisions.find((d) => d.kind === "item")?.evidence.find((e) => e.label === "Buy now")?.value).toBe("Oblivion Orb (800 gold)");
  });

  it("carries the engine's certainty, its close alternative and the standard-core note (phase 3)", () => {
    const engine = {
      first: { id: 3165, name: "Morellonomicon", score: 1.4, why: ["It applies Grievous Wounds: Soraka: Q, W and R heal."] },
      next: [], boots: null, situational: [], starter: null,
      certainty: "close" as const,
      alternative: { id: 3089, name: "Rabadon's Deathcap", score: 1.35, why: [], difference: "Rabadon's Deathcap gives more of the stats your kit uses." },
      adaptation: { standard: false, standardCore: [{ id: 3089, name: "Rabadon's Deathcap" }], note: "Morellonomicon instead of the standard Rabadon's Deathcap: it applies Grievous Wounds." },
    };
    const c = liveCoach({ state: state(600, [{ itemID: 1026, price: 850 }], undefined, 7), catalog, engine });
    const d = c.decisions.find((x) => x.kind === "item")!;
    expect(certaintyOf(d)).toBe("uncertain");
    expect(d.reasons[0]).toMatch(/instead of the standard Rabadon's Deathcap/);
    expect(d.alternatives).toEqual([{ label: "Rabadon's Deathcap", ref: "3089", reason: "Rabadon's Deathcap gives more of the stats your kit uses." }]);
    const strong = liveCoach({ state: state(600, [], undefined, 7), catalog, engine: { ...engine, certainty: "strong" as const, alternative: null, adaptation: { standard: true, standardCore: [], note: "Nothing in the enemy team changes Garen's standard core: continue with it." } } });
    const s2 = strong.decisions.find((x) => x.kind === "item")!;
    expect(certaintyOf(s2)).toBe("strong");
    expect(s2.reasons[0]).toMatch(/continue with it/);
  });

  it("opens with the engine's starting items when it gives them", () => {
    const engine = { first: null, next: [], boots: null, situational: [], starter: { items: [{ id: 1054, name: "Doran's Shield", gold: 450 }], why: ["You are melee against Syndra, who is ranged."] } };
    const c = liveCoach({ state: state(20, []), catalog, engine });
    expect(c.starter?.items.map((i) => i.name)).toEqual(["Doran's Shield"]);
    expect(c.starter?.reasons[0]).toMatch(/melee against Syndra/);
  });

  it("works without a catalog: no item advice, but the rest still runs", () => {
    const c = liveCoach({ state: state(700, [], { Q: 1, W: 1, E: 1, R: 0 }, 4), catalog: null, skillHistory: [QMAX, QMAX, QMAX] });
    expect(c.items).toBeNull();
    expect(c.skill?.headline).toBe("Level up: Q");
    expect(c.gold?.rows).toHaveLength(1);
  });
});
