import type { BuildEvidence } from '@coach/build';
import type { ChampionStats, StatOption } from './store.js';
/** Previous-patch/display-only statistics are never silently promoted to current evidence. */
export function buildEvidence(stats:ChampionStats|null, champion:string, position:string|null, patch:string, opponent?:string|null):BuildEvidence|undefined {
 if(!stats || stats.patchLabel!=='current' || stats.patch!==patch || stats.champion!==champion || !position || stats.position!==position)return undefined;
 const rows=(xs:StatOption[]|undefined)=>(xs??[]).map(({key,games,wins})=>({key,games,wins}));
 const scoped=(xs:StatOption[]|undefined)=>rows(xs).filter(r=>r.key.startsWith(`${opponent}|`)).map(r=>({...r,key:r.key.slice(r.key.indexOf('|')+1)}));
 return {champion,position,patch,first:rows(stats.byKind.first_item),core:rows(stats.byKind.core),runePages:rows(stats.byKind.rune_page),spells:rows(stats.byKind.spells),...(opponent?{matchup:{opponent,first:scoped(stats.byKind.matchup_first_item),core:scoped(stats.byKind.matchup_core),runePages:scoped(stats.byKind.matchup_rune_page),spells:scoped(stats.byKind.matchup_spells)}}:{})};
}
