import type { Catalog, CatalogChampion, CatalogItem } from "./catalog.js";

/**
 * The item to start the game with on Summoner's Rift, chosen from the role and
 * the lane matchup. Every rule is a known starting pattern stated with its
 * reason; an item missing from the current patch is simply not suggested.
 */

export const STARTER_IDS = {
  dBlade: 1055,
  dRing: 1056,
  dShield: 1054,
  potion: 2003,
  worldAtlas: 3865,
  scorchclaw: 1101,
  gustwalker: 1102,
  mosstomper: 1103,
} as const;

export interface StarterInput {
  catalog: Catalog;
  map: number | null;
  /** Live position ("TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"), null when unknown. */
  position: string | null;
  championId: string;
  laneOpponentId: string | null;
}

export interface StarterSuggestion {
  items: CatalogItem[];
  reasons: string[];
  alternatives: CatalogItem[];
}

/** Ranged when the basic attack reaches past 300 units; null when unknown. */
function isRanged(c: CatalogChampion | undefined): boolean | null {
  return c?.attackRange == null ? null : c.attackRange > 300;
}

export function suggestStarter(input: StarterInput): StarterSuggestion | null {
  const { catalog } = input;
  if (input.map !== 11 || !input.position) return null;
  const get = (id: number) => catalog.items.get(id);
  const me = catalog.champions.get(input.championId);
  const opp = input.laneOpponentId ? catalog.champions.get(input.laneOpponentId) : undefined;
  const potion = get(STARTER_IDS.potion);
  const withPotion = (main: CatalogItem | undefined) => (main ? [main, ...(potion ? [potion] : [])] : []);
  const out = (main: CatalogItem | undefined, reasons: string[], alternatives: (CatalogItem | undefined)[] = []): StarterSuggestion | null =>
    main ? { items: withPotion(main), reasons, alternatives: alternatives.filter((a): a is CatalogItem => a !== undefined) } : null;

  if (input.position === "JUNGLE") {
    const tank = me?.tags[0] === "Tank";
    const main = get(tank ? STARTER_IDS.mosstomper : STARTER_IDS.scorchclaw);
    return out(main, [
      "Jungling needs a companion item: it lets Smite clear camps and grows as you take them.",
      tank ? "Mosstomper's shield suits a frontline champion." : "Scorchclaw's burn adds damage to your ganks.",
    ], [get(STARTER_IDS.gustwalker), get(tank ? STARTER_IDS.scorchclaw : STARTER_IDS.mosstomper)]);
  }
  if (input.position === "UTILITY") {
    return out(get(STARTER_IDS.worldAtlas), ["The support item earns you gold while leaving the minions to your laner."]);
  }

  const magic = (me?.magic ?? 0) > (me?.attack ?? 0);
  if (magic) {
    return out(get(STARTER_IDS.dRing), [`${me?.name ?? "Your champion"} deals mostly magic damage: Doran's Ring gives ability power and mana.`], [get(STARTER_IDS.dShield)]);
  }
  const meRanged = isRanged(me);
  const oppRanged = isRanged(opp);
  if (meRanged === false && oppRanged === true && opp && me) {
    return out(get(STARTER_IDS.dShield), [
      `You are melee against a ranged opponent (${opp.name}, ${opp.attackRange} range vs your ${me.attackRange}): Doran's Shield helps you absorb their poke.`,
    ], [get(STARTER_IDS.dBlade)]);
  }
  return out(get(STARTER_IDS.dBlade), [`${me?.name ?? "Your champion"} deals mostly physical damage: Doran's Blade gives attack damage and health.`], [get(STARTER_IDS.dShield)]);
}
