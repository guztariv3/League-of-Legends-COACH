import type { DraftReadView } from "./live.js";
export function DraftCard({read}:{read:DraftReadView}) {
 return <section aria-label="Draft coach"><h3>Draft Coach</h3><p>{read.coverage}</p><dl>
 {[["Team fit",read.teamFit],["Versus enemy",read.versus],["Key reason",read.advantage],["Main concern",read.concern]].map(([k,v])=><div key={k}><dt><strong>{k}</strong></dt><dd>{v}</dd></div>)}
 </dl><details><summary>Matchup and evidence</summary><p>{read.matchup}</p><ul>{[...read.evidence,...read.unknown].map((s,i)=><li key={i}>{s}</li>)}</ul></details></section>;
}
