import type {BuildReference} from '@coach/build';
import references from '../data/onetricks-builds.json' with {type:'json'};
const indexed=new Map<string,BuildReference>(references.map(r=>[`${r.champion}|${r.position}|${r.patch}`,r]));
/** No network request in draft/live. Stale snapshots and other roles fail closed. */
export function buildReference(champion:string,position:string|null,patch:string,now=Date.now()):BuildReference|undefined {
 const r=indexed.get(`${champion}|${position}|${patch}`);
 if(!r)return undefined;
 const age=now-Date.parse(r.retrievedAt);
 return age>=0 && age<=14*86400000?r:undefined;
}
