/** Reproduce recipe availability parity on the bundled patch. Run from apps/api with node --import tsx ../../scripts/audit-recipe-affordability.ts. */
import {gameData} from '../packages/knowledge/src/test-data.js';
import {parseItems} from '../packages/knowledge/src/index.js';
import {itemTiming} from '../packages/build/src/economy.js';
import {parseCatalog} from '../packages/itemization/src/catalog.js';
import {nextRecipePurchase} from '../packages/itemization/src/plan.js';
const d=gameData(),items=parseItems(d.ddragonItems,d.merakiItems),catalog=parseCatalog(d.ddragonItems,d.ddragonChampions);
let checked=0;const mismatches=[];
for(const item of items.filter(i=>i.purchasable&&i.rank.includes('LEGENDARY'))){
 const target=catalog.items.get(item.id);if(!target)continue;
 for(const owned of [[],...(item.from.length?[[item.from[0]!]]:[]),[1055,1055,1055,1055,1055,1055]])for(const gold of [300,850,1500,4000]){
 const timing=itemTiming(item,items,owned,{gold,time:600,income:300},()=>1);
 const buy=nextRecipePurchase(target,owned,gold,catalog);
 checked++;
 if(Boolean(timing.affordable)!==Boolean(buy))mismatches.push({item:item.id,name:item.name,owned,gold,affordable:timing.affordable,buy});
 }
}
console.log(JSON.stringify({checked,mismatches}));

if(mismatches.length)process.exitCode=1;
