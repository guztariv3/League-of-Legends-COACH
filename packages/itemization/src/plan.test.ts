import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseCatalog } from "./catalog.js";
import { purchasePath } from "./suggest.js";
import { goldPace, planPurchases, STARTING_GOLD } from "./plan.js";

// The real patch data (the same snapshot the build engine tests use).
const read = (f: string) => JSON.parse(readFileSync(fileURLToPath(new URL(`../../knowledge/fixtures/game-data/${f}`, import.meta.url)), "utf8"));
const catalog = parseCatalog(read("ddragon-item.json"), read("ddragon-champion-full.json"));
const item = (id: number) => catalog.items.get(id)!;
const MORELLO = 3165, WAND = 1026, ZHONYA = 3157, ROD = 1058;
/** Every piece in an item's recipe, read from the patch data. */
const recipe = (id: number, out = new Set<number>()): Set<number> => { out.add(id); for (const c of item(id).from) recipe(c, out); return out; };
const plan = (targets: number[], gold: number | null, inventory: number[] = [], time = 900, itemGold = 0) =>
  planPurchases({ targets: targets.map(item), inventory, gold, time, itemGold, catalog });

describe("what to buy now", () => {
  it("follows the recipe, never spends more than you have, and spends as much as it usefully can", () => {
    for (const gold of [300, 450, 900, 1250, 1700, 2100, 2600]) {
      const p = plan([MORELLO], gold);
      const ids = recipe(MORELLO);
      expect(p.now?.spent ?? 0, `${gold}`).toBeLessThanOrEqual(gold);
      for (const b of p.now?.buys ?? []) expect(ids.has(b.id), `${gold}: ${b.name}`).toBe(true);
      // No leftover big enough for another missing piece of the recipe.
      const cheapestLeft = Math.min(...[...recipe(MORELLO)].filter((id) => item(id).from.length === 0).map((id) => item(id).gold));
      if (p.now && p.now.completes.length === 0) expect(p.now.leftover, `${gold}`).toBeLessThan(cheapestLeft + 1);
    }
  });

  it("with 1700 gold toward Morellonomicon it buys two bigger pieces, not four small ones", () => {
    const p = plan([MORELLO], 1700)!;
    expect(p.now!.spent).toBeGreaterThanOrEqual(1600);
    expect(p.now!.buys.length).toBeLessThanOrEqual(2);
  });

  it("counts the pieces you hold: they lower the price and are not bought again", () => {
    const withWand = plan([MORELLO], 5000, [WAND]);
    expect(withWand.now!.completes).toEqual([item(MORELLO).name]);
    expect(withWand.now!.buys[0]!.gold).toBe(item(MORELLO).gold - item(WAND).gold);
  });

  it("does not buy another item into six occupied slots", () => {
    const occupied = Array.from({ length: 6 }, (_, i) => 900_000 + i);
    const p = plan([MORELLO], 6000, occupied);
    expect(p.now).toBeNull();
    expect(p.wait).toBeNull();
  });

  it("can finish an item in a full inventory by consuming its component", () => {
    const occupied = [WAND, ...Array.from({ length: 5 }, (_, i) => 900_000 + i)];
    const p = plan([MORELLO], 6000, occupied);
    expect(p.now!.completes).toEqual([item(MORELLO).name]);
    expect(p.now!.spent).toBe(item(MORELLO).gold - item(WAND).gold);
  });

  it("does not count the separate trinket slot against purchase capacity", () => {
    const trinket = [...catalog.items.values()].find((i) => i.tags.includes("Trinket"))!;
    expect(trinket).toBeDefined();
    const occupied = [...Array.from({ length: 5 }, (_, i) => 900_000 + i), trinket.id];
    expect(plan([MORELLO], 6000, occupied).now!.completes).toEqual([item(MORELLO).name]);
  });

  it("combines held components before buying a piece into the freed slot", () => {
    const make = (id: number, gold: number, from: number[] = []) => ({
      id, name: String(id), gold, from, tags: [], stats: {}, maps: [11], completed: false, boots: false, antiHeal: false,
    });
    const local = { ...catalog, items: new Map([
      make(1, 100), make(2, 100), make(3, 300, [1, 2]), make(4, 100), make(5, 600, [3, 4]),
    ].map((i) => [i.id, i])) };
    const p = planPurchases({ targets: [local.items.get(5)!], inventory: [1, 2, 91, 92, 93, 94],
      gold: 200, time: 900, itemGold: 2000, catalog: local });
    expect(p.now!.buys.map((b) => b.id)).toEqual([3, 4]);
    expect(p.now!.spent).toBe(200);
  });

  it("finishes the first item and spends the rest on the next one", () => {
    const p = plan([MORELLO, ZHONYA], item(MORELLO).gold + 1300);
    expect(p.now!.completes).toEqual([item(MORELLO).name]);
    expect(p.now!.buys.some((b) => b.id === ROD)).toBe(true);
    expect(p.now!.toward).toBe(item(MORELLO).name);
  });
});

