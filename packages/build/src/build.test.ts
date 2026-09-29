import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseChampionKits, parseItems, parseRunes, parseSummonerSpells } from "@coach/knowledge";
import { gameData } from "@coach/knowledge/test-data";
import { championProfile, COUNTERS, enemyPicture, itemProfile, recommendBuild, statGoldValues, type BuildRecommendation } from "./index.js";

// Validation cases A–L of the build engine, on the real data of the current patch
// (packages/knowledge/fixtures/game-data). J (game end), K (hover) and L (champion select in the
// app) are covered by the desktop tests; the engine side of L is the pre-game build below.
const data = gameData();
const items = parseItems(data.ddragonItems, data.merakiItems);
const kits = parseChampionKits(data.ddragonChampions, data.merakiChampions);
const catalog = new Map(items.map((i) => [i.id, i]));
const gold = statGoldValues(items);
const kit = (id: string) => {
  const k = kits.find((x) => x.id === id);
  if (!k) throw new Error(`no champion ${id} in the snapshot`);
  return k;
};
const build = (me: string, enemies: string[], opts: { opponent?: string; position?: string; owned?: number[] } = {}) =>
  recommendBuild({ me: kit(me), enemies: enemies.map((id) => ({ kit: kit(id), laneOpponent: id === opts.opponent })), items, position: opts.position ?? null, owned: opts.owned ?? [] });
const recommended = (b: BuildRecommendation) => [b.first, ...b.next, b.boots, ...b.situational].filter((x) => x !== null);
const core = (b: BuildRecommendation) => [b.first, ...b.next].filter((x) => x !== null);
const profileOf = (id: number) => itemProfile(catalog.get(id)!, gold, catalog);
const championProfileOf = (id: string) => championProfile(kit(id));
const stat = (id: number, k: keyof (typeof items)[number]["stats"]) => (catalog.get(id)!.stats[k]?.flat ?? 0) + (catalog.get(id)!.stats[k]?.percent ?? 0);

const AP_TEAM = ["Syndra", "Brand", "Lux", "Veigar", "Annie"];
const AD_TEAM = ["Darius", "Graves", "Zed", "Jinx", "Pantheon"];
const CRIT_TEAM = ["Tryndamere", "MasterYi", "Yasuo", "Jinx", "Soraka"];
const TANKS = ["Malphite", "Ornn", "Sejuani", "Braum", "Orianna"];
const CC_TEAM = ["Leona", "Nautilus", "Sejuani", "Morgana", "Ashe"];
const HEALERS = ["Soraka", "Aatrox", "Vladimir", "Yuumi", "DrMundo"];

describe('roster audit: passive triggers and capped stats',()=>{
 it('does not call an execute amplifier percentage-health antitank damage',()=>{
  expect(profileOf(6672).counters).not.toContain('maxHealthDamage');
  expect(profileOf(3153).counters).toContain('maxHealthDamage');
 });
 it('distinguishes self shields from shields or heals on another ally',()=>{
  for(const id of ['Riven','Mordekaiser','Yone']) expect(championProfileOf(id).allyHealShield,id).toBe(false);
  for(const id of ['Lulu','Nami','Ivern','Senna']) expect(championProfileOf(id).allyHealShield,id).toBe(true);
 });
 it('cannot manufacture an ally-heal trigger just by selecting support',()=>{
  const proc=items.find(i=>i.id===3504)!;
  const shop=items.map(i=>i.id===proc.id?{...i,stats:{...i.stats,abilityPower:{flat:2000,percent:0}}}:i);
  const b=recommendBuild({me:kit('Riven'),items:shop,enemies:[],position:'UTILITY'});
  expect([b.first,...b.next].some(i=>i?.id===proc.id)).toBe(false);
 });
 it('stops crediting additional critical chance beyond the cap',()=>{
  const options={me:kit('Jinx'),items,enemies:[],position:'BOTTOM'};
  const b=recommendBuild({...options,owned:[3031,6676,3094,3036]});
  const why=[b.first,...b.next].flatMap(i=>i?.why??[]).join(' ');
  expect(why).not.toMatch(/Gives[^:]*critical strike chance/);
 });
});

