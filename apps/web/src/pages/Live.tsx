import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router";
import type { LiveFrame } from "@coach/ui";
import { api } from "../api";
import { ChampionIcon } from "../assets";
const Context=createContext<{frame:LiveFrame|null;stale:boolean}>({frame:null,stale:false});
export function LiveProvider({children}:{children:ReactNode}) {
 const [value,setValue]=useState<{frame:LiveFrame|null;stale:boolean}>({frame:null,stale:false});
 useEffect(()=>{let stopped=false;let timer:ReturnType<typeof setTimeout>;
  const loop=async()=>{try{const r=await api.live();if(!stopped)setValue(r);}catch{if(!stopped)setValue({frame:null,stale:true});}
   if(!stopped)timer=setTimeout(loop,document.hidden ? 10000:2000);
  };void loop();return()=>{stopped=true;clearTimeout(timer);};},[]);
 return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function LiveBanner(){const {frame}=useContext(Context);return frame && !["idle","ended"].includes(frame.phase) ? <Link className="live-banner" to="/live">● {frame.phase==="draft"||frame.phase==="pregame" ? "Champion select":"Live game"}</Link>:null;}
export function Live(){
 const {frame,stale}=useContext(Context);
 useEffect(()=>{if(frame?.phase==="ended")void api.syncAll().catch(()=>{});},[frame?.streamId,frame?.phase]);
 if(!frame || frame.phase==="idle")return <section className="stack"><h1 className="page-title">Live Coach</h1><p>{stale ? "The companion connection is stale. Advice is hidden until fresh data arrives: waiting for recent data from the desktop companion." : "Open the desktop companion, connect your account, and enable private Live sharing in its settings."}</p><Link to="/game">Prepare a draft manually</Link></section>;
 const blocked=["paused","reconnecting","loading"].includes(frame.phase);
 return <div className="stack"><header><h1 className="page-title">{frame.headline}</h1><p>{frame.champion && !/^\d+$/.test(frame.champion) && <ChampionIcon champion={frame.champion} size={40}/>} {frame.champion} {frame.position} · {frame.phase}{frame.patch ? ` · Data ${frame.patch}`:""}</p>{frame.time!==null && <p>{Math.floor(frame.time/60)}:{String(Math.floor(frame.time%60)).padStart(2,"0")} · {frame.gold===null ? "Gold unavailable":`${Math.floor(frame.gold)} gold`}</p>}</header>
 {!blocked && <><section className="layer"><strong>Your team</strong><p>{frame.allies.join(" · ")||"Picks not revealed"}</p><strong>Enemy team</strong><p>{frame.enemies.join(" · ")||"Picks not revealed"}</p></section>
 {frame.sections.map((s,i)=>s.primary ? <section className="coach-plan" key={i}><h2>{s.title}</h2>{s.lines.map((l,j)=><p key={j}>{l}</p>)}</section>:<details className="layer" key={i} open={frame.phase==="ended"}><summary>{s.title}</summary>{s.lines.map((l,j)=><p key={j}>{l}</p>)}</details>)}</>}
 {frame.phase==="ended" && <p><Link to="/matches">Post-game Coach and match history</Link> · <Link to="/">Player development</Link></p>}
 <p className="tile-note">Same Coach as the desktop companion. Recommendations are estimates where game information is incomplete.</p></div>;
}