describe("waiting for a bit more gold", () => {
  it("says so when a little more gold buys clearly more", () => {
    // Toward Zhonya's: 1150 gold buys a smaller piece; a little more buys Needlessly Large Rod.
    const p = plan([ZHONYA], 1150, [], 900, 2000);
    expect(p.now!.spent).toBeLessThanOrEqual(1150);
    expect(p.wait).not.toBeNull();
    expect(p.wait!.extra).toBeLessThanOrEqual(450);
    expect(p.wait!.buys.reduce((s, b) => s + b.gold, 0) - p.now!.spent).toBeGreaterThanOrEqual(300);
    expect(p.wait!.seconds).toBeGreaterThan(0);
  });

  it("stays quiet when waiting would not change much", () => {
    const p = plan([MORELLO], item(MORELLO).gold);
    expect(p.wait).toBeNull();
  });
});

describe("gold pace and when items arrive", () => {
  it("is unknown in the first minutes, then gold held minus the starting gold over the minutes of income", () => {
    expect(goldPace(120, 600, 0)).toBeNull();
    const pace = goldPace(65 + 600, 300, 3200 + STARTING_GOLD)!; // 10 minutes of income
    expect(pace).toBeCloseTo(350, 0);
  });

  it("puts the items in order, each later than the one before, at the current pace", () => {
    const p = plan([MORELLO, ZHONYA], 400, [], 65 + 600, 3500 + STARTING_GOLD - 400);
    expect(p.pace).toBeGreaterThan(0);
    expect(p.milestones.map((m) => m.id)).toEqual([MORELLO, ZHONYA]);
    expect(p.milestones[0]!.at!).toBeGreaterThan(665);
    expect(p.milestones[1]!.at!).toBeGreaterThan(p.milestones[0]!.at!);
    // Morellonomicon: its full price minus the 400 you hold, at 350 gold per minute.
    expect(p.milestones[0]!.at! - 665).toBeCloseTo(((item(MORELLO).gold - 400) / p.pace!) * 60, 0);
  });

  it("gives no times without a pace, and no purchase without gold", () => {
    const p = plan([MORELLO], null, [], 30, 0);
    expect(p.now).toBeNull();
    expect(p.milestones[0]!.at).toBeNull();
  });
});

describe("contextual shopping across recipes", () => {
  const make = (id:number,gold:number,from:number[]=[]) => ({id,name:`Item ${id}`,gold,from,tags:[],stats:{},maps:[11],completed:from.length>0,boots:false,antiHeal:false});
  const pieces = [make(1,100),make(2,200),make(3,1000,[1,2]),make(4,100),make(5,400,[1,4])];
  const local = {...catalog,items:new Map(pieces.map(i=>[i.id,i]))};
  const shopping = (gold:number,inventory:number[]=[],utility:Record<number,number>={1:1,2:1,3:1,4:3,5:4}) => planPurchases({targets:[local.items.get(3)!,local.items.get(5)!],inventory,gold,time:900,itemGold:100,catalog:local,utility});
  it("can finish the second target while leaving an owned component of the first unfinished",()=>{
    const p=shopping(400,[2]);
    expect(p.now!.completes).toEqual(['Item 5']);
    expect(p.now!.spent).toBe(400);
    expect(p.deferred).toEqual(['Item 3']);
    expect(p.milestones[0]!.id).toBe(5);
  });
  it("does not claim to keep a component consumed by the other completed target",()=>{
    const p=shopping(300,[1]);
    expect(p.now!.completes).toEqual(['Item 5']);
    expect(p.deferred).toEqual([]);
  });
  it("never credits a shared owned component twice across purchases",()=>{
    const p=shopping(1300,[1]);
    expect(p.now!.completes.sort()).toEqual(['Item 3','Item 5']);
    expect(p.now!.spent).toBe(1300);
    expect(p.now!.buys.reduce((sum,b)=>sum+b.gold,0)).toBe(1300);
  });
  it("cannot buy components into a full inventory but can combine owned pieces",()=>{
    expect(shopping(1000,[90,91,92,93,94,95]).now).toBeNull();
    expect(shopping(300,[1,90,91,92,93,94]).now!.completes).toEqual(['Item 5']);
  });
  it("allocates an owned component once in the displayed trees",()=>{
    const p=shopping(0,[1]);
    expect(p.recipes!.map(r=>r.remaining)).toEqual([900,400]);
    expect(p.deferred).toEqual([]);
  });
  it("does not duplicate targets or recommend a zero-utility purchase",()=>{
    const p=shopping(1000,[],{1:0,2:0,3:0,4:0,5:0});
    expect(p.now).toBeNull();
  });
});


