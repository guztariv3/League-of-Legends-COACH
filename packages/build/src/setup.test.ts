import { describe, expect, it } from "vitest";
import { parseChampionKits, parseRunes, parseSummonerSpells } from "@coach/knowledge";
import { gameData } from "@coach/knowledge/test-data";
import { recommendSetup } from "./index.js";

// Runes and summoner spells on the real patch data. The checks are properties that must hold
// for any champion, not a list of expected picks.
const data = gameData();
const kits = parseChampionKits(data.ddragonChampions, data.merakiChampions);
const runes = parseRunes(data.perks, data.perkStyles);
const spells = parseSummonerSpells(data.summoners);
const kit = (id: string) => kits.find((k) => k.id === id)!;
const runeById = new Map(runes.runes.map((r) => [r.id, r]));
const setup = (me: string, enemies: string[], position: string) =>
  recommendSetup({ me: kit(me), enemies: enemies.map((id) => ({ kit: kit(id) })), runes, spells, position });

const MIXED = ["Garen", "LeeSin", "Ahri", "Jinx", "Thresh"];
const CC = ["Leona", "Nautilus", "Sejuani", "Morgana", "Ashe"];
const BURST = ["Zed", "Kha'Zix".replace("'", ""), "Syndra", "Evelynn", "Pyke"];
const HEAL = ["Soraka", "Aatrox", "Vladimir", "Yuumi", "DrMundo"];
const CASES: [string, string][] = [["Ahri", "MIDDLE"], ["Jinx", "BOTTOM"], ["Malphite", "TOP"], ["Thresh", "UTILITY"], ["LeeSin", "JUNGLE"], ["Smolder", "BOTTOM"], ["Garen", "TOP"], ["Zed", "MIDDLE"], ["Soraka", "UTILITY"]];

describe("rune page", () => {
  it("is a legal page: a keystone and one rune per row of its tree, two runes from two rows of an allowed second tree, three shards", () => {
    for (const [me, pos] of CASES) {
      const r = setup(me, MIXED, pos).runes!;
      const tree = runes.trees.find((t) => t.name === r.primaryTree)!;
      const second = runes.trees.find((t) => t.name === r.secondaryTree)!;
      expect(tree.rows[0], me).toContain(r.keystone.id);
      r.primary.forEach((p, i) => expect(tree.rows[i + 1], me).toContain(p.id));
      expect(second.id, me).not.toBe(tree.id);
      expect(tree.secondary, me).toContain(second.id);
      const rows = r.secondary.map((p) => second.rows.findIndex((row) => row.includes(p.id)));
      expect(new Set(rows).size, me).toBe(2);
      expect(rows.every((i) => i > 0), me).toBe(true);
      r.shards.forEach((s, i) => expect(runes.shardRows[i]!.shards, me).toContain(s.id));
      expect([r.keystone, ...r.primary, ...r.secondary, ...r.shards].every((x) => x.why.length > 0), me).toBe(true);
    }
  });

  it("follows the kit: basic-attack champions get an attack keystone, ability champions an ability one", () => {
    for (const me of ["Jinx", "Smolder"]) expect(runeById.get(setup(me, MIXED, "BOTTOM").runes!.keystone.id)!.short, me).toMatch(/attack/i);
    for (const me of ["Ahri", "Soraka"]) expect(runeById.get(setup(me, MIXED, "MIDDLE").runes!.keystone.id)!.short, me).toMatch(/abilit|allies/i);
  });

  it("never gives mana runes to a champion without mana, nor crowd-control keystones to a kit without hard crowd control", () => {
    for (const k of kits.filter((x) => x.resource !== "MANA" && x.resource !== "ENERGY").slice(0, 25)) {
      const r = recommendSetup({ me: k, enemies: MIXED.map((id) => ({ kit: kit(id) })), runes, spells, position: "TOP" }).runes!;
      for (const p of [r.keystone, ...r.primary, ...r.secondary]) expect(runeById.get(p.id)!.short, `${k.id}: ${p.name}`).not.toMatch(/\bmana\b/i);
    }
    const noCc = kits.filter((k) => !k.abilities.some((a) => a.slot !== "P" && /\b(stun|root|knock|airborne|charm|fear|taunt|suppress|sleep|polymorph|snare|pull)/i.test(a.text)));
    expect(noCc.length).toBeGreaterThan(0);
    for (const k of noCc.slice(0, 15)) {
      const r = recommendSetup({ me: k, enemies: MIXED.map((id) => ({ kit: kit(id) })), runes, spells, position: "MIDDLE" }).runes!;
      expect(runeById.get(r.keystone.id)!.short, k.id).not.toMatch(/immobiliz/i);
    }
  });

  it("takes tenacity against heavy crowd control, and cites it", () => {
    const r = setup("Jinx", CC, "BOTTOM").runes!;
    const ten = r.shards.find((s) => /tenacity/i.test(s.name));
    expect(ten).toBeDefined();
    expect(ten!.why).toMatch(/crowd control/);
  });
});

describe("summoner spells", () => {
  it("two spells; the jungle takes the one that damages monsters, nobody else does", () => {
    for (const [me, pos] of CASES) {
      const s = setup(me, MIXED, pos).spells;
      expect(s, me).toHaveLength(2);
      expect(new Set(s.map((x) => x.id)).size, me).toBe(2);
      const smite = s.some((x) => /monster/i.test(spells.find((y) => y.id === x.id)!.text));
      expect(smite, me).toBe(pos === "JUNGLE");
      expect(s.every((x) => x.why.length > 0), me).toBe(true);
    }
  });

  it("the second spell follows the game: anti-healing damage against healers, damage reduction for a squishy support against burst", () => {
    const mid = setup("Ahri", HEAL, "MIDDLE").spells.map((x) => spells.find((y) => y.id === x.id)!.text).join(" ");
    expect(mid).toMatch(/reduces healing/i);
    const support = setup("Soraka", BURST.filter((id) => kits.some((k) => k.id === id)), "UTILITY").spells.map((x) => spells.find((y) => y.id === x.id)!.text).join(" ");
    expect(support).toMatch(/reduces their damage|shield/i);
  });
});
