import {describe,it,expect} from 'vitest';
import {AllGameData,emptyState,reduceState} from '../../../packages/live/src/index.js';
import {liveCoach} from '../../../packages/coach/src/index.js';
import {parseCatalog,goldPace} from '../../../packages/itemization/src/index.js';
import {parseChampionKits,parseItems} from '../../../packages/knowledge/src/index.js';
import {gameData} from '../../../packages/knowledge/src/test-data.js';
import {recommendBuild} from '../../../packages/build/src/index.js';
import {liveDetail} from '../../desktop/src/live-detail.js';
import type {PlanResponse} from '../../desktop/src/board.js';
const data=gameData(),catalog=parseCatalog(data.ddragonItems,data.ddragonChampions);
const items=parseItems(data.ddragonItems,data.merakiItems),kits=parseChampionKits(data.ddragonChampions,data.merakiChampions);
const kit=(id:string)=>kits.find(k=>k.id===id)!;
function game(inventory:number[],gold:number){
 const player=(champion:string,team:string,ids:number[])=>({championName:champion,rawChampionName:`game_character_displayname_${champion}`,riotId:`${champion}#DEMO`,team,position:'MIDDLE',level:12,items:ids.map(itemID=>({itemID,price:catalog.items.get(itemID)!.gold})),scores:{kills:3,deaths:2,assists:4,creepScore:150}});
 return reduceState(emptyState(),AllGameData.parse({activePlayer:{riotId:'Ahri#DEMO',level:12,currentGold:gold},allPlayers:[player('Ahri','ORDER',inventory),player('Zed','CHAOS',[3142,1001])],events:{Events:[]},gameData:{gameMode:'CLASSIC',gameTime:1080,mapNumber:11}}));
}
describe('actual build → desktop coach → serialized web Live detail',()=>{
 for(const inventory of [[1052,3020,1082],[3118,3020],[3137,3020]])it(`preserves the desktop purchase route for inventory ${inventory}`,()=>{
  const state=game(inventory,1250);
  const engine=recommendBuild({me:kit('Ahri'),items,owned:inventory,position:'MIDDLE',patch:'16.19',enemies:[{kit:kit('Zed'),laneOpponent:true}],economy:{gold:state.gold,time:state.time,income:goldPace(state.time,state.gold,state.me!.itemGold)}});
  const coach=liveCoach({state,catalog,engine,allowLocalItems:false});
  expect(coach.purchase?.now?.buys.length).toBeGreaterThan(0);
  const detail=JSON.parse(JSON.stringify(liveDetail(state,coach,null,'live','contextual')));
  expect(detail.buyNow).toEqual(coach.purchase!.now!.buys);
  expect(detail.spent).toBe(coach.purchase!.now!.spent);
  expect(detail.leftover).toBe(coach.purchase!.now!.leftover);
  expect(detail.targets).toEqual(coach.purchase!.milestones);
  expect(detail.recipes).toEqual(coach.purchase!.recipes);
  expect(detail.deferred).toEqual(coach.purchase!.deferred);
  expect(detail.alternatives).toEqual(coach.items!.alternatives.map(i=>({id:i.item.id,name:i.item.name,gold:i.path.remaining,reason:i.reasons.join(' ').slice(0,1600)})));
  const ids=[...inventory,...detail.targets.map((t:{id:number})=>t.id)];
  expect(ids.includes(3135)&&ids.includes(3137)).toBe(false);
 });
 it('does not substitute a stale pre-game build when live recommendations disappear',()=>{
  const build=recommendBuild({me:kit('Ahri'),items,owned:[],position:'MIDDLE',enemies:[]});
  const plan:PlanResponse={build:{...build,version:'16.19.1',enemiesKnown:0,attribution:{text:'test',license:'test'}},plan:{primaryObjective:null,secondaryObjective:null,biggestThreat:null,yourPowerSpike:null,enemyPowerSpike:null,avoid:null,lookFor:null,loadout:{games:0,keystone:null,spells:null,maxOrder:null,firstItem:null}}};
  expect(liveDetail(null,null,plan,'draft','contextual').targets.length).toBeGreaterThan(0);
  const live=liveDetail(game([3118],1000),null,plan,'live','limited');
  expect(live.targets).toEqual([]);expect(live.buyNow).toEqual([]);expect(live.alternatives).toEqual([]);expect(live.starter).toEqual([]);
 });
});

it('keeps detected picks visible when the draft plan is unavailable',()=>{
 const d=liveDetail(null,null,null,'draft','synthetic',[],{phase:'ChampSelect',me:{championId:103,locked:false,position:'middle'},allies:[64],enemies:[238]});
 expect(d.players.allies.map(p=>p.champion)).toEqual(['103','64']);
 expect(d.players.allies[0]?.isMe).toBe(true);
 expect(d.players.enemies.map(p=>p.champion)).toEqual(['238']);
 expect(d.runes).toEqual([]);
 expect(d.targets).toEqual([]);
});
