/** Reproducible engineering audit, not a table of endorsed/meta-optimal builds.
 * Run: pnpm --filter @coach/api exec node --import tsx ../../scripts/audit-roster.ts
 */
import { writeFileSync } from 'node:fs';
import { parseChampionKits, parseItems, parseRunes, parseSummonerSpells } from '../packages/knowledge/src/index.js';
import { gameData } from '../packages/knowledge/src/test-data.js';
import { POSITIONS, recommendBuild, recommendSetup } from '../packages/build/src/index.js';
const d=gameData(),kits=parseChampionKits(d.ddragonChampions,d.merakiChampions),items=parseItems(d.ddragonItems,d.merakiItems),runes=parseRunes(d.perks,d.perkStyles),spells=parseSummonerSpells(d.summoners);
const opponents=['Garen','LeeSin','Ahri','Jinx','Thresh'];
const rows: unknown[][]=[['patch','champion','position','source_positions_not_exhaustive','mechanics_detail','lane_opponent','first_candidate','next_candidates','boots','keystone','primary_runes','secondary_tree','secondary_runes','shards','summoners','basis','optimality_verified']];
for(const me of kits)for(const [index,position] of POSITIONS.entries()){
 const enemies=opponents.map((id,i)=>({kit:kits.find(k=>k.id===id)!,laneOpponent:i===index}));
 const build=recommendBuild({me,items,enemies,position,patch:d.meta.ddragonVersion.split('.').slice(0,2).join('.')});
 const setup=recommendSetup({me,enemies,position,runes,spells});
 rows.push([d.meta.ddragonVersion,me.id,position,me.positions.join('|'),me.detail,opponents[index],build.first?.name??'',build.next.map(i=>i.name).join('|'),build.boots?.name??'',setup.runes?.keystone.name??'',setup.runes?.primary.map(r=>r.name).join('|')??'',setup.runes?.secondaryTree??'',setup.runes?.secondary.map(r=>r.name).join('|')??'',setup.runes?.shards.map(r=>r.name).join('|')??'',setup.spells.map(s=>s.name).join('|'),me.detail==='full'?'mechanics_only':'withheld_incomplete_mechanics','no']);
}
const csv=rows.map(row=>row.map(value=>'"'+String(value).replaceAll('"','""')+'"').join(',')).join('\n')+'\n';
writeFileSync(new URL('../docs/20-roster-audit.csv',import.meta.url),csv);
console.log(JSON.stringify({patch:d.meta.ddragonVersion,champions:kits.length,cases:rows.length-1,incompleteMechanics:kits.filter(k=>k.detail!=='full').map(k=>k.id),report:'docs/20-roster-audit.csv'}));
