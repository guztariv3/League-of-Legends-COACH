/**
 * Fictional catalog for the synthetic environment. These are NOT real League
 * champions or items. The ids live in a 9000+ range so they can never collide
 * with, or be mistaken for, real Data Dragon data. The shape mirrors Data
 * Dragon's champion.json / item.json so the knowledge pipeline is exercised
 * end-to-end.
 */
export const SYNTHETIC_KNOWLEDGE_VERSION = "0.0.2-synthetic";

export type ChampionClass = "Mage" | "Assassin" | "Marksman" | "Tank" | "Fighter" | "Support";

export interface SyntheticChampion {
  id: string;
  key: number;
  name: string;
  title: string;
  tags: ChampionClass[];
  roles: ("TOP" | "JUNGLE" | "MIDDLE" | "BOTTOM" | "UTILITY")[];
  /** Fictional 0–10 ratings mirroring Data Dragon's `info` block. */
  info: { attack: number; defense: number; magic: number; difficulty: number };
}

export const SYNTHETIC_CHAMPIONS: readonly SyntheticChampion[] = [
  { id: "Aurelith", key: 9001, name: "Aurelith", title: "the Glass Tide", tags: ["Mage"], roles: ["MIDDLE"], info: { attack: 2, defense: 3, magic: 9, difficulty: 6 } },
  { id: "Korvane", key: 9002, name: "Korvane", title: "the Quiet Blade", tags: ["Assassin"], roles: ["MIDDLE", "JUNGLE"], info: { attack: 8, defense: 3, magic: 2, difficulty: 8 } },
  { id: "Brannoc", key: 9003, name: "Brannoc", title: "the Iron Hill", tags: ["Tank"], roles: ["TOP", "UTILITY"], info: { attack: 4, defense: 9, magic: 3, difficulty: 3 } },
  { id: "Sylvaine", key: 9004, name: "Sylvaine", title: "the Thorn Archer", tags: ["Marksman"], roles: ["BOTTOM"], info: { attack: 9, defense: 2, magic: 1, difficulty: 5 } },
  { id: "Myrr", key: 9005, name: "Myrr", title: "the Lantern Keeper", tags: ["Support", "Mage"], roles: ["UTILITY"], info: { attack: 2, defense: 4, magic: 8, difficulty: 4 } },
  { id: "Talgrim", key: 9006, name: "Talgrim", title: "the Ash Duelist", tags: ["Fighter"], roles: ["TOP", "JUNGLE"], info: { attack: 8, defense: 6, magic: 1, difficulty: 5 } },
  { id: "Oshra", key: 9007, name: "Oshra", title: "the Dune Hunter", tags: ["Fighter", "Assassin"], roles: ["JUNGLE"], info: { attack: 8, defense: 5, magic: 2, difficulty: 6 } },
  { id: "Veyl", key: 9008, name: "Veyl", title: "the Pale Star", tags: ["Mage", "Support"], roles: ["MIDDLE", "UTILITY"], info: { attack: 1, defense: 3, magic: 9, difficulty: 5 } },
  { id: "Dravok", key: 9009, name: "Dravok", title: "the Rust Warden", tags: ["Tank", "Fighter"], roles: ["TOP", "JUNGLE"], info: { attack: 6, defense: 8, magic: 3, difficulty: 4 } },
  { id: "Nimue", key: 9010, name: "Nimue", title: "the Tidecaller", tags: ["Marksman", "Mage"], roles: ["BOTTOM", "MIDDLE"], info: { attack: 6, defense: 2, magic: 6, difficulty: 6 } },
  { id: "Harrow", key: 9011, name: "Harrow", title: "the Grey Shield", tags: ["Tank", "Support"], roles: ["UTILITY"], info: { attack: 3, defense: 9, magic: 4, difficulty: 4 } },
  { id: "Ilsa", key: 9012, name: "Ilsa", title: "the Swift Ember", tags: ["Marksman"], roles: ["BOTTOM"], info: { attack: 9, defense: 2, magic: 2, difficulty: 6 } },
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
        { id: c.id, key: String(c.key), name: c.name, title: c.title, tags: c.tags, info: c.info },
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
