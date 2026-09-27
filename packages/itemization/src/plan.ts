import type { Catalog, CatalogItem } from "./catalog.js";

/**
 * Purchase planning: what the gold in your pocket should buy now, and when the next items
 * arrive at the pace you are earning gold. Everything comes from the patch's recipes and
 * prices and from this game's numbers; nothing is assumed about other players.
 */

export interface Buy { id: number; name: string; gold: number }

export interface PurchasePlan {
  /** The best purchase with the gold you have now (several pieces when they fit). */
  now: { buys: Buy[]; spent: number; leftover: number; completes: string[]; toward: string } | null;
  /**
   * When a little more gold buys clearly more: how much, what it buys, and how long it takes
   * at your pace. Null when waiting would not change the purchase much.
   */
  wait: { extra: number; buys: Buy[]; seconds: number | null } | null;
  /** When each target item would be finished, at your pace, in order. */
  milestones: { id: number; name: string; remaining: number; at: number | null }[];
  /** Gold earned per minute so far this game (null too early to tell). */
  pace: number | null;
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
  const cands = nodes(root).filter((n) => cost(n) > 0).slice(0, 14);
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

function bestBuy(targets: CatalogItem[], inventory: number[], gold: number, catalog: Catalog, utility?: Record<number, number>) {
  const buys: Buy[] = [], completes: string[] = [];
  let left = gold, toward = "";
  let actual = [...inventory];
  for (const t of targets) {
    // Building the recipe consumes a temporary pool, never the actual inventory.
    const root = tree(t, catalog, [...actual]);
    const full = cost(root);
    if (full === 0) continue;
    toward ||= t.name;
    if (full <= left) {
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
  return { buys, spent: gold - left, completes, toward };
}

/** How much more gold makes waiting worthwhile (less than this is not worth the time). */
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
  const { targets, inventory, gold, time, itemGold, catalog } = input;
  const pace = goldPace(time, gold, itemGold);

  // When each target would be finished, in order, at the current pace.
  const milestones: PurchasePlan["milestones"] = [];
  const pool = [...inventory];
  let owed = -(gold ?? 0);
  for (const t of targets) {
    const remaining = cost(tree(t, catalog, pool));
    if (remaining === 0) continue;
    owed += remaining;
    pool.push(t.id);
    milestones.push({ id: t.id, name: t.name, remaining, at: pace ? time + Math.max(0, owed) / (pace / 60) : null });
  }

  if (gold === null) return { now: null, wait: null, milestones, pace };
  const now = bestBuy(targets, inventory, gold, catalog, input.utility);

  // Would a little more gold buy clearly more? Look for the smallest extra that gains enough.
  let wait: PurchasePlan["wait"] = null;
  for (let extra = 25; extra <= WAIT_MAX_EXTRA; extra += 25) {
    const more = bestBuy(targets, inventory, gold + extra, catalog, input.utility);
    const useful = (buys: Buy[]) => buys.reduce((s,b)=>s+b.gold*(input.utility?.[b.id]??1),0);
    if (more.spent - now.spent >= WAIT_MIN_GAIN && useful(more.buys)>useful(now.buys)) {
      const need = Math.max(1, more.spent - gold);
      wait = { extra: need, buys: more.buys, seconds: pace ? Math.round((need / pace) * 60) : null };
      break;
    }
  }

  return {
    now: now.buys.length ? { ...now, leftover: gold - now.spent } : null,
    wait, milestones, pace,
  };
}
