import { describe, expect, it } from "vitest";
import { arithmetic, htmlText, parseChampionKits, parseItems, parseRunes, parseStatLines, parseSummonerSpells, wikiText } from "./gamedata.js";
import { gameData } from "./test-data.js";

// Real data from the current patch (packages/knowledge/fixtures/game-data, refreshed by the
// "Game data snapshot" workflow). Assertions check properties of the data, not a frozen patch,
// so a new snapshot only fails them if the parsing breaks.
const data = gameData();
const items = parseItems(data.ddragonItems, data.merakiItems);
const shop = items.filter((i) => i.purchasable);
const kits = parseChampionKits(data.ddragonChampions, data.merakiChampions);
const runes = parseRunes(data.perks, data.perkStyles);
const spells = parseSummonerSpells(data.summoners);
const item = (name: string) => shop.find((i) => i.name === name)!;
const kit = (id: string) => kits.find((k) => k.id === id)!;

describe("wiki and client markup", () => {
  it("renders templates, links and bold as plain text", () => {
    expect(wikiText("Reduces damage from {{tip|critical strike|critical strikes}} by 30%.")).toBe("Reduces damage from critical strikes by 30%.");
    expect(wikiText("[[on-hit]] and [[damage|proc]] damage, '''bonus''' health")).toBe("on-hit and proc damage, bonus health");
    expect(wikiText("deal {{as|{{rd|30|15}} bonus}} damage")).toBe("deal 30 (melee) / 15 (ranged) bonus damage");
    expect(wikiText("Gain {{as|{{pp|key=%|0 to 30 for 11|0 to 10000|type='''maximum''' health}}|hp}} size.")).toBe("Gain 0–30% (based on maximum health) size.");
    expect(wikiText("equal to{{ft|8% of that amount|details}} (30s)")).toBe("equal to 8% of that amount (30s)");
    expect(wikiText("deal {{rd|150 + (200-150)/10*(x-1) for 13|150*0.8 + (200*0.8-150*0.8)/10*(x-1) for 13}} damage")).toBe("deal 150+ (based on level) (melee) / 120+ (based on level) (ranged) damage");
    expect(wikiText("within {{tip|cr|icononly=true}} 600 units,then")).toBe("within 600 units, then");
    expect(htmlText("<mainText><passive>Name</passive><br>Deal <magicDamage>50 magic damage</magicDamage>.</mainText>")).toBe("Name\nDeal 50 magic damage.");
  });

  it("evaluates wiki arithmetic without running code", () => {
    expect(arithmetic("(75*0.2)+75")).toBe(90);
    expect(arithmetic("150 + (200-150)/10*(x-1)", 11)).toBe(200);
    expect(arithmetic("150 + (200-150)/10*(x-1)", 1)).toBe(150);
    expect(arithmetic("x+1")).toBeNull();
    expect(arithmetic("alert(1)")).toBeNull();
    expect(arithmetic("2**3")).toBeNull();
  });

  it("reads the stat lines of a Data Dragon description, keeping flat and percent apart", () => {
    const { stats, other } = parseStatLines("<stats><attention>45</attention> Attack Damage<br><attention>35%</attention> Armor Penetration<br><attention>7</attention> Mystery</stats>");
    expect(stats).toEqual({ attackDamage: { flat: 45, percent: 0 }, armorPenetration: { flat: 0, percent: 35 } });
    expect(other).toEqual([{ label: "Mystery", value: 7, percent: false }]);
  });
});

