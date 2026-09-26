import { describe, expect, it } from "vitest";
import { parseCatalog, suggestStarter } from "./index.js";
import { championJson, itemJson } from "./test-fixture.js";

const catalog = parseCatalog(itemJson, championJson);
const start = (championId: string, position: string | null, laneOpponentId: string | null = null, map: number | null = 11) =>
  suggestStarter({ catalog, map, position, championId, laneOpponentId });
const names = (s: ReturnType<typeof start>) => s?.items.map((i) => i.name);

describe("starting items", () => {
  it("reads attack range from Data Dragon", () => {
    expect(catalog.champions.get("Garen")?.attackRange).toBe(175);
  });

  it("gives mages Doran's Ring and physical laners Doran's Blade, with a potion", () => {
    expect(names(start("Syndra", "MIDDLE", "Ahri"))).toEqual(["Doran's Ring", "Health Potion"]);
    expect(names(start("Jinx", "BOTTOM", "Draven"))).toEqual(["Doran's Blade", "Health Potion"]);
    expect(start("Jinx", "BOTTOM")!.reasons[0]).toMatch(/physical damage/);
  });

  it("gives a melee laner against a ranged one Doran's Shield and says why, with the ranges", () => {
    const s = start("Garen", "TOP", "Syndra")!;
    expect(names(s)).toEqual(["Doran's Shield", "Health Potion"]);
    expect(s.reasons[0]).toMatch(/melee against a ranged opponent \(Syndra, 550 range vs your 175\)/);
    expect(names(start("Garen", "TOP", "Aatrox"))).toEqual(["Doran's Blade", "Health Potion"]);
  });

  it("covers the jungle and support roles", () => {
    expect(names(start("Malphite", "JUNGLE"))?.[0]).toBe("Mosstomper Seedling");
    expect(names(start("Zed", "JUNGLE"))?.[0]).toBe("Scorchclaw Pup");
    expect(start("Zed", "JUNGLE")!.alternatives.map((a) => a.name)).toContain("Gustwalker Hatchling");
    expect(names(start("Lux", "UTILITY"))?.[0]).toBe("World Atlas");
  });

  it("says nothing outside Summoner's Rift or without a position", () => {
    expect(start("Ahri", "MIDDLE", null, 12)).toBeNull();
    expect(start("Ahri", null)).toBeNull();
  });
});
