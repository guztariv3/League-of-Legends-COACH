import type { BuildEvidence } from '@coach/build';
import type { ChampionStats, StatOption } from './store.js';
/** Previous-patch/display-only statistics are never silently promoted to current evidence. */
export function buildEvidence(stats:ChampionStats|null, champion:string, position:string|null, patch:string, opponent?:string|null):BuildEvidence|undefined {
 if(!stats || stats.patchLabel!=='current' || stats.patch!==patch || stats.champion!==champion || !position || stats.position!==position)return undefined;
 const source=stats.evidenceByKind??stats.byKind;
 const rows=(xs:StatOption[]|undefined)=>(xs??[]).map(({key,games,wins})=>({key,games,wins}));
 const scoped=(xs:StatOption[]|undefined)=>rows(xs).filter(r=>r.key.toLowerCase().startsWith(`${opponent?.toLowerCase()}|`)).map(r=>({...r,key:r.key.slice(r.key.indexOf('|')+1)}));
 return {champion,position,patch,first:rows(source.first_item),core:rows(source.core),runePages:rows(source.rune_page),keystones:rows(source.keystone),spells:rows(source.spells),...(opponent?{matchup:{opponent,first:scoped(source.matchup_first_item),core:scoped(source.matchup_core),runePages:scoped(source.matchup_rune_page),spells:scoped(source.matchup_spells)}}:{})};
}
