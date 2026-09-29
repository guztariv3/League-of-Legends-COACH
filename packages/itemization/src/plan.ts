import type { Catalog, CatalogItem } from "./catalog.js";

/**
 * Purchase planning: what the gold in your pocket should buy now, and when the next items
 * arrive at the pace you are earning gold. Everything comes from the patch's recipes and
 * prices and from this game's numbers; nothing is assumed about other players.
 */

export interface Buy { id: number; name: string; gold: number; targetId?: number; targetName?: string; reason?: string }
export interface RecipeView { id: number; name: string; gold: number; remaining: number; owned: boolean; children: RecipeView[] }

export interface PurchasePlan {
  /** The best purchase with the gold you have now (several pieces when they fit). */
  now: { buys: Buy[]; spent: number; leftover: number; completes: string[]; toward: string } | null;
  /**
   * When a little more gold buys clearly more: how much, what it buys, and how long it takes
   * at your pace. Null when waiting would not change the purchase much.
   */
  wait: { extra: number; buys: Buy[]; seconds: number | null } | null;
  /** Ordered targets. Only the next unpaid target has a conditional ETA;
   * immediately affordable completions have at=time, later targets have at=null. */
  milestones: { id: number; name: string; remaining: number; at: number | null }[];
  /** Gold earned per minute so far this game (null too early to tell). */
  pace: number | null;
  route?: Buy[];
  recipes?: RecipeView[];
  deferred?: string[];
}

/** Summoner's Rift: 500 starting gold; income (minions, passive gold) starts around 1:05. */
export const STARTING_GOLD = 500;
const INCOME_STARTS_SEC = 65;

/**
 * Gold per minute so far: what you hold (unspent gold plus the value of your items) minus the
 * starting gold, over the minutes of income. It undercounts gold spent on things you no longer
 * hold (consumables, sold items), and can overcount free upgrades, so it is only an approximation.
 */
export function goldPace(time: number, gold: number | null, itemGold: number): number | null {
  if (gold === null || time < INCOME_STARTS_SEC + 120) return null;
  const earned = gold + itemGold - STARTING_GOLD;
  const minutes = (time - INCOME_STARTS_SEC) / 60;
  return earned > 0 ? earned / minutes : null;
}

interface Node { item: CatalogItem; children: Node[]; parent: Node | null; owned: boolean }

/** The recipe tree of an item, marking the pieces you already hold (each inventory item used once). */
function tree(item: CatalogItem, catalog: Catalog, pool: number[], parent: Node | null = null, depth = 0): Node {
  // A piece you already hold counts as bought (each inventory item is used once).
  const at = pool.indexOf(item.id);
  const owned = at >= 0;
  if (owned) pool.splice(at, 1);
  const node: Node = { item, children: [], parent, owned };
  if (!owned && depth < 3) {
    node.children = item.from.map((id) => catalog.items.get(id)).filter((c): c is CatalogItem => c !== undefined)
      .map((c) => tree(c, catalog, pool, node, depth + 1));
  }
  return node;
}

/** What buying this node costs now: its own price minus the pieces under it you already hold. */
function cost(n: Node): number {
  if (n.owned) return 0;
  const childValue = n.children.reduce((s, c) => s + c.item.gold, 0);
  return n.item.gold - childValue + n.children.reduce((s, c) => s + cost(c), 0);
}

function nodes(n: Node, out: Node[] = []): Node[] {
  if (!n.owned) { out.push(n); for (const c of n.children) nodes(c, out); }
  return out;
}

const related = (a: Node, b: Node) => {
  for (let p: Node | null = a; p; p = p.parent) if (p === b) return true;
  for (let p: Node | null = b; p; p = p.parent) if (p === a) return true;
  return false;
};

/** Every purchase you could make now toward this item: sets of pieces that don't overlap. */
function options(root: Node): { set: Node[]; spent: number }[] {
  const cands = nodes(root).filter((n) => cost(n) > 0 && n.item.purchasable !== false).slice(0, 14);
  const out: { set: Node[]; spent: number }[] = [];
  const walk = (i: number, set: Node[], spent: number) => {
    if (i === cands.length) { if (set.length) out.push({ set: [...set], spent }); return; }
    walk(i + 1, set, spent);
    const n = cands[i]!;
    if (!set.some((s) => related(s, n))) { set.push(n); walk(i + 1, set, spent + cost(n)); set.pop(); }
  };
  walk(0, [], 0);
  return out;
}