describe("A — a champion that needs mana gets it covered", () => {
  const b = build("Smolder", AD_TEAM, { opponent: "Jinx", position: "BOTTOM" });
  it("reads the mana need from the kit's costs and pool", () => {
    const p = championProfile(kit("Smolder"));
    expect(p.mana?.rotation).toBeGreaterThan(0);
    expect(p.manaNeed).toBeGreaterThan(0.3);
    expect(b.kit.some((f) => /mana/.test(f))).toBe(true);
  });
  it("includes an item that gives or restores mana, and says so", () => {
    const mana = core(b).find((x) => profileOf(x!.id).mana > 0 || profileOf(x!.id).manaSustain);
    expect(mana, JSON.stringify(core(b).map((x) => x!.name))).toBeDefined();
    expect(mana!.why.some((w) => /mana/.test(w))).toBe(true);
  });
  it("a champion without mana never gets mana reasons", () => {
    const garen = build("Garen", AD_TEAM);
    expect(championProfile(kit("Garen")).manaNeed).toBe(0);
    expect(recommended(garen).flatMap((x) => x!.why).some((w) => /mana use/.test(w))).toBe(false);
  });
});

describe("B — several tanks call for penetration or health-based damage", () => {
  for (const me of ["Ahri", "Zed", "Caitlyn"]) {
    it(`${me} against a tank line`, () => {
      const b = recommendBuild({me:kit(me),items,enemies:TANKS.map(id=>({kit:kit(id),items:[catalog.get(3065)!,catalog.get(3075)!]}))});
      expect(b.threats.find((t) => t.kind === "tanks")!.sources.length).toBeGreaterThanOrEqual(3);
      const answers = core(b).filter((x) => stat(x!.id, "magicPenetration") + stat(x!.id, "armorPenetration") > 0 || profileOf(x!.id).counters.includes("maxHealthDamage"));
      expect(answers.length, JSON.stringify(core(b).map((x) => x!.name))).toBeGreaterThan(0);
    });
  }
});

describe("C — no crit-reduction item without enemy crit (Randuin's Omen case)", () => {
  it("a tank against an all-magic team is not offered crit reduction, and is told why", () => {
    const b = build("Malphite", AP_TEAM, { opponent: "Syndra", position: "TOP" });
    expect(recommended(b).some((x) => profileOf(x!.id).counters.includes("critReduction"))).toBe(false);
    expect(b.threats.some((t) => t.kind === "crit")).toBe(false);
  });
  it("the same tank against crit carriers is offered it, naming them", () => {
    const b = build("Malphite", CRIT_TEAM, { opponent: "Tryndamere", position: "TOP" });
    const crit = recommended(b).find((x) => profileOf(x!.id).counters.includes("critReduction"));
    expect(crit).toBeDefined();
    expect(crit!.why.join(" ")).toMatch(/critical strikes: .*(Tryndamere|Jinx|Master Yi|Yasuo)/);
  });
  it("every recommended counter item answers a threat this enemy team really has", () => {
    const comps = [AP_TEAM, AD_TEAM, CRIT_TEAM, TANKS, CC_TEAM, HEALERS];
    for (const me of ["Malphite", "Ahri", "Jinx", "Garen", "Thresh", "Zed"]) {
      for (const comp of comps) {
        const b = build(me, comp);
        const picture = enemyPicture(comp.map((id) => ({ kit: kit(id) })));
        for (const x of recommended(b)) {
          const counters = profileOf(x!.id).counters;
          if (!counters.length || counters.includes("maxHealthDamage")) continue;
          const answered = counters.some((c) => COUNTERS[c].answers.some((k) => picture.threats[k].weight >= 0.2));
          expect(answered, `${me} vs ${comp.join("/")}: ${x!.name}`).toBe(true);
        }
        // Every "ruled out" reason is true for this team.
        for (const r of b.ruledOut) {
          const c = profileOf(r.id).counters;
          expect(c.every((k) => COUNTERS[k].answers.every((t) => picture.threats[t].weight < 0.2 || (k === "magicShield" && picture.damage.magic < 0.2))), `${me}: ${r.name}`).toBe(true);
        }
      }
    }
  });
});

