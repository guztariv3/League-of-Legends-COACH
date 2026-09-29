import { POSITIONS } from '@coach/build';
import type { CoverageCount } from './coverage.js';

export interface AuditChampion { id: string; detail: string; positions: string[] }
export interface AuditExport { schemaVersion: 1; patch: string; complete: true; generatedAt: string; source: string; rows: CoverageCount[] }
export type SampleStatus = 'sufficient_sample' | 'insufficient_sample' | 'no_observations' | 'not_verified';
export interface Sample { observations: number | null; supportedOptions: number | null; status: SampleStatus }
const categories = ['first_item', 'rune_page', 'spells'] as const;
const unknown = (): Sample => ({observations:null,supportedOptions:null,status:'not_verified'});
const valid = (r: CoverageCount) => Number.isSafeInteger(r.games) && r.games>=0 && Number.isSafeInteger(r.wins) && r.wins>=0 && r.wins<=r.games;
const sample = (rows: CoverageCount[]): Sample => {
 const observations=rows.reduce((n,r)=>n+r.games,0),supportedOptions=rows.filter(r=>r.games>=30).length;
 return {observations,supportedOptions,status:observations>=100 && supportedOptions>0?'sufficient_sample':observations>0?'insufficient_sample':'no_observations'};
};
/** Reject partial, duplicate or mismatched exports: absent rows only mean zero in a complete snapshot. */
export function validateAuditExport(value:unknown, patch:string): AuditExport {
 const x=value as AuditExport;
 if(!x || x.schemaVersion!==1 || x.patch!==patch || x.complete!==true || !Array.isArray(x.rows) || typeof x.source!=='string' || !x.source || typeof x.generatedAt!=='string' || !Number.isFinite(Date.parse(x.generatedAt)))throw new Error('A complete, dated, exact-patch aggregate export is required');
 const seen=new Set<string>();
 for(const r of x.rows){
  if(!r || r.patch!==patch || !['champion','position','kind','key'].every(k=>typeof r[k as keyof CoverageCount]==='string') || !valid(r))throw new Error('Invalid aggregate row');
  const key=JSON.stringify([r.champion,r.position,r.kind,r.key]);
  if(seen.has(key))throw new Error('Duplicate aggregate row');seen.add(key);
 }
 return x;
}