/**
 * Best use of `gold` toward the targets in order: finish the first target if you can, then
 * spend what is left on the next one. Within a target, the set of pieces that spends the most
 * (bigger pieces carry more of the item's stats); ties go to fewer, larger pieces.
 */
/** Apply purchases in an order that frees component slots before buying loose pieces. */
function fitPurchases(set: Node[], inventory: number[], catalog: Catalog): { ordered: Node[]; inventory: number[] } | null {
  const held = (n: Node): number[] => n.owned ? [n.item.id] : n.children.flatMap(held);
  const ordered = [...set].sort((a, b) => held(b).length - held(a).length);
  const next = [...inventory];
  const slots = () => next.filter((id) => !catalog.items.get(id)?.tags.includes("Trinket")).length;
  for (const node of ordered) {
    for (const id of held(node)) {
      const at = next.indexOf(id);
      if (at < 0) return null;
      next.splice(at, 1);
    }
    next.push(node.item.id);
    if (slots() > 6) return null;
  }
  return { ordered, inventory: next };
}

function sequentialBuy(targets: CatalogItem[], inventory: number[], gold: number, catalog: Catalog, utility?: Record<number, number>) {
  const buys: Buy[] = [], completes: string[] = [];
  let left = gold, toward = "";
  let actual = [...inventory];
  for (const t of targets) {
    // Building the recipe consumes a temporary pool, never the actual inventory.
    const root = tree(t, catalog, [...actual]);
    const full = cost(root);
    if (full === 0) continue;
    toward ||= t.name;
    if (full <= left && t.purchasable !== false) {
      const fit = fitPurchases([root], actual, catalog);
      if (!fit) break;
      buys.push({ id: t.id, name: t.name, gold: full });
      completes.push(t.name);
      left -= full;
      actual = fit.inventory;
      continue;
    }
    const best = options(root).filter((o) => o.spent <= left)
      .map((o) => ({ ...o, fit: fitPurchases(o.set, actual, catalog) }))
      .filter((o) => o.fit !== null)
      .sort((a, b) => {
        const worth = (o: typeof a) => o.set.reduce((s,n) => s + cost(n) * (utility?.[n.item.id] ?? 1), 0);
        return worth(b)-worth(a) || b.spent-a.spent || a.set.length-b.set.length;
      })[0];
    if (best?.fit) {
      for (const n of best.fit.ordered) buys.push({ id: n.item.id, name: n.item.name, gold: cost(n) });
      left -= best.spent;
      actual = best.fit.inventory;
    }
    break; // later targets wait until this one is finished
  }
  return { buys, spent: gold - left, completes, toward, value: gold - left, inventory: actual };
}

/** Search legal shopping sequences across targets. Inventory is simulated after EACH purchase;
 * recipes cannot reuse a component already consumed by an earlier purchase. Search is bounded
 * so the game reader is never blocked by an exponential six-item combination search.
 * Without contextual utilities retain the conservative ordered plan, not invented urgency.
 */