describe("shop availability within component recipes", () => {
  const component = { ...item(WAND), purchasable: false };
  const target = { ...item(MORELLO), from:[WAND], gold:1500, purchasable:true };
  const local = { ...catalog, items:new Map([[component.id,component],[target.id,target]]) };
  it.each([undefined, {[WAND]:5,[MORELLO]:10}])("never recommends an unavailable component, including in wait suggestions", utility => {
    const p=planPurchases({targets:[target],inventory:[],gold:900,time:900,itemGold:0,catalog:local,utility});
    expect(p.now).toBeNull();
    expect(p.wait).toBeNull();
    expect(purchasePath(target,[],900,local).affordableNow).toBeNull();
  });
  it.each([undefined, {[WAND]:5,[MORELLO]:10}])("still credits an unavailable component already held when completing its buyable parent", utility => {
    const p=planPurchases({targets:[target],inventory:[WAND],gold:1500-component.gold,time:900,itemGold:component.gold,catalog:local,utility});
    expect(p.now!.buys.map(b=>b.id)).toEqual([MORELLO]);
    expect(p.now!.spent).toBe(1500-component.gold);
  });
  it("preserves purchase restrictions from the source catalog", () => {
    const parsed=parseCatalog({version:'test',data:{'1':{name:'Unavailable',gold:{total:500,purchasable:false}},'2':{name:'Hidden',gold:{total:500},inStore:false},'3':{name:'Ordinary',gold:{total:500,purchasable:true}}}}, {version:'test',data:{}});
    expect(parsed.items.get(1)!.purchasable).toBe(false);
    expect(parsed.items.get(2)!.purchasable).toBe(false);
    expect(parsed.items.get(3)!.purchasable).toBe(true);
  });
});


it("compact buy-now respects full slots while permitting component consumption", () => {
 const occupied=[900001,900002,900003,900004,900005,900006];
 expect(purchasePath(item(MORELLO),occupied,6000,catalog).affordableNow).toBeNull();
 const withComponent=[WAND,...occupied.slice(1)];
 expect(purchasePath(item(MORELLO),withComponent,6000,catalog).affordableNow?.id).toBe(MORELLO);
});

it("does not gain artificial priority by buying a shared component through an earlier target", () => {
  const make=(id:number,gold:number,from:number[]=[])=>({...item(WAND),id,name:`Priority ${id}`,gold,from});
  const shared=make(1,100), earlier=make(2,2000,[1]), chosen=make(3,400,[1]);
  const local={...catalog,items:new Map([shared,earlier,chosen].map(i=>[i.id,i]))};
  // The later target must now justify delaying the first; retain the route-invariance check.
  const p=planPurchases({targets:[earlier,chosen],inventory:[],gold:400,time:900,itemGold:0,catalog:local,utility:{1:1,2:1,3:3}});
  expect(p.now!.completes).toEqual([chosen.name]);
  // Both routes end with the same object and spend the same gold: no unnecessary intermediate click.
  expect(p.now!.buys.map(b=>b.id)).toEqual([chosen.id]);
});

