import { liveDetail } from "./live-detail";
import type { ScoutedRival } from "./rivals";
import { useEffect, useRef, useState, type MutableRefObject } from "react";
import type { CoachDecision, LiveCoach } from "@coach/coach";
import { clockSample, describeOffset, NOTABLE_OFFSET_MS, ServerClock, stampNow, type GameState, type Stamp } from "@coach/live";
import type { LiveFrame, LiveSection } from "@coach/ui";
import type { PlanResponse } from "./board";
import { fetchServerTime, publishLive, type ChampSelect } from "./bridge";

export interface Output { coach: LiveCoach | null; now: CoachDecision | null; time: number }
export function liveSections(output: Output): LiveSection[] {
 const c=output.coach; if(!c)return [];
 const section=(title:string,lines:(string|null|undefined)[],primary=false):LiveSection=>({title,lines:lines.filter((s):s is string=>Boolean(s)).map(s=>s.slice(0,1600)).slice(0,24),primary});
 return [
  section("What matters now",[output.now?.headline,...output.now?.reasons??[]],true),
  section("Buy now",c.purchase?.now ? [...c.purchase.now.buys.map(b=>`${b.name}: ${b.gold} gold`),`${c.purchase.now.leftover} gold left; toward ${c.purchase.now.toward}`] : ["No supported immediate purchase with the available data."],true),
  section("Next major item",[c.items?.next?.item.name,...c.items?.next?.reasons??[]]),
  section("Build order and timing",c.purchase?.milestones.map(m=>`${m.name}: ${m.remaining} gold remaining${m.at===null ? "; timing unknown" : `; estimated minute ${(m.at/60).toFixed(1)} at the observed pace`}`)??[]),
  section("Strategy and next objective",c.plan.flatMap(d=>[d.headline,...d.reasons])),
  section("Skill priority",c.decisions.filter(d=>d.kind==="skill").flatMap(d=>[d.headline,...d.reasons])),
  section("Alternatives",output.now?.alternatives.map(a=>`${a.label}${a.reason ? `: ${a.reason}`:""}`)??[]),
  section("Evidence",output.now?.evidence.map(e=>`${e.label}: ${e.value}`)??[]),
 ].filter(s=>s.lines.length);
}
function planSections(plan:PlanResponse|null):LiveSection[] {
 if(!plan)return [];
 const b=plan.build;
 return [
  {title:"Economy and recall scenarios",lines:b?.economyNotes??[]},
  {title:"Pre-game plan",lines:Object.entries(plan.plan).filter(([k])=>k!=="loadout").flatMap(([k,v])=>v && "text" in v ? [`${k}: ${v.text} — ${v.why}`]:[])},
  {title:"Recommended pre-game runes and summoner spells",lines:[b?.setup?.runes ? `${b.setup.runes.primaryTree}: ${[b.setup.runes.keystone,...b.setup.runes.primary,...b.setup.runes.secondary,...b.setup.runes.shards].map(r=>`${r.name} (${r.why})`).join("; ")}`:"Rune recommendation unavailable.",...b?.setup?.spells.map(s=>`${s.name}: ${s.why}`)??[]]},
  {title:"Starting items and target build",lines:[...(b?.starter?.items.map(i=>`${i.name}: ${i.gold} gold`)??[]),...[b?.first,...b?.next??[]].flatMap(i=>i ? [`${i.name}: ${i.why.join(" ")}`]:[])]},
  {title:"Situational options",lines:b?.situational.map(i=>`${i.name}: ${i.when}`)??[]},
 ].map(s=>({...s,lines:s.lines.map(l=>l.slice(0,1600)).slice(0,24)})).filter(s=>s.lines.length);
}
interface RelayInput { rivals?:ScoutedRival[]; contextual?:boolean; enabled:boolean; link:{origin:string;token:string}|null; state:GameState|null; select:ChampSelect|null; draft:PlanResponse|null; plan:PlanResponse|null; patch:string|null; paused:boolean; reconnecting:boolean; ended:boolean; output:MutableRefObject<Output|null>; demo:boolean }

/**
 * When the data behind an object was read (stamped where it is read: the game snapshot, the
 * champion-select read). The relay never stamps data itself, so a capture that waits to be sent
 * keeps its age.
 */
