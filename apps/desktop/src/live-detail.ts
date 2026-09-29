import type { LiveDetail, LivePlayerView } from '@coach/ui';
import type { GameState, PlayerState } from '@coach/live';
import type { LiveCoach } from '@coach/coach';
import type { PlanResponse } from './board';
import type { ScoutedRival } from './rivals';

/** Only projects the shared Coach result; it never chooses a second build for the web. */
export function liveDetail(state:GameState|null, coach:LiveCoach|null, plan:PlanResponse|null, phase:string, source:LiveDetail['source'], rivals:ScoutedRival[] = []):LiveDetail {
 const b=plan?.build, p=coach?.purchase;
 const player=(v:PlayerState):LivePlayerView=>{
  const r=source==='synthetic'?undefined:rivals.find(x=>x.championId===v.championId && x.riotId===v.name);
  return {spells:v.spells??[],runes:v===state?.me?state.loadout?.runes??v.runes??[]:v.runes??[],champion:v.championId,name:v.name,role:v.position,level:v.level,kills:v.kills,deaths:v.deaths,assists:v.assists,cs:v.cs,items:v.items.slice(0,8),isMe:v===state?.me,
   rank:r?.rank ? `${r.rank.tier??''} ${r.rank.division??''} · ${r.rank.lp??0} LP`:null,
   history:r ? [r.games ? `${r.wins} wins in ${r.games} recent games`:'Recent history unavailable',...r.topChampions.slice(0,3).map(c=>`${c.name}: ${c.points===null ? `${c.games??0} recent games`:`${c.points} mastery points`}`)]:[]};
 };
 const unknown=(champion:string,isMe=false):LivePlayerView=>({champion,name:null,role:null,level:null,kills:null,deaths:null,assists:null,cs:null,items:[],isMe,rank:null,history:[]});
 const active=phase==='live';
 const runes=b?.setup?.runes;
 const sk=b?.stats?.skills;
 const allAllies=state?.me ? [state.me,...state.allies.filter(a=>a.name!==state.me!.name)] : [];
 return {
  source,players:{allies:allAllies.length?allAllies.slice(0,5).map(player):[...(plan?.champion?[unknown(plan.champion,true)]:[]),...(plan?.roster?.allies??[]).map(c=>unknown(c))].slice(0,5),enemies:state?.enemies.length?state.enemies.slice(0,5).map(player):(plan?.roster?.enemies??[]).map(c=>unknown(c)).slice(0,5)},
  buyNow:active?p?.now?.buys??coach?.starter?.items.map(i=>({id:i.id,name:i.name,gold:i.gold}))??[]:[],
  spent:p?.now?.spent??coach?.starter?.items.reduce((sum,i)=>sum+i.gold,0)??0,leftover:p?.now?.leftover??(state?.gold==null?null:Math.max(0,state.gold-(coach?.starter?.items.reduce((sum,i)=>sum+i.gold,0)??0))),deferred:p?.deferred??[],
  // During a match the desktop coach is authoritative. A missing current result
  // must not resurrect the pre-game build only on the web.
  recipes:active?p?.recipes??[]:[],targets:active?p?.milestones??[]:[b?.first,...b?.next??[]].flatMap(i=>i?[{id:i.id,name:i.name,remaining:i.gold,at:null}]:[]).slice(0,6),
  starter:active?[]:b?.starter?.items??[],alternatives:active?coach?.items?.alternatives.map(i=>({id:i.item.id,name:i.item.name,gold:i.path.remaining,reason:i.reasons.join(' ').slice(0,1600)}))??[]:b?.situational.slice(0,6).map(i=>({id:i.id,name:i.name,gold:i.gold,reason:i.when}))??[],
  runes:runes?[{...runes.keystone,group:runes.primaryTree},...runes.primary.map(r=>({...r,group:runes.primaryTree})),...runes.secondary.map(r=>({...r,group:runes.secondaryTree})),...runes.shards.map(r=>({...r,group:'Shards'}))]:[],
  spells:b?.setup?.spells.map(s=>({key:s.key,name:s.name,why:s.why}))??[],equippedRunes:state?.loadout?.runes??[],equippedSpells:state?.loadout?.spells??[],
  skillOrder:sk?.max??plan?.plan.loadout.maxOrder??[],skillSequence:sk?.sequence??[],skillRanks:state?.abilities?Object.values(state.abilities):[],nextSkill:coach?.decisions.find(d=>d.kind==='skill')?.headline??null,
  teamNotes:[...b?.team?.map(t=>`${t.text} ${t.why}`)??[],...plan?.draftRead?[plan.draftRead.teamFit]:[]].slice(0,12),
  enemyNotes:[...b?.threats.slice(0,5).map(t=>`${t.kind}: ${t.sources.map(s=>s.name).join(', ')}`)??[],...plan?.draftRead?[plan.draftRead.versus,plan.draftRead.concern]:[]].slice(0,12),
  playerNotes:(plan?.playerContext??[]).slice(0,12),damage:b?.enemyDamage??null,
 };
}