describe("situational items fit the champion", () => {
  it("a marksman against crit carriers is offered armor it can use, not a tank item", () => {
    for (const me of ["Smolder", "Jinx", "Caitlyn"]) {
      const b = build(me, AD_TEAM, { position: "BOTTOM" });
      for (const x of b.situational) {
        const counters = profileOf(x.id).counters;
        expect(counters.includes("critReduction") && championProfileOf(me).frontline < 0.3, `${me}: ${x.name}`).toBe(false);
      }
    }
  });
  it("a tank against the same crit carriers still gets the direct counter", () => {
    const b = build("Malphite", CRIT_TEAM, { position: "TOP" });
    expect(recommended(b).some((x) => profileOf(x!.id).counters.includes("critReduction"))).toBe(true);
  });
});

describe("D/E — the enemy damage type picks the resist", () => {
  it("D: heavy magic damage → magic resist first and on the boots", () => {
    const b = build("Garen", AP_TEAM, { opponent: "Syndra", position: "TOP" });
    expect(b.enemyDamage.magic).toBeGreaterThan(0.8);
    expect(stat(b.first!.id, "magicResistance")).toBeGreaterThan(0);
    expect(stat(b.boots!.id, "magicResistance")).toBeGreaterThan(0);
    expect(b.first!.why.join(" ")).toMatch(/magic/);
  });
  it("E: heavy physical damage → armor first and on the boots", () => {
    const b = build("Malphite", AD_TEAM, { position: "TOP" });
    expect(b.enemyDamage.physical).toBeGreaterThan(0.7);
    expect(stat(b.first!.id, "armor")).toBeGreaterThan(0);
    expect(stat(b.boots!.id, "armor")).toBeGreaterThan(0);
  });
});

describe("F — heavy crowd control is answered", () => {
  for (const me of ["Jinx", "Zed", "Garen"]) {
    it(me, () => {
      const b = build(me, CC_TEAM);
      const cc = b.threats.find((t) => t.kind === "cc")!;
      expect(cc.weight).toBeGreaterThan(0.8);
      const answer = recommended(b).find((x) => stat(x!.id, "tenacity") > 0 || profileOf(x!.id).counters.some((c) => COUNTERS[c].answers.includes("cc")));
      expect(answer, JSON.stringify(recommended(b).map((x) => x!.name))).toBeDefined();
    });
  }
});

describe("G — heavy healing brings Grievous Wounds", () => {
  for (const me of ["Jinx", "Ahri", "Garen"]) {
    it(me, () => {
      const b = build(me, HEALERS);
      expect(b.threats.find((t) => t.kind === "healing")!.weight).toBeGreaterThan(0.6);
      const gw = recommended(b).find((x) => profileOf(x!.id).counters.includes("grievousWounds"));
      expect(gw, JSON.stringify(recommended(b).map((x) => x!.name))).toBeDefined();
      expect([...gw!.why, "when" in gw! ? (gw as { when: string }).when : ""].join(" ")).toMatch(/Soraka|Aatrox|Vladimir|Yuumi|Mundo/);
    });
  }
});

describe("H — two champions in the same role get their own builds", () => {
  it("Ezreal and Jinx (both bottom) against the same team", () => {
    const e = build("Ezreal", AD_TEAM, { position: "BOTTOM" });
    const j = build("Jinx", AD_TEAM, { position: "BOTTOM" });
    expect(e.kit).not.toEqual(j.kit);
    expect(core(e).map((x) => x!.id)).not.toEqual(core(j).map((x) => x!.id));
    expect(e.first!.why.join(" ")).toMatch(/Ezreal/);
    expect(j.first!.why.join(" ")).toMatch(/Jinx/);
  });
  it("similar kits may share items, but each explanation cites its own kit", () => {
    const a = build("Smolder", AD_TEAM, { position: "BOTTOM" });
    const c = build("Caitlyn", AD_TEAM, { position: "BOTTOM" });
    expect(a.first!.why.join(" ")).toMatch(/Smolder/);
    expect(c.first!.why.join(" ")).toMatch(/Caitlyn/);
    expect(a.kit).not.toEqual(c.kit);
  });
  it("Ahri and Zed in mid against the same team", () => {
    const a = build("Ahri", CC_TEAM, { position: "MIDDLE" });
    const z = build("Zed", CC_TEAM, { position: "MIDDLE" });
    expect(a.first!.id).not.toBe(z.first!.id);
  });
});

