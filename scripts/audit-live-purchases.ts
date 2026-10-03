/** Full-roster shop audit. Run from apps/api with EXPORT.gz OUT.json. */
import {readFileSync,writeFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {gameData} from '../packages/knowledge/src/test-data.js';
import {parseItems,parseChampionKits} from '../packages/knowledge/src/index.js';
import {recommendBuild,POSITIONS,type EnemyInput} from '../packages/build/src/index.js';
import {parseCatalog,planPurchases} from '../packages/itemization/src/index.js';
import {buildReference} from '../apps/api/src/stats/build-reference.js';
import {validateAuditExport} from '../apps/api/src/stats/matchup-audit.js';
const d=gameData(),items=parseItems(d.ddragonItems,d.merakiItems),kits=parseChampionKits(d.ddragonChampions,d.merakiChampions),catalog=parseCatalog(d.ddragonItems,d.ddragonChampions);
const raw=validateAuditExport(JSON.parse(gunzipSync(readFileSync(process.argv[2]!)).toString()),'16.19').rows;
const rows:any[]=[];
function validate(plan:ReturnType<typeof planPurchases>,owned:number[],budget:number|null){
 const errors:string[]=[];
 function route(buys:{id:number;gold:number}[],wallet:number){
  const inventory=[...owned];let spent=0;
  for(const b of buys){
   const item=catalog.items.get(b.id);if(!item?.purchasable){errors.push('unavailable');continue;}
   const consume=(id:number,path=new Set<number>()):number=>{
    const at=inventory.indexOf(id);if(at>=0){inventory.splice(at,1);return catalog.items.get(id)?.gold??0;}
    if(path.has(id))throw new Error('Recipe cycle');
    return (catalog.items.get(id)?.from??[]).reduce((sum,child)=>sum+consume(child,new Set([...path,id])),0);
   };
   const price=item.gold-item.from.reduce((sum,id)=>sum+consume(id),0);
   if(price!==b.gold)errors.push('incorrect_incremental_price');
   spent+=price;inventory.push(item.id);
   if(spent>wallet)errors.push('overspend');
   if(inventory.filter(id=>!catalog.items.get(id)?.tags.includes('Trinket')).length>6)errors.push('slots');
  }
  return spent;
 }
 if(budget===null && plan.now)errors.push('unknown_wallet_purchase');
 if(plan.now){const spent=route(plan.now.buys,budget??0);if(spent!==plan.now.spent || plan.now.leftover!==(budget??0)-spent)errors.push('wallet_total');}
 if(plan.wait)route(plan.wait.buys,(budget??0)+plan.wait.extra);
 return [...new Set(errors)];
}
for(const me of kits)for(const position of POSITIONS){
 const rs=raw.filter(r=>r.champion.toLowerCase()===me.id.toLowerCase()&&r.position===position);
 const by=(kind:string)=>rs.filter(r=>r.kind===kind).map(({key,games,wins})=>({key,games,wins}));
 const base={me,items,position,patch:'16.19',enemies:[],evidence:{champion:me.id,position,patch:'16.19',first:by('first_item'),core:by('core')},reference:buildReference(me.id,position,'16.19',Date.parse('2026-10-02T00:00:00Z'))};
 const initial=recommendBuild(base),first=initial.first?catalog.items.get(initial.first.id):null;
 if(!first){rows.push({champion:me.id,position,scenario:'withheld',errors:[]});continue;}
 const parts=first.from,remaining=first.gold-parts.reduce((s,id)=>s+(catalog.items.get(id)?.gold??0),0);
 const scenarios:{name:string;inventory:number[];budgets:(number|null)[];enemies?:EnemyInput[]}[]=[{name:'empty',inventory:[] as number[],budgets:[0,300,1200,null]}, {name:'components',inventory:parts,budgets:[0,Math.max(0,remaining-1),remaining]}, {name:'owned_first',inventory:[first.id],budgets:[1000]}, {name:'full_slots',inventory:[...parts,...[900001,900002,900003,900004,900005,900006].slice(0,6-parts.length)],budgets:[remaining]}, {name:'enemy_armor',inventory:parts.slice(0,1),budgets:[1200],enemies:['Malphite','Rammus','Garen'].map(id=>({kit:kits.find(k=>k.id===id)!,items:items.filter(i=>[3075,3143].includes(i.id))}))}, {name:'enemy_magic',inventory:parts.slice(0,1),budgets:[1200],enemies:['Syndra','Lux','Veigar'].map(id=>({kit:kits.find(k=>k.id===id)!}))}];
 if(process.argv[4]!=='--isolated')for(const s of scenarios)for(const gold of s.budgets){
  const build=recommendBuild({...base,enemies:s.enemies??base.enemies,owned:s.inventory,economy:{gold,time:900,income:300,source:'live'}});
  const targets=[build.first,build.boots,...build.next].flatMap(p=>p&&catalog.items.has(p.id)?[catalog.items.get(p.id)!]:[]);
  const plan=planPurchases({targets,inventory:s.inventory,gold,time:900,itemGold:s.inventory.reduce((sum,id)=>sum+(catalog.items.get(id)?.gold??0),0),catalog,utility:build.componentUtility});
  const errors=validate(plan,s.inventory,gold);
  if(build.first && s.inventory.includes(build.first.id))errors.push('owned_first_recommended');
  rows.push({champion:me.id,position,scenario:s.name,gold,inventory:s.inventory,target:build.first?.name??null,buys:plan.now?.buys??[],spent:plan.now?.spent??0,leftover:plan.now?.leftover??gold,errors});
 }
 const isolated=planPurchases({targets:[first],inventory:parts,gold:remaining,time:900,itemGold:first.gold-remaining,catalog,utility:initial.componentUtility});
 rows.push({champion:me.id,position,scenario:'isolated_completion',gold:remaining,inventory:parts,target:first.name,buys:isolated.now?.buys??[],errors:validate(isolated,parts,remaining),missedCompletion:!isolated.now?.completes.includes(first.name)});
 if(position==='UTILITY')console.log(me.id,rows.length);
}
writeFileSync(process.argv[3]!,JSON.stringify(rows));
console.log(JSON.stringify({cases:rows.length,illegal:rows.filter(r=>r.errors.length).length,missedCompletion:rows.filter(r=>r.missedCompletion).length}));
