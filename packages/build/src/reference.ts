/** External specialist popularity is a reference, never a game count or win rate. */
export interface BuildReference {
  champion:string; position:string; patch:string; source:string; url:string; retrievedAt:string;
  /** Prefix-conditioned next choices. Independent later slots are not joint paths. */
  stages:{prefix:number[]; item:number; weight:number}[];
}
export function referencePrior(input:{reference?:BuildReference;champion:string;position?:string|null;patch?:string;held:number[];chosen:number[];candidate:number}):{bonus:number;reason:string;primary:boolean;order:number}|null {
  const r=input.reference;
  if(!r || r.champion!==input.champion || r.position!==input.position || r.patch!==input.patch)return null;
  const held=[...input.held].sort((a,b)=>a-b);
  const options=r.stages.filter(x=>Number.isFinite(x.weight)&&x.weight>0 && x.prefix.length===held.length+input.chosen.length &&
    [...x.prefix.slice(0,held.length)].sort((a,b)=>a-b).every((id,i)=>id===held[i]) && input.chosen.every((id,i)=>x.prefix[held.length+i]===id));
  const weights=new Map<number,number>();
  // Duplicate displayed routes must not manufacture extra support.
  for(const x of options)weights.set(x.item,Math.max(weights.get(x.item)??0,x.weight));
  const weight=weights.get(input.candidate),max=Math.max(0,...weights.values());
  if(!weight || weight<max*.2)return null;
  return {order:[...weights.keys()].indexOf(input.candidate),primary:weight===max,bonus:.8*Math.sqrt(weight/max),reason:`External specialist reference: ${r.source}, patch ${r.patch}, ${r.position}, retrieved ${r.retrievedAt.slice(0,10)}. Matching purchase prefix; popularity only, no verified sample size or win rate. ${r.url}`};
}