it("prioritizes useful stats over simply spending more gold", () => {
  const make=(id:number,gold:number,from:number[]=[])=>({...item(WAND),id,name:`Utility ${id}`,gold,from});
  const useful=make(1,200), expensive=make(2,400), target=make(3,1500,[1,2]);
  const local={...catalog,items:new Map([useful,expensive,target].map(i=>[i.id,i]))};
  const run=(utility:Record<number,number>)=>planPurchases({targets:[target],inventory:[],gold:400,time:900,itemGold:0,catalog:local,utility});
  expect(run({1:3,2:.5,3:1}).now!.buys.map(b=>b.id)).toEqual([1]);
  expect(run({1:.5,2:3,3:1}).now!.buys.map(b=>b.id)).toEqual([2]);
});

it("does not use gold spent on a later target to predict an earlier target's completion", () => {
 const make=(id:number,gold:number,from:number[]=[])=>({...item(WAND),id,name:`Timing ${id}`,gold,from});
 const aPiece=make(1,200), bPiece=make(2,400), a=make(3,1000,[1]), b=make(4,1200,[2]);
 const local={...catalog,items:new Map([aPiece,bPiece,a,b].map(i=>[i.id,i]))};
 const p=planPurchases({targets:[a,b],inventory:[],gold:400,time:900,itemGold:2000,catalog:local,utility:{1:.1,2:3,3:1,4:1}});
 expect(p.now!.buys.map(x=>x.id)).toEqual([2]);
 expect(p.milestones[0]!.at!-900).toBeCloseTo(1000/p.pace!*60,5);
 expect(p.milestones[1]!.at!-900).toBeCloseTo(1800/p.pace!*60,5);
});

it("shows a nearby completion even when the upgrade costs less than 300 gold", () => {
 const component={...item(WAND),id:1,name:'Held piece',gold:1000,from:[]};
 const target={...item(MORELLO),id:2,name:'Complete upgrade',gold:1200,from:[1]};
 const local={...catalog,items:new Map([[1,component],[2,target]])};
 const p=planPurchases({targets:[target],inventory:[1],gold:100,time:900,itemGold:1000,catalog:local,utility:{1:1,2:2}});
 expect(p.now).toBeNull();
 expect(p.wait?.extra).toBe(100);
 expect(p.wait?.buys.map(b=>b.id)).toEqual([2]);
});

it("does not skip an affordable threshold between 325 and 450 additional gold", () => {
 const target={...item(WAND),id:1,name:'Useful piece',gold:500,from:[]};
 const local={...catalog,items:new Map([[1,target]])};
 const p=planPurchases({targets:[target],inventory:[],gold:100,time:900,itemGold:1000,catalog:local,utility:{1:2}});
 expect(p.wait?.extra).toBe(400);
 expect(p.wait?.buys.map(b=>b.id)).toEqual([1]);
});


it("allocates a retained shared piece to only one deferred target after shopping",()=>{
 const make=(id:number,gold:number,from:number[]=[])=>({...item(WAND),id,name:`Deferred ${id}`,gold,from});
 const shared=make(1,100),a=make(2,2000,[1]),b=make(3,2000,[1]),c=make(4,400);
 const local={...catalog,items:new Map([shared,a,b,c].map(i=>[i.id,i]))};
 const p=planPurchases({targets:[a,b,c],inventory:[1],gold:400,time:900,itemGold:1000,catalog:local,utility:{1:1,2:1,3:1,4:10}});
 expect(p.now!.buys.map(x=>x.id)).toEqual([4]);
 expect(p.deferred).toEqual([a.name]);
});

it('saves surplus gold instead of opening an equally useful unrelated recipe', () => {
  const make=(id:number,gold:number,from:number[]=[])=>({id,name:`Item ${id}`,gold,from,tags:[],stats:{},maps:[11],completed:from.length>0,boots:false,antiHeal:false});
  const pieces=[make(1,800),make(2,850),make(3,2700,[1,2]),make(4,400),make(5,2400,[4])];
  const local={...catalog,items:new Map(pieces.map(i=>[i.id,i]))};
  const p=planPurchases({targets:[pieces[2]!,pieces[4]!],inventory:[],gold:1250,time:900,itemGold:0,catalog:local,utility:{1:1.1,2:1,3:1,4:1,5:1}});
  expect(p.now!.buys.map(x=>x.id)).toEqual([1]);
  expect(p.now!.leftover).toBe(450);
});