describe("items (real data)", () => {
  it("lists the Summoner's Rift shop once per item, with price and stats", () => {
    expect(shop.length).toBeGreaterThan(150);
    expect(new Set(shop.map((i) => i.name)).size).toBe(shop.length);
    for (const i of shop.filter((x) => x.rank.includes("LEGENDARY"))) {
      expect(i.gold, i.name).toBeGreaterThan(0);
      expect(Object.keys(i.stats).length + i.otherStats.length, i.name).toBeGreaterThan(0);
    }
  });

  it("recognises every stat line the shop uses", () => {
    expect(shop.flatMap((i) => i.otherStats.map((o) => `${i.name}: ${o.label}`))).toEqual([]);
  });

  it("keeps what each passive does, as readable text with its numbers", () => {
    const randuin = item("Randuin's Omen");
    expect(randuin.stats.armor?.flat).toBeGreaterThan(0);
    expect(randuin.effects.some((e) => /critical strike/i.test(e.text))).toBe(true);
    const texts = items.flatMap((i) => i.effects.map((e) => e.text));
    expect(texts.filter((t) => /\{\{|\}\}|\[\[|'''|<[a-z]/i.test(t))).toEqual([]);
  });

  it("reads lethality, penetration, ability haste and mana, which the engine needs", () => {
    const has = (k: keyof (typeof shop)[number]["stats"]) => shop.some((i) => i.stats[k]);
    for (const k of ["lethality", "armorPenetration", "magicPenetration", "abilityHaste", "mana", "criticalStrikeChance", "healAndShieldPower"] as const) expect(has(k), k).toBe(true);
  });

  it("marks items the Wiki does not have yet instead of dropping them", () => {
    for (const i of shop.filter((x) => x.detail === "ddragon")) expect(Object.keys(i.stats).length + i.effects.length, i.name).toBeGreaterThan(0);
  });
});

describe("champion kits (real data)", () => {
  it("has a kit for every champion in the patch", () => {
    expect(kits.length).toBe(Object.keys((data.ddragonChampions as { data: object }).data).length);
    for (const k of kits) {
      expect(k.abilities.filter((a) => a.slot !== "P").length, k.id).toBeGreaterThanOrEqual(4);
      expect(k.stats.hp, k.id).toBeGreaterThan(0);
    }
  });

  it("knows each champion's resource and what its abilities cost", () => {
    expect(kit("Smolder").resource).toBe("MANA");
    expect(kit("Zed").resource).toBe("ENERGY");
    expect(kit("Garen").resource).toBe("NONE");
    // A mana champion's basic abilities cost mana at rank 1 (first form of each slot).
    const first = (id: string, slot: string) => kit(id).abilities.find((a) => a.slot === slot)!;
    expect(first("Smolder", "Q").cost?.[0]).toBeGreaterThan(0);
    expect(first("Smolder", "Q").resource).toBe("MANA");
    expect(first("Garen", "Q").cost).toBeNull();
  });

  it("has mana pools and costs for every mana champion", () => {
    for (const k of kits.filter((x) => x.resource === "MANA")) {
      expect(k.stats.mana, k.id).toBeGreaterThan(0);
      expect(["Q", "W", "E", "R"].some((s) => k.abilities.find((a) => a.slot === s)?.cost?.some((c) => c > 0)), k.id).toBe(true);
    }
  });

  it("keeps the Wiki's ratings and damage types where it has them", () => {
    const withWiki = kits.filter((k) => k.detail === "full");
    expect(withWiki.length).toBeGreaterThan(kits.length * 0.9);
    for (const k of withWiki) expect(k.ratings, k.id).not.toBeNull();
    expect(kit("Smolder").attackType).toBe("RANGED");
  });
});

describe("runes and summoner spells (real data)", () => {
  it("has the five trees, one keystone row each, and the three stat shard rows", () => {
    expect(runes.trees.map((t) => t.name).sort()).toEqual(["Domination", "Inspiration", "Precision", "Resolve", "Sorcery"]);
    for (const t of runes.trees) {
      expect(t.rows.length, t.name).toBe(4);
      expect(runes.runes.filter((r) => r.treeId === t.id && r.keystone).length, t.name).toBeGreaterThanOrEqual(3);
      expect(t.secondary.length, t.name).toBe(4);
    }
    expect(runes.shardRows).toHaveLength(3);
    for (const row of runes.shardRows) for (const id of row.shards) expect(runes.shards.some((s) => s.id === id)).toBe(true);
    for (const r of runes.runes) expect(r.short, r.name).not.toMatch(/<|@/);
  });

  it("lists the Summoner's Rift summoner spells only", () => {
    const names = spells.map((s) => s.name);
    for (const n of ["Flash", "Ignite", "Teleport", "Smite", "Heal", "Exhaust"]) expect(names).toContain(n);
    expect(spells.every((s) => s.modes.includes("CLASSIC") && s.cooldown !== null)).toBe(true);
    expect(new Set(names).size).toBe(names.length);
  });
});
