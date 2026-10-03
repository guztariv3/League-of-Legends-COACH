import { isCompletedPurchase } from "@coach/knowledge";
import type { ItemFacts, ItemStat } from "@coach/knowledge";
import type { ThreatKind } from "./threats.js";

/**
 * What an item does, read from its data: its stats (valued in gold, from what the shop charges
 * for each stat on its basic items) and the mechanics its passives and actives describe.
 * Mechanics are recognised by what the text says they do, never by the item's name or id.
 */
export type StatKey = `${ItemStat}:${"flat" | "percent"}`;

export type Counter =
  | "critReduction" | "grievousWounds" | "antiShield" | "attackSpeedSlow" | "maxHealthDamage"
  | "spellShield" | "stasis" | "cleanse" | "magicShield";

/** Which enemy threat each counter answers. */
export const COUNTERS: Record<Counter, { answers: ThreatKind[]; says: string }> = {
  critReduction: { answers: ["crit"], says: "reduces damage from critical strikes" },
  grievousWounds: { answers: ["healing"], says: "applies Grievous Wounds, which cuts healing" },
  antiShield: { answers: ["shields"], says: "reduces enemy shields" },
  attackSpeedSlow: { answers: ["attackSpeed"], says: "slows enemy attack speed" },
  maxHealthDamage: { answers: ["tanks"], says: "deals damage based on the target's health" },
  spellShield: { answers: ["cc", "burst"], says: "blocks an ability with a spell shield" },
  stasis: { answers: ["burst"], says: "has a stasis active (untargetable for a moment)" },
  cleanse: { answers: ["cc"], says: "removes crowd control" },
  magicShield: { answers: ["burst"], says: "shields against magic damage" },
};

/**
 * Counters whose value is only in answering a threat. An item whose counters are all of this kind
 * is not recommended against a team that doesn't bring that threat (e.g. crit reduction with no crit).
 */
export const THREAT_ONLY: Counter[] = ["critReduction", "grievousWounds", "antiShield", "attackSpeedSlow", "spellShield", "stasis", "cleanse", "magicShield"];

/** Health-based damage: "X% of the target's maximum/current/missing health" as damage (not as a trigger condition). */
const TARGET_HEALTH = /(?:target'?s?|their|each target'?s?|enemy'?s?) (?:maximum|max|current|missing) health/i;
const healthDamage = (t: string) =>
  TARGET_HEALTH.test(t) && /damage/i.test(t) && !/(?:at or )?below [\d.]+% of|within [\d.]+ seconds? inflicts/i.test(t)
  // Amplifying a fixed hit as a target loses health is an execute mechanic,
  // not damage proportional to the target's health pool.
  && !/increased by[^.]{0,100}(?:target'?s? |their )missing health/i.test(t);

/** Each detector reads one sentence at a time, so words from different effects never combine. */
const DETECT: [Counter, (t: string) => boolean][] = [
  ["critReduction", (t) => /reduc\w* (?:all )?(?:incoming )?damage (?:taken )?(?:from|of) critical strikes|critical strikes? (?:deal|do)s? [\d.]+% less/i.test(t)],
  ["grievousWounds", (t) => /grievous wounds/i.test(t)],
  ["antiShield", (t) => /reduc\w* (?:any |all )?(?:of their )?(?:active )?shields|shields? they gain/i.test(t)],
  ["attackSpeedSlow", (t) => /reduc\w* (?:the )?(?:attack speed of (?:nearby |all )?enem\w*|(?:nearby )?enem\w*'? attack speed|their attack speed|attackers?'? attack speed)/i.test(t)],
  ["maxHealthDamage", healthDamage],
  ["spellShield", (t) => /spell ?shield/i.test(t)],
  ["stasis", (t) => /\bstasis\b/i.test(t)],
  ["cleanse", (t) => /(?:remov|cleans)\w* (?:all )?(?:crowd control|disables|debuffs|immobiliz)/i.test(t)],
  ["magicShield", (t) => /shield that absorbs[^.]*magic damage|absorbs? magic damage/i.test(t)],
];

/** Sentences of an item's effect texts. */
const sentences = (item: ItemFacts) => item.effects.flatMap((e) => e.text.split(/(?<=\.)\s+/));

export interface ItemProfile {
  item: ItemFacts;
  /** Stat lines, each with its gold value. */
  stats: { key: StatKey; amount: number; gold: number }[];
  counters: Counter[];
  /** Grants mana (it also covers mana needs). */
  mana: number;
  /** Its passive restores or regenerates mana. */
  manaSustain: boolean;
  /** Deals damage back when struck by an enemy basic attack, independently of healing reduction. */
  attackReflection: boolean;
  /** Amplifies critical strikes (critical strike damage), which the shop's basic items cannot price. */
  critAmplify: boolean;
  /** An item a player builds towards (finished, bought from the shop on Summoner's Rift). */
  finished: boolean;
  boots: boolean;
}

/** Gold per stat point, from the shop's items (basic single-stat items first, then recipes). */
export function statGoldValues(items: ItemFacts[]): Map<StatKey, number> {
  const shop = items.filter((i) => i.purchasable && i.gold > 0);
  const lines = (i: ItemFacts) => Object.entries(i.stats).flatMap(([k, v]) => [
    ...(v!.flat ? [{ key: `${k}:flat` as StatKey, amount: v!.flat }] : []),
    ...(v!.percent ? [{ key: `${k}:percent` as StatKey, amount: v!.percent }] : []),
  ]);
  const values = new Map<StatKey, number>();
  const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]!; };
  // Pass 1: single-stat items with no passive. Later passes: items where exactly one stat is still
  // unknown, giving it the price left after the known stats (effects make these approximate).
  const passes: ((i: ItemFacts) => boolean)[] = [
    (i) => i.effects.length === 0 && (i.rank.includes("BASIC") || i.rank.includes("BOOTS")),
    (i) => i.effects.length === 0,
    (i) => i.rank.includes("EPIC") || i.rank.includes("BASIC") || i.rank.includes("BOOTS"),
    () => true,
  ];
  for (const ok of passes) {
    for (let round = 0; round < 3; round++) {
      const guesses = new Map<StatKey, number[]>();
      for (const i of shop.filter(ok)) {
        const ls = lines(i);
        const unknown = ls.filter((l) => !values.has(l.key));
        if (unknown.length !== 1) continue;
        const known = ls.filter((l) => values.has(l.key)).reduce((s, l) => s + l.amount * values.get(l.key)!, 0);
        const left = i.gold - known;
        if (left > 0) guesses.set(unknown[0]!.key, [...(guesses.get(unknown[0]!.key) ?? []), left / unknown[0]!.amount]);
      }
      for (const [k, gs] of guesses) values.set(k, median(gs));
      if (!guesses.size) break;
    }
  }
  return values;
}

