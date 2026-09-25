import type { Catalog, CatalogChampion, CatalogItem } from "./catalog.js";

/**
 * Item suggestions that follow the game: what the enemies build and how they are doing,
 * and what the player's champion and items need. Deterministic rules over Riot's own data
 * (item stats, tags and recipes; champion class and damage ratings) and the live game.
 * No win-rate tables: nothing here comes from other players' games. Every suggestion
 * carries the facts that produced it.
 */
export interface PlayerView {
  championId: string;
  champion: string;
  items: number[];
  kills: number;
  deaths: number;
  level: number;
}

export interface SuggestInput {
  catalog: Catalog;
  /** 11 = Summoner's Rift, 12 = Howling Abyss (ARAM and its variants). */
  map: number | null;
  me: PlayerView;
  gold: number | null;
  enemies: PlayerView[];
  /** Items the player usually finishes with this champion (optional, from their history). */
  usual?: number[];
  /** The item suggested last time; kept unless another is clearly better (no flicker). */
  previous?: number | null;
}

export interface PathStep { id: number; name: string; gold: number; owned: boolean }
export interface PurchasePath {
  steps: PathStep[];
  /** Gold still needed for the whole item, counting components you already have. */
  remaining: number;
  /** What the current gold can buy now: the item itself, or the best component. */
  affordableNow: { id: number; name: string; gold: number } | null;
}
export interface Suggestion {
  item: CatalogItem;
  score: number;
  reasons: string[];
  path: PurchasePath;
}
export interface Suggestions {
  next: Suggestion | null;
  alternatives: Suggestion[];
  boots: Suggestion | null;
  /** How the enemy team looks, for the header. */
  enemy: { magicShare: number; healers: string[]; armor: number; magicResist: number };
  /** Why there is nothing to suggest, when there is nothing. */
  note: string | null;
}

type Lean = "magic" | "physical";
type Archetype = "Mage" | "Marksman" | "Assassin" | "Fighter" | "Tank" | "Support";

const stat = (i: CatalogItem, k: string) => i.stats[k] ?? 0;
const AP = "FlatMagicDamageMod", AD = "FlatPhysicalDamageMod", AS = "PercentAttackSpeedMod", CRIT = "FlatCritChanceMod";
const HP = "FlatHPPoolMod", ARMOR = "FlatArmorMod", MR = "FlatSpellBlockMod", LIFESTEAL = "PercentLifeStealMod";

function itemsOf(ids: number[], catalog: Catalog): CatalogItem[] {
  return ids.map((id) => catalog.items.get(id)).filter((i): i is CatalogItem => i !== undefined);
}

/** Magic vs physical, from the champion's ratings and (weighted more) its items. */
function magicFraction(champ: CatalogChampion | undefined, items: CatalogItem[]): number {
  const itemMagic = items.reduce((s, i) => s + stat(i, AP) / 80, 0);
  const itemPhys = items.reduce((s, i) => s + stat(i, AD) / 45 + (stat(i, AS) / 0.3) * 0.7 + (stat(i, CRIT) / 0.25) * 0.7, 0);
  const cm = champ ? champ.magic / 10 : 0.5;
  const cp = champ ? champ.attack / 10 : 0.5;
  const total = cm + cp + 2 * (itemMagic + itemPhys);
  return total > 0 ? (cm + 2 * itemMagic) / total : 0.5;
}

