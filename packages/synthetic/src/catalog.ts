/**
 * Fictional catalog for the synthetic environment. These are NOT real League
 * champions or items. The ids live in a 9000+ range so they can never collide
 * with, or be mistaken for, real Data Dragon data. The shape mirrors Data
 * Dragon's champion.json / item.json so the knowledge pipeline is exercised
 * end-to-end.
 */
export const SYNTHETIC_KNOWLEDGE_VERSION = "0.0.1-synthetic";

export type ChampionClass = "Mage" | "Assassin" | "Marksman" | "Tank" | "Fighter" | "Support";

export interface SyntheticChampion {
  id: string;
  key: number;
  name: string;
  title: string;
  tags: ChampionClass[];
  roles: ("TOP" | "JUNGLE" | "MIDDLE" | "BOTTOM" | "UTILITY")[];
}

export const SYNTHETIC_CHAMPIONS: readonly SyntheticChampion[] = [
  { id: "Aurelith", key: 9001, name: "Aurelith", title: "the Glass Tide", tags: ["Mage"], roles: ["MIDDLE"] },
  { id: "Korvane", key: 9002, name: "Korvane", title: "the Quiet Blade", tags: ["Assassin"], roles: ["MIDDLE", "JUNGLE"] },
  { id: "Brannoc", key: 9003, name: "Brannoc", title: "the Iron Hill", tags: ["Tank"], roles: ["TOP", "UTILITY"] },
  { id: "Sylvaine", key: 9004, name: "Sylvaine", title: "the Thorn Archer", tags: ["Marksman"], roles: ["BOTTOM"] },
  { id: "Myrr", key: 9005, name: "Myrr", title: "the Lantern Keeper", tags: ["Support", "Mage"], roles: ["UTILITY"] },
  { id: "Talgrim", key: 9006, name: "Talgrim", title: "the Ash Duelist", tags: ["Fighter"], roles: ["TOP", "JUNGLE"] },
  { id: "Oshra", key: 9007, name: "Oshra", title: "the Dune Hunter", tags: ["Fighter", "Assassin"], roles: ["JUNGLE"] },
  { id: "Veyl", key: 9008, name: "Veyl", title: "the Pale Star", tags: ["Mage", "Support"], roles: ["MIDDLE", "UTILITY"] },
  { id: "Dravok", key: 9009, name: "Dravok", title: "the Rust Warden", tags: ["Tank", "Fighter"], roles: ["TOP", "JUNGLE"] },
  { id: "Nimue", key: 9010, name: "Nimue", title: "the Tidecaller", tags: ["Marksman", "Mage"], roles: ["BOTTOM", "MIDDLE"] },
  { id: "Harrow", key: 9011, name: "Harrow", title: "the Grey Shield", tags: ["Tank", "Support"], roles: ["UTILITY"] },
  { id: "Ilsa", key: 9012, name: "Ilsa", title: "the Swift Ember", tags: ["Marksman"], roles: ["BOTTOM"] },
];

export interface SyntheticItem {
  id: number;
  name: string;
  gold: number;
}

export const SYNTHETIC_ITEMS: readonly SyntheticItem[] = [
  { id: 9101, name: "Synthetic Focus Tome", gold: 1200 },
  { id: 9102, name: "Synthetic Edge", gold: 1300 },
  { id: 9103, name: "Synthetic Bulwark", gold: 1100 },
  { id: 9104, name: "Synthetic Longbow", gold: 1250 },
  { id: 9105, name: "Synthetic Censer", gold: 900 },
  { id: 9106, name: "Synthetic Greaves", gold: 1000 },
];

/** Data Dragon-shaped champion.json for the fictional catalog. */
export function syntheticChampionJson() {
  return {
    type: "champion",
    format: "standAloneComplex",
    version: SYNTHETIC_KNOWLEDGE_VERSION,
    data: Object.fromEntries(
      SYNTHETIC_CHAMPIONS.map((c) => [
        c.id,
        { id: c.id, key: String(c.key), name: c.name, title: c.title, tags: c.tags },
      ]),
    ),
  };
}

/** Data Dragon-shaped item.json for the fictional catalog. */
export function syntheticItemJson() {
  return {
    type: "item",
    version: SYNTHETIC_KNOWLEDGE_VERSION,
    data: Object.fromEntries(
      SYNTHETIC_ITEMS.map((i) => [String(i.id), { name: i.name, gold: { total: i.gold } }]),
    ),
  };
}