/**
 * Can be bought from the shop, directly and through every component of its recipe. Items that
 * come out of a quest (e.g. a support item's upgrades) are not buildable this way.
 */
export function buildable(item: ItemFacts, catalog: Map<number, ItemFacts>, depth = 0): boolean {
  if (!item.purchasable || depth > 4) return false;
  // Zero-cost upgrades of completed boots require progression which the input does not prove.
  if (item.from.some(id => { const base = catalog.get(id); return base?.rank.includes("BOOTS") && base.from.length > 0 && item.gold <= base.gold; })) return false;
  return item.from.every((id) => { const c = catalog.get(id); return c !== undefined && buildable(c, catalog, depth + 1); });
}

export function itemProfile(item: ItemFacts, gold: Map<StatKey, number>, catalog: Map<number, ItemFacts> = new Map([[item.id, item]])): ItemProfile {
  const stats = Object.entries(item.stats).flatMap(([k, v]) => [
    ...(v!.flat ? [{ key: `${k}:flat` as StatKey, amount: v!.flat }] : []),
    ...(v!.percent ? [{ key: `${k}:percent` as StatKey, amount: v!.percent }] : []),
  ]).map((l) => ({ ...l, gold: l.amount * (gold.get(l.key) ?? 0) }));
  const parts = sentences(item);
  const counters = DETECT.filter(([, test]) => parts.some(test)).map(([c]) => c);
  // Upgraded boots (a recipe that contains boots) take the boots slot, not an item slot.
  const fromBoots = item.from.some((id) => catalog.get(id)?.rank.includes("BOOTS"));
  const canBuild = buildable(item, catalog);
  const finished = canBuild && isCompletedPurchase(item, catalog) && !fromBoots;
  const boots = canBuild && (item.rank.includes("BOOTS") || fromBoots) && item.from.length > 0;
  const manaSustain = parts.some((t) => /restor\w*[^.]{0,40}\bmana\b|\bmana regeneration\b|regenerat\w*[^.]{0,30}\bmana\b/i.test(t));
  const attackReflection = parts.some(t => /when struck by a basic attack[^.]*deal[^.]*damage to the attacker/i.test(t));
  return { item, stats, counters, attackReflection, mana: item.stats.mana?.flat ?? 0, manaSustain, critAmplify: (item.stats.criticalStrikeDamage?.percent ?? 0) > 0, finished, boots };
}
