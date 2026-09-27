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
