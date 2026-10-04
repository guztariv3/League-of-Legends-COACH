import { LiveCompanion } from "./LiveDetail";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import type { LiveFrame } from "@coach/ui";
import { api, ApiError } from "../api";
import { ChampionIcon } from "../assets";
const Context=createContext<{frame:LiveFrame|null;stale:boolean}>({frame:null,stale:false});
export function LiveProvider({children}:{children:ReactNode}) {
 const [value,setValue]=useState<{frame:LiveFrame|null;stale:boolean}>({frame:null,stale:false});
 const navigate=useNavigate();
 const followed=useRef({stream:"",selection:false,live:false});
 useEffect(()=>{
  const frame=value.frame;
  // A lost connection is not a new game. Do not repeatedly pull the user back
  // when they intentionally browse elsewhere, or when polling resumes.
  if(value.stale || !frame)return;
  if(frame.phase==="idle" || frame.phase==="ended"){
   followed.current={stream:frame.streamId,selection:false,live:false};return;
  }
  if(frame.streamId!==followed.current.stream || (frame.phase==="draft" && followed.current.live))followed.current={stream:frame.streamId,selection:false,live:false};
  const stage=frame.phase==="live" ? "live" : ["draft","pregame","loading"].includes(frame.phase) ? "selection" : null;
  if(!stage || followed.current[stage] || (stage==="selection" && followed.current.live))return;
  followed.current[stage]=true;
  navigate("/live");
 },[value,navigate]);
 useEffect(()=>{let stopped=false;let timer:ReturnType<typeof setTimeout>;
  // Every second while a game or champion select is being shared and the page is visible; slower
  // otherwise (a new game is still picked up within a few seconds), and much slower when hidden.
  // Advice on screen is dropped the moment the API said it stops being current, whatever happens
  // to the polling (rate-limited, slow or hidden): its own timer, reset by every fresh answer.
  let busy=false, expiry:ReturnType<typeof setTimeout>|undefined;
  const expireAt=(ms:number)=>{clearTimeout(expiry);
   expiry=setTimeout(()=>setValue(v=>v.frame && !["idle","ended"].includes(v.frame.phase) ? {frame:null,stale:true}:v),Math.max(0,ms));};
  const loop=async()=>{if(busy)return;busy=true;let delay=4000;
   // The server measured the remaining time while answering: counting it from when the request was
   // sent (not when the answer arrived) keeps a slow response from extending it.
   const sent=Date.now();
   try{const r=await api.live();if(stopped)return;
    const active=r.frame!==null && !["idle","ended"].includes(r.frame.phase);
    const left=sent+(r.expiresInMs??0)-Date.now();
    if(active && left<=0){clearTimeout(expiry);setValue({frame:null,stale:true});}
    else{setValue({frame:r.frame,stale:r.stale});if(active){delay=1000;expireAt(left);} else clearTimeout(expiry);}}
   catch(e){if(stopped)return;
    // Too many requests is not a lost companion: what is shown stays (until it expires) and the
    // page backs off. Any other failure hides the advice at once.
    if(e instanceof ApiError && e.status===429)delay=10000;
    else{clearTimeout(expiry);setValue({frame:null,stale:true});}}
   finally{busy=false;}
   if(stopped)return;
   clearTimeout(timer);timer=setTimeout(loop,document.hidden ? Math.max(delay,10000):delay);
  };
  // Coming back to the tab refreshes at once instead of waiting for the slow hidden-tab timer.
  const visible=()=>{if(!document.hidden && !stopped){clearTimeout(timer);void loop();}};
  document.addEventListener("visibilitychange",visible);
  void loop();return()=>{stopped=true;clearTimeout(timer);clearTimeout(expiry);document.removeEventListener("visibilitychange",visible);};},[]);
 return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function LiveBanner(){const {frame,stale}=useContext(Context);return !stale && frame && !["idle","ended"].includes(frame.phase) ? <Link className="live-banner" to="/live">● {frame.phase==="draft"||frame.phase==="pregame" ? "Champion select":"Live game"}</Link>:null;}
export function Live(){
 const {frame,stale}=useContext(Context);
 useEffect(()=>{if(frame?.phase==="ended")void api.syncAll().catch(()=>{});},[frame?.streamId,frame?.phase]);
 if(stale || !frame || frame.phase==="idle")return <section className="stack"><h1 className="page-title">Live Coach</h1><p>{stale ? "The companion connection is stale. Advice is hidden until fresh data arrives: waiting for recent data from the desktop companion." : "Open the desktop companion, connect your account, and enable private Live sharing in its settings."}</p><Link to="/game">Prepare a draft manually</Link></section>;
 const blocked=["paused","reconnecting","loading"].includes(frame.phase);
 return <div className="stack"><header><h1 className="page-title">{frame.headline}</h1><p>{frame.champion && !/^\d+$/.test(frame.champion) && <ChampionIcon champion={frame.champion} size={40}/>} {frame.champion} {frame.position} · {frame.phase}{frame.patch ? ` · Data ${frame.patch}`:""}</p>{frame.time!==null && <p>{Math.floor(frame.time/60)}:{String(Math.floor(frame.time%60)).padStart(2,"0")} · {frame.gold===null ? "Gold unavailable":`${Math.floor(frame.gold)} gold`}</p>}</header>
 {!blocked && frame.detail && <LiveCompanion frame={frame}/>}
 {!blocked && <>{!frame.detail && <section className="layer"><strong>Your team</strong><p>{frame.allies.join(" · ")||"Picks not revealed"}</p><strong>Enemy team</strong><p>{frame.enemies.join(" · ")||"Picks not revealed"}</p></section>}
 {frame.sections.map((s,i)=>s.primary && !frame.detail ? <section className="coach-plan" key={i}><h2>{s.title}</h2>{s.lines.map((l,j)=><p key={j}>{l}</p>)}</section>:<details className="layer" key={i} open={frame.phase==="ended"}><summary>{s.title}</summary>{s.lines.map((l,j)=><p key={j}>{l}</p>)}</details>)}</>}
 {frame.phase==="ended" && <p><Link to="/matches">Post-game Coach and match history</Link> · <Link to="/">Player development</Link></p>}
 <p className="tile-note">Same Coach as the desktop companion. Recommendations are estimates where game information is incomplete.</p></div>;
}