function bestBuy(targets: CatalogItem[], inventory: number[], gold: number, catalog: Catalog, utility?: Record<number, number>) {
  if (!utility) return sequentialBuy(targets, inventory, gold, catalog);
  type Search = { inventory: number[]; buys: Buy[]; spent: number; value: number; completes: string[] };
  let beam: Search[] = [{ inventory: [...inventory], buys: [], spent: 0, value: 0, completes: [] }];
  let best = beam[0]!;
  const worth = (id: number) => Number.isFinite(utility[id]) ? Math.max(0, utility[id]!) : 0;
  // Assign each item a stable priority independent of which recipe a search step calls it part of.
  const priorities = new Map<number, number>();
  for (const [index,target] of targets.slice(0,6).entries()) {
    for (const node of nodes(tree(target,catalog,[]))) {
      priorities.set(node.item.id,Math.max(priorities.get(node.item.id) ?? 0,1/(1+index*.18)));
    }
  }
  const inventoryValue = (held:number[]) => [...held].sort((a,b)=>a-b).reduce((sum,id)=>sum+(catalog.items.get(id)?.gold ?? 0)*worth(id)*(priorities.get(id) ?? 0),0);
  const initialValue=inventoryValue(inventory);
  const primary = targets.find(t => !inventory.includes(t.id));
  const primaryCost = primary ? cost(tree(primary,catalog,[...inventory])) : 0;
  // A completion bonus is fixed at the start, never enlarged by splitting a purchase into steps.
  const completionBonus=new Map(targets.slice(0,6).map(t=>[t.id,worth(t.id)>0 ? cost(tree(t,catalog,[...inventory]))*.1 : 0]));
  const valueOf = (held:number[]) => inventoryValue(held)-initialValue +
    [...completionBonus].reduce((sum,[id,bonus])=>sum+(held.includes(id) && !inventory.includes(id) ? bonus : 0),0);
  for (let depth = 0; depth < 8; depth++) {
    const next = new Map<string, Search>();
    for (const state of beam) for (const [index, target] of targets.slice(0, 6).entries()) {
      if (state.inventory.includes(target.id)) continue;
      const root = tree(target, catalog, [...state.inventory]);
      for (const node of nodes(root).slice(0, 20)) {
        const price = cost(node);
        if (node.item.purchasable === false || price <= 0 || price + state.spent > gold) continue;
        const fit = fitPurchases([node], state.inventory, catalog);
        if (!fit) continue;
        const completed = node === root;
        // Spending outside the current recipe delays its completion. Charge that
        // opportunity cost, so spare gold alone cannot justify opening another tree.
        // A substantially more useful purchase can still overcome this cost.
        const remaining = primary ? cost(tree(primary,catalog,[...fit.inventory])) : 0;
        const diverted = Math.max(0,state.spent + price - (primaryCost - remaining));
        const delayCost = remaining > 0 && primary ? diverted * worth(primary.id) * 1.1 : 0;
        const value = valueOf(fit.inventory) - delayCost;
        if (value <= state.value) continue;
        const reason = index === 0 ? 'Advances your current target with useful stats.' : remaining > 0
          ? 'Its estimated immediate utility outweighs delaying the current target; keep the unfinished components and re-evaluate after buying.'
          : 'The current target is complete; advances the next recipe.';
        const step: Search = { inventory: fit.inventory, spent: state.spent + price, value,
          buys: [...state.buys, {id:node.item.id,name:node.item.name,gold:price,targetId:target.id,targetName:target.name,reason}],
          completes: completed ? [...state.completes,target.name] : state.completes };
        const key = [...step.inventory].sort((a,b)=>a-b).join(',');
        if (!next.has(key) || next.get(key)!.value < value) next.set(key, step);
        if (value > best.value || value === best.value && step.buys.length < best.buys.length) best = step;
      }
    }
    beam = [...next.values()].sort((a,b)=>b.value-a.value || a.buys.length-b.buys.length).slice(0, 24);
    if (!beam.length) break;
  }
  return {buys:best.buys,spent:best.spent,completes:best.completes,toward:best.buys[0]?.targetName ?? targets[0]?.name ?? '',value:best.value,inventory:best.inventory};
}

/** A visual recipe allocates shared inventory once across the planned targets. */
function recipesFor(targets: CatalogItem[], inventory: number[], catalog: Catalog): RecipeView[] {
  const pool = [...inventory];
  const view = (n: Node): RecipeView => ({id:n.item.id,name:n.item.name,gold:n.item.gold,remaining:cost(n),owned:n.owned,children:n.children.map(view)});
  return targets.slice(0,6).map(t=>view(tree(t,catalog,pool)));
}

/** Suppress small spending-only changes; nearby completions and first useful purchases are exceptions. */
const WAIT_MIN_GAIN = 300;
const WAIT_MAX_EXTRA = 450;