const acquisitions=new WeakMap<object,Stamp>();
export function markAcquired(data:object,at:Stamp){acquisitions.set(data,at);}

/** What the Settings line shows about private web Live sharing. */
export interface RelayStatus { state:"off"|"syncing"|"connected"|"waiting"|"no-clock"|"offline"; text:string }
const OFF:RelayStatus={state:"off",text:"off"};

/**
 * One in-flight publication, latest-state sampling, no backlog; never blocks the game reader.
 * Frames are stamped in the site's time (measured with /desktop/time), with the moment their data
 * was read: a PC clock that is off still shares, and old data is never re-stamped as new.
 */
export function useLiveRelay(input:RelayInput) {
 const [status,setStatus]=useState<RelayStatus>(OFF);
 const latest=useRef(input); latest.current=input;
 const stream=useRef(crypto.randomUUID()); const sequence=useRef(0);
 const lastGame=useRef<GameState|null>(null);
 const wasEnabled=useRef(false);
 useEffect(()=>{
  if(!input.link){setStatus(OFF);return;}
  let stopped=false; let timer:ReturnType<typeof setTimeout>;
  const link=input.link;
  const clock=new ServerClock();
  const sync=async()=>{
   const t0=stampNow(); const r=await fetchServerTime(link.origin,link.token); const t1=stampNow();
   return r.ok && clock.update(clockSample(t0,r.data.serverTime,t1));
  };
  if(!input.enabled){
   // Sharing is off: nothing is published. Only when it was just turned off, one empty frame
   // replaces what was shared, so the web page stops showing it.
   setStatus(OFF);
   if(wasEnabled.current)void sync().then(ok=>{ if(!ok)return; const now=stampNow(); void publishLive(link.origin,link.token,{version:1,streamId:stream.current,sequence:++sequence.current,capturedAt:clock.capturedAt(now,now)!,phase:"idle",
    champion:null,position:null,patch:null,time:null,gold:null,allies:[],enemies:[],headline:"No active shared game",sections:[]}); });
   wasEnabled.current=false;
   return;
  }
  wasEnabled.current=true;
  let terminalSent=false;
  const loop=async()=>{
   if(stopped)return;
   if(clock.needsSync(stampNow())){
    setStatus(st=>st.state==="connected" ? st : {state:"syncing",text:"checking the time with the website…"});
    if(!(await sync())){
     if(!stopped){setStatus({state:"no-clock",text:"can't check the time with the website, so nothing is shared yet. Retrying…"});timer=setTimeout(loop,5000);}
     return;
    }
    if(stopped)return;
   }
   const v=latest.current; // sampled after any time check: the latest data the app has read
   const s=v.state;
   if(s?.me && !v.demo)lastGame.current=s;
   let phase:LiveFrame["phase"]=v.demo ? "idle" : v.reconnecting ? "reconnecting" : s?.me ? v.paused ? "paused":"live" : v.select?.phase==="ChampSelect" ? v.select.me?.locked ? "pregame":"draft" : ["GameStart","InProgress"].includes(v.select?.phase??"") ? "loading" : v.ended ? "ended":"idle";
   if(phase !== "ended")terminalSent=false;
   if(phase === "ended" && terminalSent){timer=setTimeout(loop,1500);return;}
   const out=v.output.current;
   // A coach answer belongs to a specific snapshot; mismatches stay hidden until recomputed.
   if(phase==="live" && (!out || out.time!==s?.time))phase="reconnecting";
   // Advice carries the moment its data was read; without that moment it is not shared.
   const source=phase==="live" ? s : phase==="draft"||phase==="pregame" ? v.select : null;
   const acquired=source ? acquisitions.get(source) : undefined;
   if(source && !acquired)phase="reconnecting";
   const r=v.draft?.draftRead;
   let sections:LiveSection[]=phase==="live" && out ? [...liveSections(out),...planSections(v.plan)] : phase==="pregame" ? planSections(v.draft) : phase==="draft" && r ? [
    {title:"Team fit",lines:[r.teamFit],primary:true},{title:"Versus enemy",lines:[r.versus],primary:true},
    {title:"Key reason",lines:[r.advantage],primary:true},{title:"Main concern",lines:[r.concern],primary:true},
    {title:"Matchup and evidence",lines:[r.matchup,r.coverage,...r.evidence,...r.unknown]},
   ]:[];
   if((phase === "draft" || phase === "pregame") && v.draft?.draftState){const d=v.draft.draftState;sections.push({title:"Draft state and roles",lines:[d.phase??"Phase unavailable",`Allied bans: ${d.allyBans.join(", ")||"None reported"}`,`Enemy bans: ${d.enemyBans.join(", ")||"None reported"}`,...d.roles,"Enemy roles are uncertain unless explicitly reported."]});}
   const personal=(phase === "live" ? v.plan : v.draft)?.playerContext;
   if(personal?.length && ["live","draft","pregame"].includes(phase))sections.push({title:"Your champion experience",lines:personal});
   if(phase === "live") sections.push({title:"Equipped runes and summoner spells",lines:[s?.loadout?.runes.map(r=>r.name).join(" · ")||"Actual runes not reported.",s?.loadout?.spells.join(" + ")||"Actual summoner spells not reported."]});
   const ended=lastGame.current;
   if(phase==="ended" && ended?.me)sections=[{title:"Last observed match snapshot",lines:[`${ended.me.champion}: ${ended.me.kills}/${ended.me.deaths}/${ended.me.assists}; ${ended.me.cs} CS in ${(ended.time/60).toFixed(1)} minutes.`,"Open Matches for the verified post-game Coach after Riot match history finishes syncing."]}];
   // Frames without advice (waiting, paused, ended) describe this moment. Either way the time is
   // the site's: the server's current time minus the capture's age.
   const now=stampNow();
   const frame:LiveFrame={version:1,streamId:stream.current,sequence:++sequence.current,capturedAt:clock.capturedAt(phase==="reconnecting" ? now : acquired??now,now)!,phase,
    champion:s?.me?.championId??v.draft?.champion??null,position:s?.me?.position??v.select?.me?.position??null,patch:v.patch,
    time:s?.time??null,gold:s?.gold??null,
    allies:s?.allies.map(p=>p.championId)??v.draft?.roster?.allies??[],enemies:s?.enemies.map(p=>p.championId)??v.draft?.roster?.enemies??[],
    headline:phase==="live" ? out?.now?.headline??"No urgent recommendation." : phase==="draft" ? "Provisional pick — draft still developing" : phase==="pregame" ? "Champion locked — prepare your game" : phase==="ended" ? "Match ended" : phase==="paused" ? "Coach paused" : phase==="reconnecting" ? "Waiting for fresh game data" : phase==="loading" ? "Match loading" : "No active shared game",
    sections:sections.slice(0,16),};
   if(["live","draft","pregame"].includes(phase))frame.detail=liveDetail(s,phase==="live" ? out?.coach??null:null,phase==="live" ? v.plan:v.draft,phase,v.patch?.includes("synthetic") ? "synthetic":(phase === "live" ? v.contextual : Boolean(v.draft?.build)) ? "contextual":"limited",v.rivals);
   if(phase==="idle"){frame.champion=null;frame.position=null;frame.allies=[];frame.enemies=[];frame.time=null;frame.gold=null;}
   const result=await publishLive(link.origin,link.token,frame);
   if(result.ok && phase === "ended")terminalSent=true;
   if(!result.ok && result.error==="rejected")clock.invalidate(); // re-measure before the next frame
   const off=clock.offset;
   if(!stopped)setStatus(result.ok
    ? {state:"connected",text:`connected${off!==null && Math.abs(off)>=NOTABLE_OFFSET_MS ? ` · your PC clock is ${describeOffset(off)}; sharing uses the website's time` : ""}`}
    : result.error==="rejected" ? {state:"waiting",text:"waiting for fresh game data (the website only accepts recent data)."}
    : {state:"offline",text:"can't reach the website. Retrying…"});
   if(!stopped)timer=setTimeout(loop,phase==="idle"||phase==="ended" ? 10000:1500);
  };
  void loop();
  return()=>{stopped=true;clearTimeout(timer);};
 },[input.link?.origin,input.link?.token,input.enabled]);
 return status;
}
