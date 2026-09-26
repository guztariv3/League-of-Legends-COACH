import { describe, expect, it } from "vitest";
import { parseCatalog } from "@coach/itemization";
import { AllGameData, emptyState, reduceState } from "@coach/live";
import { championJson, itemJson } from "../../itemization/src/test-fixture.js";
import { liveCoach, pickNow, type Slot } from "./index.js";

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

  it("works without a catalog: no item advice, but the rest still runs", () => {
    const c = liveCoach({ state: state(700, [], { Q: 1, W: 1, E: 1, R: 0 }, 4), catalog: null, skillHistory: [QMAX, QMAX, QMAX] });
    expect(c.items).toBeNull();
    expect(c.skill?.headline).toBe("Level up: Q");
    expect(c.gold?.rows).toHaveLength(1);
  });
});
