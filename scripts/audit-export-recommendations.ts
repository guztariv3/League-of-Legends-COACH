/** Audit every catalog champion in five roles against four fixed scenarios.
 * Supplied aggregate data stays outside git. This reports engine behavior, not optimality.
 * Run from apps/api: node --import tsx ../../scripts/audit-export-recommendations.ts input.json.gz output.json
 */
import {readFileSync,writeFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {validateAuditExport} from '../apps/api/src/stats/matchup-audit.js';
import {parseChampionKits,parseItems,parseRunes,parseSummonerSpells} from '../packages/knowledge/src/index.js';
import {gameData} from '../packages/knowledge/src/test-data.js';
import {recommendBuild,recommendSetup,championProfile,POSITIONS} from '../packages/build/src/index.js';
const d=gameData(),kits=parseChampionKits(d.ddragonChampions,d.merakiChampions),items=parseItems(d.ddragonItems,d.merakiItems),runes=parseRunes(d.perks,d.perkStyles),spells=parseSummonerSpells(d.summoners),raw=readExport();
function readExport(){
 if(!process.argv[2] || !process.argv[3])throw new Error('Usage: audit-export-recommendations.ts input.json[.gz] output.json');
 const bytes=readFileSync(process.argv[2]),value=JSON.parse((process.argv[2].endsWith('.gz')?gunzipSync(bytes):bytes).toString('utf8'));
 const snapshot=validateAuditExport(value,d.meta.ddragonVersion.split('.').slice(0,2).join('.'));
 const names=new Map(kits.map(k=>[k.id.toLowerCase(),k.id]));
 return snapshot.rows.map(r=>({...r,champion:names.get(r.champion.toLowerCase())??r.champion,key:r.kind==='matchup'?(names.get(r.key.toLowerCase())??r.key):r.key}));
}
const kit=(id:string)=>kits.find(k=>k.id===id)!;
const output:any[]=[];
for(const me of kits){for(const [index,position] of POSITIONS.entries()){
 const rs=raw.filter((r:any)=>r.champion===me.id&&r.position===position),by=(kind:string)=>rs.filter((r:any)=>r.kind===kind).map(({key,games,wins}:any)=>({key,games,wins}));
 const evidence={champion:me.id,position,patch:'16.19',first:by('first_item'),core:by('core'),runePages:by('rune_page'),keystones:by('keystone'),spells:by('spells')};
 const matchup=rs.filter((r:any)=>r.kind==='matchup'&&kit(r.key)).sort((a:any,b:any)=>b.games-a.games)[0];
 const ids=['Garen','LeeSin','Ahri','Jinx','Thresh'];ids[index]=matchup?.key??ids[index];
 // Avoid duplicate enemy champions when replacing the lane opponent.
 const used=new Set<string>();for(let n=0;n<ids.length;n++){if(n===index)continue;if(ids[n]===ids[index]||used.has(ids[n]))ids[n]=kits.find(k=>k.id!==me.id&&k.id!==ids[index]&&!ids.includes(k.id)&&!used.has(k.id))!.id;used.add(ids[n]);}
 const enemies=ids.map((id,i)=>({kit:kit(id),laneOpponent:i===index}));
 const input={me,items,position,patch:'16.19',evidence,enemies};
 const build=recommendBuild(input),setup=recommendSetup({...input,runes,spells});
 const variants=[{name:'neutral',enemies:[]},{name:'armor',enemies:enemies.map(e=>({...e,items:items.filter(i=>[3075,3143].includes(i.id))}))},{name:'magic',enemies:['Gwen','Lillia','Syndra','Ziggs','Lux'].map((id,i)=>({kit:kit(id),laneOpponent:i===index}))}].map(v=>{const b=recommendBuild({...input,enemies:v.enemies});return {name:v.name,first:b.first,next:b.next,boots:b.boots};});
 const options=evidence.first,total=options.reduce((n:any,r:any)=>n+r.games,0),supported=total>=100&&options.some((r:any)=>r.games>=30),selected=options.find((r:any)=>r.key===String(build.first?.id));
 output.push({champion:me.id,position,profile:championProfile(me),games:rs.find((r:any)=>r.kind==='games')?.games??0,supported,selectedCount:selected?.games??0,matchup:matchup??null,first:build.first,next:build.next,boots:build.boots,starter:build.starter,setup,variants,audit:build.audit});
}console.log(me.id,output.length);}
writeFileSync(process.argv[3]!,JSON.stringify(output));