/** Indexed exhaustive coverage. Thresholds are sample gates, never build-optimality certification. */
export function matchupAudit(champions:AuditChampion[], patch:string, input?:AuditExport) {
 if(new Set(champions.map(c=>c.id)).size!==champions.length)throw new Error('Duplicate roster champion');
 const snapshot=input ? validateAuditExport(input,patch) : undefined;
 const groups=new Map<string,CoverageCount[]>();
 for(const row of snapshot?.rows??[]){const key=JSON.stringify([row.champion,row.position]);const g=groups.get(key)??[];g.push(row);groups.set(key,g);}
 const roster=new Set(champions.map(c=>c.id));
 const unsupportedRows=(snapshot?.rows??[]).filter(r=>!roster.has(r.champion)||!(POSITIONS as readonly string[]).includes(r.position)).length;
 const contexts=champions.flatMap(champion=>POSITIONS.map(position=>{
  const rows=groups.get(JSON.stringify([champion.id,position]))??[];
  const general=Object.fromEntries(categories.map(k=>[k,snapshot?sample(rows.filter(r=>r.kind===k)):unknown()])) as Record<typeof categories[number],Sample>;
  const matchupRows=new Map<string,CoverageCount[]>();
  for(const r of rows){
   if(!r.kind.startsWith('matchup_')||!r.key.includes('|'))continue;
   const split=r.key.indexOf('|'),opponent=r.key.slice(0,split);
   const g=matchupRows.get(opponent)??[];g.push({...r,kind:r.kind.slice(8),key:r.key.slice(split+1)});matchupRows.set(opponent,g);
  }
  const games=snapshot ? rows.find(r=>r.kind==='games'&&r.key==='')?.games??0 : null;
  const matchupGames=new Map(rows.filter(r=>r.kind==='matchup').map(r=>[r.key,r.games]));
  return {champion,position,rows,general,matchupRows,matchupGames,games};
 }));
 const common=(c:typeof contexts[number])=>({patch,champion:c.champion.id,position:c.position,mechanics:c.champion.detail,roleListed:c.champion.positions.includes(c.position),roleGames:c.games,roleSample:c.games===null?'not_verified':c.games>=30?'display_gate_met':c.games>0?'below_display_gate':'no_observations',optimalityVerified:false});
 const flatten=(name:string,s:Sample)=>({[`${name}_observations`]:s.observations,[`${name}_supported_options`]:s.supportedOptions,[`${name}_sample`]:s.status});
 function* general(){for(const c of contexts)yield {...common(c),...Object.assign({},...categories.map(k=>flatten(k,c.general[k])))};}
 function* matchups(){
  for(const c of contexts)for(const opponent of champions){
   const rows=c.matchupRows.get(opponent.id)??[], mirror=c.champion.id===opponent.id;
   const values=categories.map(kind=>{
    const scoped=snapshot?sample(rows.filter(r=>r.kind===kind)):unknown();
    const selected=scoped.status==='sufficient_sample'?'matchup':c.general[kind].status==='sufficient_sample'?'general_role':snapshot?'mechanics_only':'not_verified';
    return {...flatten(kind,scoped),[`${kind}_sample_scope`]:selected};
   });
   yield {...common(c),opponent:opponent.id,opponentMechanics:opponent.detail,opponentRoleListed:opponent.positions.includes(c.position),mirror,rankedMirrorExcluded:mirror,
    matchupGames:snapshot?c.matchupGames.get(opponent.id)??0:null,...Object.assign({},...values),coreAssessment:'see_prefix_report',engineMatchupExecuted:false};
  }
 }
 // A core total cannot certify later purchases. Group each observed prefix and
 // aggregate its next options using the same prefix boundaries as purchasePrior.
 function* prefixes():Generator<Record<string,unknown>>{
  if(!snapshot)return;
  for(const c of contexts)for(const [opponent,rows] of [['',c.rows],...c.matchupRows] as [string,CoverageCount[]][]){
   const buckets=new Map<string,Map<string,CoverageCount>>();
   for(const r of rows.filter(r=>r.kind==='core'&&/^\d+(>\d+)+$/.test(r.key))){
    const ids=r.key.split('>');
    for(let n=1;n<ids.length;n++){
     const prefix=ids.slice(0,n).join('>'),key=ids[n]!;
     const bucket=buckets.get(prefix)??new Map();const prior=bucket.get(key);
     bucket.set(key,{...r,key,games:r.games+(prior?.games??0),wins:r.wins+(prior?.wins??0)});buckets.set(prefix,bucket);
    }
   }
   for(const [prefix,bucket] of buckets)yield {...common(c),opponent,scope:opponent?'matchup':'general_role',prefix,...flatten('next_item',sample([...bucket.values()])),eligibility:'sample_only_catalog_legality_and_held_inventory_not_verified'};
  }
 }
 return {general,matchups,prefixes,metadata:{patch,champions:champions.length,roles:POSITIONS.length,championRoleCases:contexts.length,matchupCases:contexts.length*champions.length,
  nonMirrorMatchupCases:contexts.length*(champions.length-1),mirrorCases:contexts.length,source:snapshot?.source??'unavailable',exportedAt:snapshot?.generatedAt??null,completeExportProvided:Boolean(snapshot),unsupportedRows,
  sampleRule:'100 observations in scope and at least one option with 30; sample availability only',
  limitations:['No sample threshold certifies strategic optimality or a viable role.','General-role fallback is not matchup-specific evidence.','Rune/page/spell legality and item eligibility need engine validation.','Core coverage is conditional on the recorded prefix; inventory order is not purchase order.','The ranked-only collector cannot supply mirror matchups.','No complete-matchup engine execution is claimed.','Source provenance is declared by the export and has not been independently certified.']}};
}
