import { describe, it, expect } from "vitest";
import { gameData } from "@coach/knowledge/test-data";
import { parseItems, parseChampionKits } from "@coach/knowledge";
import { recommendBuild } from "./recommend.js";
import { remainingCost, itemTiming } from "./economy.js";
import { draftRead } from "./draft.js";
const data=gameData();
const items=parseItems(data.ddragonItems,data.merakiItems);
const kits=parseChampionKits(data.ddragonChampions,data.merakiChampions);
const me=kits.find(k=>k.id==="Ahri")!;
const seed=items.find(i=>i.name==="Malignance")!;
const cheap={...seed,id:999001,name:"Quick",gold:2000,stats:{abilityPower:{flat:80,percent:0},mana:{flat:600,percent:0}},effects:[]};
const expensive={...seed,id:999002,name:"Heavy",gold:4000,stats:{abilityPower:{flat:180,percent:0},mana:{flat:600,percent:0}},effects:[]};
const catalog=[...items.filter(i=>!i.rank.includes("LEGENDARY")),cheap,expensive];
const build=(gold:number,income:number,opponentCompleted=false)=>recommendBuild({me,enemies:[],items:catalog,economy:{gold,time:600,income,opponentCompleted}});
describe("economy influences order without price bans",()=>{
 it("A/B/F: delays matter against an already completed enemy item",()=>expect(build(500,180,true).first?.id).toBe(cheap.id));
 it("C/G: an expensive stronger spike wins when immediately affordable",()=>expect(build(4000,600,true).first?.id).toBe(expensive.id));
 it("D: recall budgets change accessible components and completion time",()=>{
  const low=itemTiming(seed,items,[],{gold:100,time:400,income:300},()=>1);
  const high=itemTiming(seed,items,[],{gold:1500,time:400,income:300},()=>1);
  expect(high.affordable).toBeGreaterThan(low.affordable); expect(high.seconds!).toBeLessThan(low.seconds!);
 });
 it("E: component paths retain usefulness, not just finished-item score",()=>{
  const awkward={...expensive,from:[],gold:4000};
  const smooth=itemTiming(expensive,catalog,[],{gold:500,time:400,income:300},()=>1);
  expect(itemTiming(awkward,catalog,[],{gold:500,time:400,income:300},()=>1).componentFit).toBe(0);
  expect(smooth.componentFit).toBeGreaterThan(0);
 });
 it("does not invent income when gold or income are unknown",()=>expect(itemTiming(seed,items,[],undefined,()=>1).seconds).toBeNull());
 it("uses a duplicate owned component only once per recipe position",()=>{
  const part={...seed,id:990,gold:400,from:[]}, full={...seed,id:991,gold:1000,from:[990,990]};
  expect(remainingCost(full,new Map([[990,part],[991,full]]),[990])).toBe(600);
 });
});
describe("contextual provisional draft",()=>{
 it("keeps unrevealed enemies and lane opponent unknown",()=>{
  const d=draftRead(me,[],[]);expect(d.coverage).toContain("0/5 enemies");expect(d.matchup).toContain("unknown");expect(d.teamFit).toContain("Waiting");
 });
 it("reevaluates revealed kit threats and does not change the source kit",()=>{
  const before=JSON.stringify(me);const enemy=kits.find(k=>k.id==="Leona")!;
  const d=draftRead(me,[],[enemy]);expect(d.versus).toContain("Leona");expect(JSON.stringify(me)).toBe(before);
 });
});

it('does not credit a consumed component or today\'s wallet to later targets',()=>{
 const part=items.find(i=>i.id===1052)!;
 const a={...cheap,from:[part.id]}, b={...expensive,from:[part.id]};
 const result=recommendBuild({me,enemies:[],position:'MIDDLE',items:[part,a,b],owned:[part.id],economy:{gold:500,time:900,income:300}});
 const later=result.next[0]!;
 expect(later.timing!.remaining).toBe(later.gold);
 expect(later.timing!.seconds).toBeNull();
 expect(later.why.join(' ')).toContain('after completing earlier targets');
});

it('does not rank an unavailable recipe piece as an affordable purchase',()=>{
 const part={...seed,id:990101,gold:300,from:[],purchasable:false};
 const target={...seed,id:990102,gold:2000,from:[part.id]};
 const t=itemTiming(target,[part,target],[],{gold:500,time:600,income:300},()=>100);
 expect(t.affordable).toBe(0);
 expect(t.componentFit).toBe(0);
 // A piece acquired through another mechanism still reduces the upgrade cost.
 expect(itemTiming(target,[part,target],[part.id],undefined,()=>100).remaining).toBe(1700);
});
it('does not give component utility to purchases blocked by six occupied slots',()=>{
 const part={...seed,id:990201,gold:300,from:[]};
 const target={...seed,id:990202,gold:1000,from:[part.id]};
 const other={...seed,id:990203,gold:100,from:[]};
 const shop=[part,target,other];
 const full=itemTiming(target,shop,Array(6).fill(other.id),{gold:500,time:600,income:300},()=>100);
 expect(full.affordable).toBe(0);
 expect(full.componentFit).toBe(0);
 const upgrade=itemTiming(target,shop,[part.id,...Array(5).fill(other.id)],{gold:700,time:600,income:300},()=>100);
 expect(upgrade.affordable).toBe(1);
 expect(upgrade.componentFit).toBe(100);
});
it('can buy the second copy of a component when the recipe needs two and one is owned',()=>{
 const part={...seed,id:990301,gold:300,from:[]};
 const target={...seed,id:990302,gold:1000,from:[part.id,part.id]};
 const t=itemTiming(target,[part,target],[part.id],{gold:300,time:600,income:300},()=>2);
 expect(t.remaining).toBe(700);
 expect(t.affordable).toBe(1);
 expect(t.componentFit).toBe(2);
});

it('recognizes an affordable upgrade even when the full recipe allocates its held piece elsewhere',()=>{
 const part={...seed,id:990401,gold:400,from:[],purchasable:true};
 const upgrade={...seed,id:990402,gold:800,from:[part.id],purchasable:true};
 const target={...seed,id:990403,gold:2400,from:[part.id,upgrade.id],purchasable:true};
 const t=itemTiming(target,[part,upgrade,target],[part.id,91,92,93,94,95],{gold:400,time:600,income:300},i=>i.id===upgrade.id?5:1);
 expect(t.remaining).toBe(2000);
 expect(t.affordable).toBe(1);
 expect(t.componentFit).toBe(5);
});
