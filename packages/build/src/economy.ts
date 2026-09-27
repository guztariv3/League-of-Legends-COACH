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
  const pieces = new Map<number,ItemFacts>();
  const visit=(i:ItemFacts, depth=0)=>{ if(depth>6 || pieces.has(i.id))return; pieces.set(i.id,i); for(const id of i.from){const c=catalog.get(id);if(c)visit(c,depth+1);} };
  visit(item);
  const affordable = budget == null ? [] : [...pieces.values()].filter(i=>{const cost=remainingCost(i,catalog,[...owned]);return cost>0 && cost<=budget;});
  const componentFit = Math.max(0,...affordable.map(value));
  const income = economy?.income;
  const seconds = budget != null && income != null && income > 0 ? Math.max(0,remaining-budget)/income*60 : null;
  const needed = budget == null ? null : Math.max(0,remaining-budget);
  return {remaining, seconds, componentFit, affordable:affordable.length,
    reason: `${remaining} gold recipe cost after owned components${needed===null ? "" : `; ${needed} additional gold needed`}${seconds !== null ? `; approximately ${Math.ceil(seconds/60)} min if the ${economy?.source === "history" ? "historical non-kill/assist" : "observed"} income pace continues` : "; completion time is unknown"}. ${budget == null ? "Recall budget is unknown." : affordable.length ? "Useful recipe options are evaluated at your current budget." : "No new recipe component fits the current budget."}${economy?.opponentCompleted ? " Your lane opponent already has a completed item; delaying completion carries tempo risk." : ""}`};
}
