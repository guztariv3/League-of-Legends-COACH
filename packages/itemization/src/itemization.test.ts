import { describe, expect, it } from "vitest";
import { parseCatalog, purchasePath, suggestItems, type PlayerView } from "./index.js";
import { championJson, itemJson } from "./test-fixture.js";

const catalog = parseCatalog(itemJson, championJson);
const p = (championId: string, items: number[] = [], kills = 0, deaths = 0): PlayerView => ({ championId, champion: championId, items, kills, deaths, level: 11 });

describe("catalog", () => {
  it("reads Data Dragon: finished items, boots, anti-heal; skips components, consumables and Ornn upgrades", () => {
    expect(catalog.items.get(6655)?.completed).toBe(true);
    expect(catalog.items.get(1026)?.completed).toBe(false);
    expect(catalog.items.get(3020)).toMatchObject({ boots: true, completed: false });
    expect(catalog.items.get(1001)?.boots).toBe(false);
    expect(catalog.items.get(7001)?.completed).toBe(false);
    expect(catalog.items.get(2003)?.completed).toBe(false);
    expect(catalog.items.get(3165)?.antiHeal).toBe(true);
    expect(catalog.items.get(3157)?.maps).toEqual([11]);
    expect(catalog.champions.get("Ahri")?.tags[0]).toBe("Mage");
  });
});

describe("suggestions follow the enemy team", () => {
  it("a mage against a fed magic team gets magic resist, with the reason and the names", () => {
    const s = suggestItems({ catalog, map: 11, gold: 1000, me: p("Ahri", [6655]), enemies: [p("Syndra", [3089], 6), p("Brand", [6655], 4), p("Lux"), p("Malphite"), p("Jinx")] });
    expect(s.enemy.magicShare).toBeGreaterThan(0.55);
    expect(s.next?.item.name).toBe("Velo de la banshee");
    expect(s.next?.reasons.join(" ")).toMatch(/daño rival es mágico \(Syndra, Brand/);
    expect(s.boots?.item.name).toBe("Botas de mercurio");
  });

  it("a mage dying to physical assassins gets armor, and says why", () => {
    const s = suggestItems({ catalog, map: 11, gold: 500, me: p("Ahri", [6655], 1, 5), enemies: [p("Zed", [3072], 7), p("Draven", [3031], 5), p("Garen"), p("Jinx"), p("Malphite")] });
    expect(s.next?.item.name).toBe("Reloj de arena de Zhonya");
    const why = s.next!.reasons.join(" ");
    expect(why).toMatch(/daño rival es físico/);
    expect(why).toMatch(/Vas 1\/5/);
  });

  it("anti-heal against lifesteal, only once", () => {
    const enemies = [p("Aatrox", [3072], 5), p("Draven", [3072], 4), p("Garen"), p("Malphite"), p("Lux")];
    const mage = suggestItems({ catalog, map: 11, gold: 0, me: p("Ahri", [6655]), enemies });
    expect(mage.next?.item.name).toBe("Morellonomicon");
    expect(mage.next?.reasons.join(" ")).toMatch(/Aatrox y Draven se curan con robo de vida: aplica Heridas graves/);
    const adc = suggestItems({ catalog, map: 11, gold: 0, me: p("Jinx", [3031]), enemies });
    expect(adc.next?.item.name).toBe("Recordatorio mortal");
    const already = suggestItems({ catalog, map: 11, gold: 0, me: p("Ahri", [6655, 3165]), enemies });
    expect(already.next?.item.name).not.toBe("Morellonomicon");
  });

  it("never suggests the other damage type, items you own, or items of another map", () => {
    const adc = suggestItems({ catalog, map: 12, gold: 0, me: p("Jinx", [3031]), enemies: [p("Zed"), p("Lux"), p("Garen"), p("Malphite"), p("Ahri")] });
    const all = [adc.next, ...adc.alternatives].map((x) => x!.item);
    expect(all.every((i) => !i.stats["FlatMagicDamageMod"])).toBe(true);
    expect(all.some((i) => i.id === 3031)).toBe(false);
    expect(adc.boots?.item.name).toBe("Grebas de berserker");
    const aram = suggestItems({ catalog, map: 12, gold: 0, me: p("Ahri", [6655], 0, 6), enemies: [p("Zed", [3072], 6), p("Draven", [3031], 5), p("Garen"), p("Jinx"), p("Malphite")] });
    expect([aram.next, ...aram.alternatives].some((x) => x?.item.id === 3157)).toBe(false);
  });

  it("a tank against physical damage and lifesteal gets armor with anti-heal", () => {
    const s = suggestItems({ catalog, map: 11, gold: 0, me: p("Malphite", [3065]), enemies: [p("Zed", [3072], 4), p("Draven", [3072], 5), p("Jinx", [3031]), p("Garen"), p("Lux")] });
    expect(s.next?.item.name).toBe("Malla de espinas");
    expect(s.next?.reasons.join(" ")).toMatch(/Heridas graves/);
  });

  it("explains with facts and never gives orders", () => {
    const cases = [
      suggestItems({ catalog, map: 11, gold: 0, me: p("Ahri", [], 0, 4), enemies: [p("Zed", [3072], 5), p("Syndra", [3089], 3), p("Garen"), p("Malphite"), p("Jinx")] }),
      suggestItems({ catalog, map: 12, gold: 3000, me: p("Jinx"), enemies: [p("Aatrox", [3072], 2), p("Lux"), p("Brand"), p("Malphite"), p("Zed")] }),
    ];
    for (const s of cases) {
      for (const x of [s.next, ...s.alternatives, s.boots]) {
        expect(x?.reasons.length).toBeGreaterThan(0);
        for (const r of x!.reasons) expect(r).not.toMatch(/\b(compra|cómpralo|debes|tienes que|ve a|haz)\b/i);
      }
    }
  });

  it("keeps the previous suggestion while it is still close to the best", () => {
    const base = { catalog, map: 11, gold: 0, me: p("Ahri", [6655]), enemies: [p("Syndra", [], 1), p("Zed", [], 1), p("Garen"), p("Malphite"), p("Jinx")] };
    const first = suggestItems(base);
    const second = suggestItems({ ...base, previous: first.alternatives[0]!.item.id });
    if (first.alternatives[0]!.score >= first.next!.score * 0.9) expect(second.next?.item.id).toBe(first.alternatives[0]!.item.id);
    else expect(second.next?.item.id).toBe(first.next?.item.id);
  });
});

describe("how to buy it", () => {
  it("counts components you already have and what your gold buys now", () => {
    const banshee = catalog.items.get(3102)!;
    const path = purchasePath(banshee, [1026], 950, catalog);
    expect(path.steps).toEqual([
      { id: 1026, name: "Vara explosiva", gold: 850, owned: true },
      { id: 1057, name: "Capa de negatrón", gold: 900, owned: false },
    ]);
    expect(path.remaining).toBe(3000 - 850);
    expect(path.affordableNow).toEqual({ id: 1057, name: "Capa de negatrón", gold: 900 });
    expect(purchasePath(banshee, [1026], 2200, catalog).affordableNow).toEqual({ id: 3102, name: "Velo de la banshee", gold: 2150 });
    // Two of the same component: each owned copy counts once.
    const luden = purchasePath(catalog.items.get(6655)!, [1052], 100, catalog);
    expect(luden.steps.map((s) => s.owned)).toEqual([true, false, false]);
    expect(luden.affordableNow).toBeNull();
  });
});
