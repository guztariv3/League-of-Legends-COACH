import { describe, expect, it } from "vitest";
import type { RawTimeline } from "@coach/domain";
import { quietIncome } from "./economy-baseline.js";
function timeline():RawTimeline {
 return {metadata:{matchId:"EUW1_1"},info:{frameInterval:60000,frames:Array.from({length:10},(_,i)=>({timestamp:i*60000,events:[],participantFrames:{"1":{participantId:1,totalGold:500+i*200,level:1,xp:0,minionsKilled:i*6,jungleMinionsKilled:0}}}))}};
}
describe("personal early economy",()=>{
 it("uses early per-minute farm and income without fabricating missing history",()=>{
  expect(quietIncome(timeline(),1)).toEqual({income:200,cs:6});
  expect(quietIncome(timeline(),2)).toBeNull();
 });
 it("omits whole kill and assist intervals, including unusually large rewards",()=>{
  const t=timeline();
  for(let i=4;i<10;i++)t.info.frames[i]!.participantFrames["1"]!.totalGold+=800;
  t.info.frames[4]!.events.push({type:"CHAMPION_KILL",timestamp:240000,killerId:1});
  t.info.frames[5]!.events.push({type:"CHAMPION_KILL",timestamp:300000,killerId:2,assistingParticipantIds:[1]});
  expect(quietIncome(t,1)).toEqual({income:200,cs:6});
 });
 it("requires several usable intervals and refuses gaps",()=>{
  const t=timeline();t.info.frames=t.info.frames.filter((_,i)=>i%2===0);
  expect(quietIncome(t,1)).toBeNull();
 });
});