describe("I — the same champion against different teams", () => {
  it("Malphite's first item changes with the enemy team", () => {
    const vsAp = build("Malphite", AP_TEAM);
    const vsCrit = build("Malphite", CRIT_TEAM);
    const vsHeal = build("Malphite", HEALERS);
    expect(new Set([vsAp.first!.id, vsCrit.first!.id]).size).toBe(2);
    expect(JSON.stringify(core(vsHeal).map((x) => x!.id))).not.toBe(JSON.stringify(core(vsAp).map((x) => x!.id)));
  });
  it("items already owned change what comes next", () => {
    const before = build("Jinx", HEALERS);
    const after = build("Jinx", HEALERS, { owned: [before.first!.id] });
    expect(recommended(after).some((x) => x!.id === before.first!.id)).toBe(false);
    expect(after.starter).toBeNull();
  });
});

describe("explanations", () => {
  it("the first item always says why, with facts from the kit or the enemy team", () => {
    for (const [me, comp] of [["Smolder", AD_TEAM], ["Malphite", CRIT_TEAM], ["Ahri", TANKS], ["Thresh", CC_TEAM]] as const) {
      const b = build(me, comp);
      expect(b.first, me).not.toBeNull();
      expect(b.first!.why.length, me).toBeGreaterThanOrEqual(2);
      expect(b.first!.why.join(" "), me).toMatch(new RegExp(`${kit(me).name}|enemy|${comp.map((c) => kit(c).name).join("|")}`));
    }
  });
});

describe("L — pre-game build: starting items by position", () => {
  it("jungle starts with a jungle companion, support with the support item, lanes within 500 gold", () => {
    const jungle = build("LeeSin", CC_TEAM, { position: "JUNGLE" }).starter!;
    expect(catalog.get(jungle.items[0]!.id)!.tags).toContain("Jungle");
    const support = build("Thresh", CC_TEAM, { position: "UTILITY" }).starter!;
    expect(catalog.get(support.items[0]!.id)!.effects.some((e) => /quest/i.test(e.name ?? ""))).toBe(true);
    for (const [me, pos] of [["Ahri", "MIDDLE"], ["Garen", "TOP"], ["Jinx", "BOTTOM"]] as const) {
      const s = build(me, AD_TEAM, { position: pos }).starter!;
      expect(s.items.reduce((sum, i) => sum + i.gold, 0), me).toBeLessThanOrEqual(500);
      expect(s.why.length, me).toBeGreaterThan(0);
    }
  });
  it("a melee laner against a ranged opponent is told about sustain when its starter has it", () => {
    const s = build("Garen", ["Teemo", "Graves", "Ahri", "Jinx", "Thresh"], { opponent: "Teemo", position: "TOP" }).starter!;
    expect(s.why.join(" ")).toMatch(/melee against Teemo|health/);
  });
});

