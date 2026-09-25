import { z } from "zod";

/**
 * The official item and champion catalog from Data Dragon (`item.json`, `champion.json`),
 * reduced to what the item suggestions use. Everything here comes from Riot's files:
 * stats, tags, recipes (`from`), prices, map availability and descriptions.
 */
export interface CatalogItem {
  id: number;
  name: string;
  /** Full price. */
  gold: number;
  /** Direct components (recipe), possibly repeated. */
  from: number[];
  tags: string[];
  stats: Record<string, number>;
  /** Map ids where it can be bought (11 = Summoner's Rift, 12 = Howling Abyss). */
  maps: number[];
  /** A finished item you would build towards (not a component, starter, consumable or upgrade). */
  completed: boolean;
  /** Tier-2 boots. */
  boots: boolean;
  /** Its description mentions Grievous Wounds (anti-healing). */
  antiHeal: boolean;
}

export interface CatalogChampion {
  id: string;
  name: string;
  /** Riot's class tags, main one first (e.g. ["Mage", "Support"]). */
  tags: string[];
  /** Riot's 0–10 ratings. */
  attack: number;
  magic: number;
  defense: number;
}

export interface Catalog {
  version: string;
  items: Map<number, CatalogItem>;
  champions: Map<string, CatalogChampion>;
}

const DDItem = z.looseObject({
  name: z.string(),
  description: z.string().optional(),
  from: z.array(z.string()).optional(),
  into: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  stats: z.record(z.string(), z.number()).optional(),
  maps: z.record(z.string(), z.boolean()).optional(),
  gold: z.looseObject({ total: z.number(), purchasable: z.boolean().optional() }),
  inStore: z.boolean().optional(),
  hideFromAll: z.boolean().optional(),
  consumed: z.boolean().optional(),
  requiredChampion: z.string().optional(),
  requiredAlly: z.string().optional(),
});
const DDItemFile = z.looseObject({ version: z.string(), data: z.record(z.string(), DDItem) });
const DDChampionFile = z.looseObject({
  version: z.string(),
  data: z.record(z.string(), z.looseObject({
    id: z.string(),
    name: z.string(),
    tags: z.array(z.string()).default([]),
    info: z.looseObject({ attack: z.number(), magic: z.number(), defense: z.number() }).optional(),
  })),
});

const BASIC_BOOTS = 1001;
const ANTI_HEAL = /heridas graves|grievous wounds/i;
const NOT_BUILT_TOWARDS = ["Consumable", "Trinket", "Lane", "Jungle", "GoldPer"];

export function parseCatalog(itemJson: unknown, championJson: unknown): Catalog {
  const items = DDItemFile.parse(itemJson);
  const champs = DDChampionFile.parse(championJson);
  const buyable = (i: z.infer<typeof DDItem>) =>
    i.gold.purchasable !== false && i.inStore !== false && !i.hideFromAll && !i.consumed && !i.requiredChampion && !i.requiredAlly;

  const out = new Map<number, CatalogItem>();
  for (const [key, i] of Object.entries(items.data)) {
    const id = Number(key);
    if (!Number.isInteger(id)) continue;
    const tags = i.tags ?? [];
    const from = (i.from ?? []).map(Number);
    // Upgrades that only exist through other means (e.g. Ornn) do not count as "builds into".
    const buildsInto = (i.into ?? []).some((t) => { const n = items.data[t]; return n !== undefined && buyable(n); });
    const boots = tags.includes("Boots") && from.includes(BASIC_BOOTS);
    out.set(id, {
      id,
      name: i.name,
      gold: i.gold.total,
      from,
      tags,
      stats: i.stats ?? {},
      maps: Object.entries(i.maps ?? {}).filter(([, on]) => on).map(([m]) => Number(m)),
      completed: buyable(i) && !buildsInto && !boots && i.gold.total >= 2000 && !tags.some((t) => NOT_BUILT_TOWARDS.includes(t)),
      boots: boots && buyable(i),
      antiHeal: ANTI_HEAL.test(i.description ?? ""),
    });
  }
  const champions = new Map<string, CatalogChampion>();
  for (const c of Object.values(champs.data)) {
    champions.set(c.id, { id: c.id, name: c.name, tags: c.tags, attack: c.info?.attack ?? 5, magic: c.info?.magic ?? 5, defense: c.info?.defense ?? 5 });
  }
  return { version: items.version, items: out, champions };
}
