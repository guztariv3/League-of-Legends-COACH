import type { MatchAnalysis } from "@coach/analysis";
import { RawMatch, RawTimeline } from "@coach/domain";
import { eq, inArray } from "drizzle-orm";
import { schema, type Db } from "./db/index.js";

export interface EconomyBaseline {
  games: number; scope: "champion and role" | "role"; patch: string;
  income: number; incomeRange: [number, number]; cs: number;
  recallBudgets: number[];
}
const quantile = (values: number[], q: number) => {
  const sorted = [...values].sort((a,b)=>a-b);
  return sorted[Math.floor((sorted.length-1)*q)]!;
};
/** Equal weight per game; omit kill/assist intervals, not merely their explicit bounty. */
export function quietIncome(timeline: RawTimeline, participantId: number) {
  const rates: number[] = [], cs: number[] = [];
  const frames = timeline.info.frames;
  const events = frames.flatMap(f=>f.events);
  for(let i=1;i<frames.length;i++) {
    const a=frames[i-1]!, b=frames[i]!;
    const dt=(b.timestamp-a.timestamp)/60000;
    if(a.timestamp<150000 || b.timestamp>900000 || dt<.5 || dt>1.5)continue;
    const combat=events.some(e=>e.timestamp>a.timestamp && e.timestamp<=b.timestamp && e.type==="CHAMPION_KILL" && (e.killerId===participantId || Array.isArray(e.assistingParticipantIds) && e.assistingParticipantIds.includes(participantId)));
    if(combat)continue;
    const x=a.participantFrames[String(participantId)], y=b.participantFrames[String(participantId)];
    if(!x||!y)continue;
    const gold=(y.totalGold-x.totalGold)/dt;
    const farm=(y.minionsKilled+y.jungleMinionsKilled-x.minionsKilled-x.jungleMinionsKilled)/dt;
    if(!Number.isFinite(gold)||gold<=0||!Number.isFinite(farm)||farm<0)continue;
    rates.push(gold);cs.push(farm);
  }
  return rates.length>=4 ? {income:quantile(rates,.5),cs:quantile(cs,.5)} : null;
}
/** Only authorized profile analyses enter this query. No opponent/private account lookup. */
export async function economyBaseline(db: Db, analyses: MatchAnalysis[], champion: string, role: string | undefined, patch: string): Promise<EconomyBaseline|null> {
  if(!role)return null;
  const eligible=analyses.filter(a=>a.analyzable && a.hasTimeline && a.mode==="summoners_rift" && a.role===role && a.patch===patch);
  const own=eligible.filter(a=>a.championName===champion);
  const useOwn=own.length>=3;
  const selected=(useOwn?own:eligible).slice(0,12);
  if(selected.length<3)return null;
  const rows=await db.select({id:schema.rawMatches.matchId,match:schema.rawMatches.payload,timeline:schema.rawTimelines.payload})
    .from(schema.rawMatches).innerJoin(schema.rawTimelines,eq(schema.rawMatches.matchId,schema.rawTimelines.matchId))
    .where(inArray(schema.rawMatches.matchId,selected.map(a=>a.matchId)));
  const samples: {income:number;cs:number;budget:number|null}[]=[];
  for(const a of selected){
    const row=rows.find(r=>r.id===a.matchId);if(!row)continue;
    const match=RawMatch.safeParse(row.match), timeline=RawTimeline.safeParse(row.timeline);
    if(!match.success||!timeline.success)continue;
    const participant=match.data.info.participants.find(p=>p.puuid===a.puuid);if(!participant)continue;
    const pace=quietIncome(timeline.data,participant.participantId);
    if(pace)samples.push({...pace,budget:a.firstBack?.gold??null});
  }
  if(samples.length<3)return null;
  const rates=samples.map(s=>s.income), budgets=samples.flatMap(s=>s.budget!==null && s.budget>0?[s.budget]:[]);
  return {games:samples.length,scope:useOwn?"champion and role":"role",patch,
    income:Math.round(quantile(rates,.5)), incomeRange:[Math.round(quantile(rates,.25)),Math.round(quantile(rates,.75))],
    cs:Math.round(quantile(samples.map(s=>s.cs),.5)*10)/10,
    recallBudgets:budgets.length>=3 ? [...new Set([.25,.5,.75].map(q=>Math.round(quantile(budgets,q)/50)*50))] : []};
}