describe("no champion or item is named in the engine", () => {
  it("the engine's source names no champion, item, rune or summoner spell (decisions come from data)", () => {
    const dir = fileURLToPath(new URL(".", import.meta.url));
    const source = readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts")).map((f) => readFileSync(dir + f, "utf8")).join("\n");
    const runeNames = parseRunes(data.perks, data.perkStyles).runes.map((r) => r.name);
    const spellNames = parseSummonerSpells(data.summoners).map((s) => s.name);
    const names = [...kits.map((k) => k.name), ...items.filter((i) => i.purchasable).map((i) => i.name), ...runeNames, ...spellNames].filter((n) => n.length >= 5);
    expect(names.filter((n) => new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\']/g, "\\$&")}\\b`).test(source))).toEqual([]);
  });
});

describe("certainty, alternatives and the standard build (phase 3)", () => {
  const CASES: [string, string[]][] = [
    ["Ahri", ["Garen", "LeeSin", "Syndra", "Jinx", "Thresh"]],
    ["Jinx", ["Malphite", "Sejuani", "Ornn", "Leona", "Braum"]],
    ["Malphite", ["Syndra", "Brand", "Lux", "Veigar", "Annie"]],
    ["Garen", ["Darius", "Zed", "Talon", "Jinx", "Pyke"]],
    ["Ahri", ["Soraka", "Aatrox", "Vladimir", "DrMundo", "Yuumi"]],
  ];

  it("an alternative only on a close call, and it says what sets it apart", () => {
    for (const [me, en] of CASES) {
      const b = build(me, en);
      expect(b.certainty, me).not.toBeNull();
      if (b.certainty === "close") {
        expect(b.alternative, me).not.toBeNull();
        expect(b.alternative!.id, me).not.toBe(b.first!.id);
        expect(b.alternative!.difference.length, me).toBeGreaterThan(10);
      } else {
        expect(b.alternative, me).toBeNull();
      }
    }
  });

  it("the standard core is the kit against a neutral enemy; a change names the standard item and a reason from this game", () => {
    for (const [me, en] of CASES) {
      const b = build(me, en);
      const a = b.adaptation!;
      expect(a.standardCore.length, me).toBeGreaterThan(0);
      if (a.standard) {
        expect(a.note, me).toMatch(/continue with it/);
      } else if (a.standardCore[0]!.id !== b.first!.id) {
        expect(a.note, me).toContain(`instead of the standard ${a.standardCore[0]!.name}`);
        // The reason names an enemy champion or the enemy's damage: never a generic stat line.
        expect(en.some((id) => a.note.includes(kit(id).name)) || /enemy damage/.test(a.note), `${me}: ${a.note}`).toBe(true);
      }
    }
  });

  it("the standard core doesn't depend on the enemies (same kit, same core)", () => {
    const one = build("Ahri", CASES[0]![1]).adaptation!.standardCore.map((x) => x.id);
    const two = build("Ahri", CASES[4]![1]).adaptation!.standardCore.map((x) => x.id);
    expect(one).toEqual(two);
  });

  it("before any enemy is known there is nothing to adapt to", () => {
    expect(build("Ahri", []).adaptation).toBeNull();
  });
});


describe("full inventory", () => {
  it("does not invent a seventh completed item or an automatic sale", () => {
    const owned = items.filter((i) => profileOf(i.id).finished).slice(0, 6).map((i) => i.id);
    expect(owned).toHaveLength(6);
    const b = build("Ahri", AD_TEAM, { owned });
    expect(b.first).toBeNull();
    expect(b.next).toEqual([]);
    expect(b.boots).toBeNull();
    expect(b.situational).toEqual([]);
  });
});

describe('owned components and final-item passive restrictions', () => {
  it.each([['Ahri','MIDDLE',3100],['Jax','TOP',3078]] as const)('allows %s to upgrade owned Sheen into its own recipe', (champion,position,target) => {
    const pool=items.filter(i=>i.id===target || !i.rank.includes('LEGENDARY'));
    const b=recommendBuild({me:kit(champion),items:pool,enemies:[],position,owned:[3057],baseline:true});
    expect(b.first?.id).toBe(target);
  });
});


it('does not offer a second conflicting Spellblade item that will remain equipped', () => {
 const pool=items.filter(i=>[3100,3078].includes(i.id) || !i.rank.includes('LEGENDARY'));
 const b=recommendBuild({me:kit('Ahri'),items:pool,enemies:[],position:'MIDDLE',owned:[3078],baseline:true});
 expect(b.first).toBeNull();
 expect(b.next).toEqual([]);
});

it('can upgrade basic boots, without buying a second pair of upgraded boots', () => {
 const base={me:kit('Jax'),items,enemies:[],position:'TOP',baseline:true};
 const b=recommendBuild({...base,owned:[1001]});
 expect(b.boots).not.toBeNull();
 expect(b.boots!.id).not.toBe(1001);
 expect(recommendBuild({...base,owned:[b.boots!.id]}).boots).toBeNull();
});

describe('conditional purchases in a solo lane', () => {
  it('keeps team healing reduction situational against a non-healing lane opponent', () => {
    const b = recommendBuild({me:kit('Ahri'),items,position:'MIDDLE',owned:[1052,3020,1082],
      enemies:['Darius','Viego','Zed','Caitlyn','Lulu'].map(id=>({kit:kit(id),laneOpponent:id==='Zed',items:id==='Viego'?[catalog.get(3153)!]:[]}))});
    expect(core(b).some(x=>profileOf(x!.id).counters.includes('grievousWounds'))).toBe(false);
    expect(b.situational.some(x=>profileOf(x.id).counters.includes('grievousWounds'))).toBe(true);
    expect(core(b).map(x=>x!.id)).not.toContain(4005);
  });
  it('still offers healing reduction against a healing lane opponent', () => {
    const b=build('Ahri',HEALERS,{position:'MIDDLE',opponent:'Vladimir'});
    expect(recommended(b).some(x=>profileOf(x!.id).counters.includes('grievousWounds'))).toBe(true);
  });
});

describe('resistance-specific and role-consistent recommendations', () => {
  it('does not treat purchased armor or health as magic resistance', () => {
    const armor=enemyPicture([{kit:kit('Darius'),items:[catalog.get(3047)!,catalog.get(3078)!]}]);
    expect(armor.purchasedResists).toEqual({armor:25,magicResistance:0});
    const mr=enemyPicture([{kit:kit('Darius'),items:[catalog.get(3065)!]}]);
    expect(mr.purchasedResists.magicResistance).toBeGreaterThan(0);
    expect(armor.threats.tanks.sources[0]!.why).toContain('0 magic resist');
  });
  it('keeps an MR spell shield conditional against mainly physical damage without evidence', () => {
    const b=build('Ahri',AD_TEAM,{position:'MIDDLE',opponent:'Zed'});
    expect(core(b).some(x=>profileOf(x!.id).counters.includes('spellShield') && stat(x!.id,'magicResistance')>0)).toBe(false);
  });
  it('applies the ally-trigger discount to situational options too', () => {
    const dependent=catalog.get(4005)!;
    const main=[1,2,3].map(n=>({...dependent,id:99000+n,name:`Main ${n}`,gold:2000,from:[],stats:{abilityPower:{flat:1000,percent:0}},effects:[]}));
    const run=(effects:typeof dependent.effects)=>recommendBuild({me:kit('Ahri'),position:'MIDDLE',enemies:TANKS.map(id=>({kit:kit(id)})),items:[...main,{...dependent,from:[],effects}]}).situational.find(x=>x.id===4005)!;
    const dependentPick=run(dependent.effects);
    const independentPick=run(dependent.effects.map(e=>({...e,text:e.text.replace(/Allied champions/gi,'You')})));
    expect(dependentPick).toBeDefined();
    expect(dependentPick.why.join(' ')).toContain('requires an allied champion');
    expect(dependentPick.score).toBeLessThan(independentPick.score);
  });
});

it('does not fill an alternative slot with an ill-fitting tank counter after choosing armor',()=>{
 const b=build('Ahri',['Darius','Viego','Zed','Caitlyn','Lulu'],{position:'MIDDLE',opponent:'Zed'});
 expect(b.situational.map(x=>x.id)).not.toContain(3143);
});

it('increases magic penetration value for MR, not for purchased armor',()=>{
 const pen={...catalog.get(3135)!,from:[],effects:[]};
 const run=(stats:typeof pen.stats)=>{
  const enemyItem={...catalog.get(3047)!,stats};
  return recommendBuild({me:kit('Ahri'),items:[...items.filter(i=>!i.rank.includes('LEGENDARY')),pen],enemies:[{kit:kit('Darius'),items:[enemyItem]}],position:'MIDDLE'}).first!.score;
 };
 const baseline=run({});
 expect(run({armor:{flat:100,percent:0}})).toBe(baseline);
 expect(run({magicResistance:{flat:100,percent:0}})).toBeGreaterThan(baseline);
});
