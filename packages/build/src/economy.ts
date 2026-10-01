import type { ItemFacts } from "@coach/knowledge";
export interface EconomyContext { gold: number | null; time: number; income: number | null; opponentCompleted?: boolean; source?: "history" | "live" }
export interface ItemTiming { remaining: number; seconds: number | null; componentFit: number; affordable: number; reason: string }
/** Consume each owned component once, respecting recursive recipes and duplicate components. */
export function remainingCost(item: ItemFacts, items: Map<number, ItemFacts>, owned: number[], seen = new Set<number>()): number {
  const at = owned.indexOf(item.id);
  if (at >= 0) { owned.splice(at,1); return 0; }
  if (seen.has(item.id)) return item.gold;
  const next = new Set(seen).add(item.id);
  return Math.max(0, item.gold - item.from.reduce((sum,id) => { const c=items.get(id); return sum+(c ? c.gold-remainingCost(c,items,owned,next) : 0); },0));
}
export function itemTiming(item: ItemFacts, items: ItemFacts[], owned: number[], economy: EconomyContext | undefined, value: (item: ItemFacts)=>number): ItemTiming {
  const catalog = new Map(items.map(i=>[i.id,i]));
  const remaining = remainingCost(item,catalog,[...owned]);
  const budget = economy?.gold;
  // Allocate held copies to recipe occurrences once. Looking up each distinct
  // component in isolation hides a needed second copy when one is already held.
  const pool=[...owned];
  const affordable:ItemFacts[]=[];
  const visit=(i:ItemFacts,path=new Set<number>()):{cost:number;consumed:number[]}=>{
    const at=pool.indexOf(i.id);
    if(at>=0){pool.splice(at,1);return {cost:0,consumed:[i.id]};}
    if(path.has(i.id))return {cost:i.gold,consumed:[]};
    const next=new Set(path).add(i.id);
    const children=i.from.map(id=>catalog.get(id)).filter((c):c is ItemFacts=>!!c)
      .map(child=>({item:child,...visit(child,next)}));
    const cost=Math.max(0,i.gold-children.reduce((sum,c)=>sum+c.item.gold-c.cost,0));
    const consumed=children.flatMap(c=>c.consumed);
    const remainingInventory=[...owned];
    for(const id of consumed){const index=remainingInventory.indexOf(id);if(index>=0)remainingInventory.splice(index,1);}
    const occupied=remainingInventory.filter(id=>!catalog.get(id)?.tags.includes("Trinket")).length;
    if(budget!=null && i.purchasable && cost>0 && cost<=budget && occupied<6)affordable.push(i);
    return {cost,consumed};
  };
  visit(item);
  const componentFit = Math.max(0,...affordable.map(value));
  const income = economy?.income;
  const seconds = budget != null && income != null && income > 0 ? Math.max(0,remaining-budget)/income*60 : null;
  const needed = budget == null ? null : Math.max(0,remaining-budget);
  return {remaining, seconds, componentFit, affordable:affordable.length,
    reason: `${remaining} gold recipe cost after owned components${needed===null ? "" : `; ${needed} additional gold needed`}${seconds !== null ? `; approximately ${Math.ceil(seconds/60)} min if the ${economy?.source === "history" ? "historical non-kill/assist" : "observed"} income pace continues` : "; completion time is unknown"}. ${budget == null ? "Recall budget is unknown." : affordable.length ? "Useful recipe options are evaluated at your current budget." : "No new recipe component is purchasable within the current budget and inventory space."}${economy?.opponentCompleted ? " Your lane opponent already has a completed item; delaying completion carries tempo risk." : ""}`};
}