export function planPurchases(input: {
  targets: CatalogItem[];
  inventory: number[];
  gold: number | null;
  time: number;
  itemGold: number;
  catalog: Catalog;
  utility?: Record<number, number>;
}): PurchasePlan {
  const { inventory, gold, time, itemGold, catalog } = input;
  const targets = [...new Map(input.targets.map(t => [t.id,t])).values()];
  const now = gold === null ? null : bestBuy(targets, inventory, gold, catalog, input.utility);
  const priority = [...(now?.completes ?? []).flatMap(name=>targets.filter(t=>t.name===name)), ...targets];
  const ordered = [...new Map(priority.map(t=>[t.id,t])).values()];
  const pace = goldPace(time, gold, itemGold);

  // A snapshot-derived pace is not a forecast of the whole match. Estimate
  // only the next unpaid target; retain costs/order for later decisions.
  const milestones: PurchasePlan["milestones"] = [];
  const pool = [...inventory];
  // Follow the recommended purchases before forecasting: gold spent on another
  // target is no longer available for this one, and consumed pieces cannot count twice.
  const projected = [...(now?.inventory ?? inventory)];
  let owed = (now?.spent ?? 0) - (gold ?? 0);
  let forecastUsed = false;
  for (const t of ordered) {
    const remaining = cost(tree(t, catalog, pool));
    if (remaining === 0) continue;
    owed += cost(tree(t, catalog, projected));
    projected.push(t.id);
    pool.push(t.id);
    const completesNow = now?.completes.includes(t.name) ?? false;
    const at = completesNow ? time : !forecastUsed && pace && owed > 0 ? time + owed / (pace / 60) : null;
    if (!completesNow) forecastUsed = true;
    milestones.push({ id: t.id, name: t.name, remaining, at });
  }

  if (gold === null) return { now: null, wait: null, milestones, pace, recipes: recipesFor(targets,inventory,catalog), route: [], deferred: [] };
  if (!now) throw new Error("Missing purchase search");

  // Nearby saving alternatives, not a command to idle at the shop. Include exact
  // recipe costs and the endpoint; the coarse utility grid alone skipped 326–450.
  const thresholds = new Set<number>([WAIT_MAX_EXTRA]);
  for (let extra=25;extra<=WAIT_MAX_EXTRA;extra+=input.utility?150:25) thresholds.add(extra);
  for (const target of targets.slice(0,6)) for (const node of nodes(tree(target,catalog,[...inventory])).slice(0,20)) {
    const extra=cost(node)-gold;
    if(node.item.purchasable!==false && extra>0 && extra<=WAIT_MAX_EXTRA) thresholds.add(extra);
  }
  let wait: PurchasePlan["wait"] = null;
  for (const extra of [...thresholds].sort((a,b)=>a-b)) {
    const more = bestBuy(targets, inventory, gold + extra, catalog, input.utility);
    const completesNew = more.completes.some(name=>!now.completes.includes(name));
    const usefulChange = more.spent-now.spent>=WAIT_MIN_GAIN || completesNew || now.buys.length===0;
    if (usefulChange && more.buys.length>0 && more.value > now.value) {
      const need = Math.max(1, more.spent - gold);
      wait = { extra: need, buys: more.buys, seconds: pace ? Math.round((need / pace) * 60) : null };
      break;
    }
  }

  return {
    now: now.buys.length ? { buys: now.buys, spent: now.spent, completes: now.completes, toward: now.toward, leftover: gold - now.spent } : null,
    wait, milestones, pace,
    route: now.buys, recipes: recipesFor(ordered,inventory,catalog),
    // Describe what remains AFTER shopping, allocating each retained piece once.
    // A piece consumed by another target is no longer an unfinished investment.
    deferred: recipesFor(targets.filter(t=>!now.inventory.includes(t.id)),now.inventory,catalog)
      .filter(r=>r.remaining>0 && r.remaining<r.gold && now.buys.some(b=>b.targetId && b.targetId!==r.id))
      .map(r=>r.name),
  };
}

/** Shared recursive cost projection for compact item suggestions. */
export function recipeView(item: CatalogItem, inventory: number[], catalog: Catalog): RecipeView {
  return recipesFor([item], inventory, catalog)[0]!;
}

/** Compact suggestion uses the same shop and slot checks as the full shopping route. */
export function nextRecipePurchase(item: CatalogItem, inventory: number[], gold: number | null, catalog: Catalog): Buy | null {
  if (gold === null) return null;
  const root=tree(item,catalog,[...inventory]);
  const candidate=nodes(root).filter(n=>n.item.purchasable!==false && cost(n)>0 && cost(n)<=gold && fitPurchases([n],inventory,catalog))
    .sort((a,b)=>cost(b)-cost(a))[0];
  return candidate ? {id:candidate.item.id,name:candidate.item.name,gold:cost(candidate)} : null;
}