function archetypeOf(champ: CatalogChampion | undefined): Archetype {
  const t = champ?.tags[0];
  return t === "Mage" || t === "Marksman" || t === "Assassin" || t === "Fighter" || t === "Tank" || t === "Support" ? t : "Fighter";
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const list = (names: string[]) => (names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} y ${names.at(-1)}`);

/** Components of an item and what is left to pay, counting the ones already in the inventory. */
export function purchasePath(item: CatalogItem, inventory: number[], gold: number | null, catalog: Catalog): PurchasePath {
  const pool = [...inventory];
  const take = (id: number) => { const at = pool.indexOf(id); if (at < 0) return false; pool.splice(at, 1); return true; };
  const steps: PathStep[] = item.from.map((id) => {
    const c = catalog.items.get(id);
    return { id, name: c?.name ?? `Objeto ${id}`, gold: c?.gold ?? 0, owned: take(id) };
  });
  const remaining = Math.max(0, item.gold - steps.filter((s) => s.owned).reduce((s, x) => s + x.gold, 0));
  let affordableNow: PurchasePath["affordableNow"] = null;
  if (gold !== null) {
    if (gold >= remaining) affordableNow = { id: item.id, name: item.name, gold: remaining };
    else {
      // The most expensive missing piece that fits in the purse (looking one level down too).
      const options: { id: number; name: string; gold: number }[] = [];
      for (const s of steps.filter((x) => !x.owned)) {
        options.push({ id: s.id, name: s.name, gold: s.gold });
        for (const sub of catalog.items.get(s.id)?.from ?? []) {
          const c = catalog.items.get(sub);
          if (c) options.push({ id: c.id, name: c.name, gold: c.gold });
        }
      }
      affordableNow = options.filter((o) => o.gold <= gold).sort((a, b) => b.gold - a.gold)[0] ?? null;
    }
  }
  return { steps, remaining, affordableNow };
}

export function suggestItems(input: SuggestInput): Suggestions {
  const { catalog, me, enemies } = input;
  const myChamp = catalog.champions.get(me.championId);
  const myItems = itemsOf(me.items, catalog);
  const archetype = archetypeOf(myChamp);
  const lean: Lean = magicFraction(myChamp, myItems) >= 0.5 ? "magic" : "physical";

  // ---- The enemy team, weighted by how strong each one is right now.
  let threatSum = 0, magicSum = 0, healSum = 0, armorSum = 0, mrSum = 0;
  const healers: string[] = [];
  const magicDealers: { name: string; w: number }[] = [];
  const physDealers: { name: string; w: number }[] = [];
  for (const e of enemies) {
    const champ = catalog.champions.get(e.championId);
    const items = itemsOf(e.items, catalog);
    const itemGold = items.reduce((s, i) => s + i.gold, 0);
    const threat = Math.max(0.3, 1 + 0.25 * e.kills - 0.1 * e.deaths + itemGold / 4000);
    // Tanks bring less damage than their share of the team.
    const dmg = threat * Math.min(1, Math.max(0.4, 1.2 - (champ?.defense ?? 5) / 10));
    const mf = magicFraction(champ, items);
    threatSum += dmg;
    magicSum += dmg * mf;
    (mf >= 0.5 ? magicDealers : physDealers).push({ name: e.champion, w: dmg });
    if (items.some((i) => i.tags.includes("LifeSteal") || i.tags.includes("SpellVamp") || stat(i, LIFESTEAL) > 0)) {
      healSum += threat;
      healers.push(e.champion);
    }
    armorSum += items.reduce((s, i) => s + stat(i, ARMOR), 0);
    mrSum += items.reduce((s, i) => s + stat(i, MR), 0);
  }
  const n = Math.max(1, enemies.length);
  const magicShare = threatSum > 0 ? magicSum / threatSum : 0.5;
  const physShare = 1 - magicShare;
  const healShare = threatSum > 0 ? healSum / enemies.reduce((s, e) => s + Math.max(0.3, 1 + 0.25 * e.kills - 0.1 * e.deaths), 0) : 0;
  const avgArmor = armorSum / n, avgMr = mrSum / n;
  const enemy = { magicShare, healers, armor: Math.round(avgArmor), magicResist: Math.round(avgMr) };
  const top = (xs: { name: string; w: number }[]) => xs.sort((a, b) => b.w - a.w).slice(0, 3).map((x) => x.name);

  if (!catalog.items.size) return { next: null, alternatives: [], boots: null, enemy, note: "Sin el catálogo de objetos no hay sugerencias." };

  // ---- What the player needs.
  const offenseWeight = { Mage: 1, Marksman: 1, Assassin: 1, Fighter: 0.7, Support: 0.5, Tank: 0.25 }[archetype];
  const struggling = Math.min(0.6, Math.max(0, (me.deaths - me.kills) * 0.1));
  const defenseWeight = { Tank: 1, Fighter: 0.6, Support: 0.45, Mage: 0.25, Marksman: 0.2, Assassin: 0.2 }[archetype] + struggling;
  const ownsAntiHeal = myItems.some((i) => i.antiHeal);
  const owned = new Set(me.items);
  const usual = new Set(input.usual ?? []);

  const offense = (i: CatalogItem) => (lean === "magic"
    ? stat(i, AP) / 100
    : stat(i, AD) / 55 + stat(i, AS) / 0.4 + stat(i, CRIT) / 0.25 * 0.8);
  const defense = (i: CatalogItem) => (stat(i, ARMOR) / 55) * physShare * 2 + (stat(i, MR) / 55) * magicShare * 2 + stat(i, HP) / 500;
  const frontline = archetype === "Tank" || archetype === "Fighter" || archetype === "Support";
  const fits = (i: CatalogItem) => {
    if (offense(i) > 0) return true;
    const defensive = stat(i, ARMOR) + stat(i, MR) > 0 || stat(i, HP) >= 300;
    // Pure defence suits frontliners; damage dealers get defence that also brings their damage.
    return defensive && frontline;
  };
  // Items for the other damage type are not for this champion (a mage does not want crit).
  const wrongDamage = (i: CatalogItem) => (lean === "magic"
    ? stat(i, AD) > 0 || stat(i, CRIT) > 0
    : stat(i, AP) > 0);

  const score = (i: CatalogItem): Suggestion | null => {
    if (owned.has(i.id) || !fits(i) || wrongDamage(i)) return null;
    if (input.map !== null && i.maps.length && !i.maps.includes(input.map)) return null;
    const reasons: string[] = [];
    let s = offense(i) * offenseWeight;
    if (offense(i) > 0) {
      reasons.push(lean === "magic"
        ? `Da ${stat(i, AP)} de poder de habilidad, lo que usa ${me.champion}.`
        : `Da daño físico${stat(i, AS) ? " y velocidad de ataque" : ""}${stat(i, CRIT) ? " y crítico" : ""}, lo que usa ${me.champion}.`);
    }
    const d = defense(i) * defenseWeight;
    s += d;
    if (stat(i, MR) > 0 && magicShare >= 0.55) reasons.push(`El ${pct(magicShare)} del daño rival es mágico (${list(top(magicDealers))}): da resistencia mágica.`);
    if (stat(i, ARMOR) > 0 && physShare >= 0.55) reasons.push(`El ${pct(physShare)} del daño rival es físico (${list(top(physDealers))}): da armadura.`);
    if (d > 0 && struggling >= 0.2) reasons.push(`Vas ${me.kills}/${me.deaths}: algo de defensa te mantiene más tiempo en las peleas.`);
    if (i.antiHeal && healShare >= 0.3 && !ownsAntiHeal) {
      s += 0.9 * (offense(i) > 0 || frontline ? 1 : 0.3);
      reasons.push(`${list(healers.slice(0, 3))} se ${healers.length > 1 ? "curan" : "cura"} con robo de vida: aplica Heridas graves.`);
    }
    if (lean === "physical" && i.tags.includes("ArmorPenetration") && avgArmor >= 50) {
      s += 0.5;
      reasons.push(`Los rivales llevan de media ${Math.round(avgArmor)} de armadura en objetos: da penetración de armadura.`);
    }
    if (lean === "magic" && i.tags.includes("MagicPenetration") && avgMr >= 40) {
      s += 0.5;
      reasons.push(`Los rivales llevan de media ${Math.round(avgMr)} de resistencia mágica en objetos: da penetración mágica.`);
    }
    if (usual.has(i.id)) {
      s += 0.3;
      reasons.push(`Lo sueles terminar con ${me.champion}.`);
    }
    return { item: i, score: s, reasons, path: purchasePath(i, me.items, input.gold, catalog) };
  };

  const ranked = [...catalog.items.values()].filter((i) => i.completed).map(score)
    .filter((x): x is Suggestion => x !== null && x.score > 0)
    .sort((a, b) => b.score - a.score || a.item.gold - b.item.gold || a.item.id - b.item.id);
  // Keep the previous suggestion while it is still close to the best (no flicker between reads).
  const prevAt = input.previous ? ranked.findIndex((x) => x.item.id === input.previous) : -1;
  if (prevAt > 0 && ranked[prevAt]!.score >= ranked[0]!.score * 0.9) ranked.unshift(...ranked.splice(prevAt, 1));

  // Boots, while the player has none.
  let boots: Suggestion | null = null;
  if (!myItems.some((i) => i.tags.includes("Boots"))) {
    const bootScore = (i: CatalogItem): Suggestion | null => {
      if (input.map !== null && i.maps.length && !i.maps.includes(input.map)) return null;
      const reasons: string[] = [];
      let s = 0.1;
      // A team that deals mostly one damage type makes the matching resist boots stand out.
      if (stat(i, ARMOR) > 0) { s += physShare * 1.2 * (0.5 + defenseWeight) + (physShare >= 0.7 ? 0.4 : 0); if (physShare >= 0.55) reasons.push(`El ${pct(physShare)} del daño rival es físico: estas botas dan armadura.`); }
      if (stat(i, MR) > 0) { s += magicShare * 1.2 * (0.5 + defenseWeight) + (magicShare >= 0.7 ? 0.4 : 0); if (magicShare >= 0.55) reasons.push(`El ${pct(magicShare)} del daño rival es mágico: estas botas dan resistencia mágica.`); }
      if (lean === "magic" && i.tags.includes("MagicPenetration")) { s += 0.6 * offenseWeight + 0.3; reasons.push("Dan penetración mágica para tu daño."); }
      if (lean === "physical" && stat(i, AS) > 0) { s += (archetype === "Marksman" ? 0.9 : 0.4) * offenseWeight; reasons.push("Dan velocidad de ataque para tu daño."); }
      if (usual.has(i.id)) { s += 0.3; reasons.push(`Las sueles llevar con ${me.champion}.`); }
      return reasons.length ? { item: i, score: s, reasons, path: purchasePath(i, me.items, input.gold, catalog) } : null;
    };
    boots = [...catalog.items.values()].filter((i) => i.boots).map(bootScore)
      .filter((x): x is Suggestion => x !== null)
      .sort((a, b) => b.score - a.score || a.item.id - b.item.id)[0] ?? null;
  }

  return {
    next: ranked[0] ?? null,
    alternatives: ranked.slice(1, 3),
    boots,
    enemy,
    note: ranked.length ? null : "No hay objetos de este mapa que encajen con tu campeón en el catálogo.",
  };
}
