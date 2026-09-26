/**
 * A small catalog in Data Dragon's shape. Names, ids and recipes follow the real items;
 * stat values are approximate and only here to exercise the rules (not authoritative).
 * Used by the itemization tests and the desktop E2E only.
 */
const both = { "11": true, "12": true };
const item = (name: string, total: number, extra: Record<string, unknown> = {}) => ({ name, gold: { total, purchasable: true }, maps: both, ...extra });
export const itemJson = {
  version: "test",
  data: {
    "1001": item("Boots", 300, { tags: ["Boots"], into: ["3020", "3047", "3111", "3006"] }),
    "3020": item("Sorcerer's Shoes", 1100, { tags: ["Boots", "MagicPenetration"], from: ["1001"] }),
    "3047": item("Plated Steelcaps", 1200, { tags: ["Boots", "Armor"], from: ["1001", "1029"], stats: { FlatArmorMod: 20 } }),
    "3111": item("Mercury's Treads", 1250, { tags: ["Boots", "SpellBlock", "Tenacity"], from: ["1001", "1033"], stats: { FlatSpellBlockMod: 25 } }),
    "3006": item("Berserker's Greaves", 1100, { tags: ["Boots", "AttackSpeed"], from: ["1001", "1042"], stats: { PercentAttackSpeedMod: 0.35 } }),
    "1029": item("Cloth Armor", 300, { tags: ["Armor"], stats: { FlatArmorMod: 15 } }),
    "1033": item("Null-Magic Mantle", 450, { tags: ["SpellBlock"], stats: { FlatSpellBlockMod: 25 } }),
    "1042": item("Dagger", 250, { tags: ["AttackSpeed"], stats: { PercentAttackSpeedMod: 0.1 } }),
    "1052": item("Amplifying Tome", 400, { tags: ["SpellDamage"], stats: { FlatMagicDamageMod: 20 } }),
    "1026": item("Blasting Wand", 850, { tags: ["SpellDamage"], stats: { FlatMagicDamageMod: 45 } }),
    "1058": item("Needlessly Large Rod", 1200, { tags: ["SpellDamage"], stats: { FlatMagicDamageMod: 60 } }),
    "1057": item("Negatron Cloak", 900, { tags: ["SpellBlock"], stats: { FlatSpellBlockMod: 50 } }),
    "1037": item("Pickaxe", 875, { tags: ["Damage"], stats: { FlatPhysicalDamageMod: 25 } }),
    "1038": item("B. F. Sword", 1300, { tags: ["Damage"], stats: { FlatPhysicalDamageMod: 40 } }),
    "1028": item("Ruby Crystal", 400, { tags: ["Health"], stats: { FlatHPPoolMod: 150 } }),
    "3916": item("Oblivion Orb", 800, { tags: ["SpellDamage"], stats: { FlatMagicDamageMod: 25 }, description: "Applies <status>Grievous Wounds</status>." }),
    "6655": item("Luden's Companion", 2750, { tags: ["SpellDamage", "MagicPenetration"], from: ["1052", "1026", "1052"], stats: { FlatMagicDamageMod: 90 } }),
    "3089": item("Rabadon's Deathcap", 3600, { tags: ["SpellDamage"], from: ["1058", "1026", "1058"], stats: { FlatMagicDamageMod: 130 } }),
    "3165": item("Morellonomicon", 2950, { tags: ["SpellDamage", "Health"], from: ["3916", "1026"], stats: { FlatMagicDamageMod: 75, FlatHPPoolMod: 350 }, description: "Applies <status>Grievous Wounds</status>." }),
    "3102": item("Banshee's Veil", 3000, { tags: ["SpellDamage", "SpellBlock"], from: ["1026", "1057"], stats: { FlatMagicDamageMod: 105, FlatSpellBlockMod: 40 } }),
    "3157": item("Zhonya's Hourglass", 3250, { tags: ["SpellDamage", "Armor"], from: ["1026", "1029", "1058"], stats: { FlatMagicDamageMod: 105, FlatArmorMod: 50 }, maps: { "11": true } }),
    "3135": item("Void Staff", 3000, { tags: ["SpellDamage", "MagicPenetration"], from: ["1026", "1052"], stats: { FlatMagicDamageMod: 95 } }),
    "3031": item("Infinity Edge", 3450, { tags: ["Damage", "CriticalStrike"], from: ["1038", "1037"], stats: { FlatPhysicalDamageMod: 65, FlatCritChanceMod: 0.25 } }),
    "3033": item("Mortal Reminder", 3000, { tags: ["Damage", "CriticalStrike", "ArmorPenetration"], from: ["1037", "1038"], stats: { FlatPhysicalDamageMod: 35, FlatCritChanceMod: 0.25 }, description: "Applies <status>Grievous Wounds</status>." }),
    "3072": item("Bloodthirster", 3400, { tags: ["Damage", "LifeSteal"], from: ["1038", "1037"], stats: { FlatPhysicalDamageMod: 80, PercentLifeStealMod: 0.15 } }),
    "3065": item("Spirit Visage", 2900, { tags: ["Health", "SpellBlock"], from: ["1057", "1028"], stats: { FlatHPPoolMod: 450, FlatSpellBlockMod: 60 } }),
    "3075": item("Thornmail", 2450, { tags: ["Health", "Armor"], from: ["1029", "1028"], stats: { FlatHPPoolMod: 150, FlatArmorMod: 75 }, description: "Applies <status>Grievous Wounds</status>." }),
    "7001": item("Ornn Upgrade", 4000, { tags: ["SpellDamage"], stats: { FlatMagicDamageMod: 200 }, requiredAlly: "Ornn", inStore: false }),
    "2003": item("Health Potion", 50, { tags: ["Consumable"], consumed: true }),
    "1055": item("Doran's Blade", 450, { tags: ["Damage", "Health", "Lane"], stats: { FlatPhysicalDamageMod: 10, FlatHPPoolMod: 80 } }),
    "1056": item("Doran's Ring", 400, { tags: ["SpellDamage", "Mana", "Lane"], stats: { FlatMagicDamageMod: 18, FlatHPPoolMod: 90 } }),
    "1054": item("Doran's Shield", 450, { tags: ["Health", "Lane"], stats: { FlatHPPoolMod: 110 } }),
    "3865": item("World Atlas", 400, { tags: ["GoldPer", "Lane"] }),
    "1101": item("Scorchclaw Pup", 450, { tags: ["Jungle"] }),
    "1102": item("Gustwalker Hatchling", 450, { tags: ["Jungle"] }),
    "1103": item("Mosstomper Seedling", 450, { tags: ["Jungle"] }),
  },
};
// Attack ranges follow the real champions: melee 125–175, ranged 500–550.
const RANGE: Record<string, number> = { Ahri: 550, Lux: 550, Zed: 125, Jinx: 525, Garen: 175, Malphite: 125, Aatrox: 175, Syndra: 550, Brand: 550, Draven: 550 };
const champ = (id: string, tags: string[], attack: number, magic: number, defense: number) => ({ id, name: id, tags, info: { attack, magic, defense }, stats: { attackrange: RANGE[id] } });
export const championJson = {
  version: "test",
  data: Object.fromEntries([
    champ("Ahri", ["Mage", "Assassin"], 3, 8, 4), champ("Lux", ["Mage", "Support"], 2, 9, 4),
    champ("Zed", ["Assassin"], 9, 1, 2), champ("Jinx", ["Marksman"], 9, 2, 2), champ("Garen", ["Fighter", "Tank"], 7, 1, 7),
    champ("Malphite", ["Tank", "Fighter"], 5, 7, 9), champ("Aatrox", ["Fighter", "Tank"], 8, 3, 4),
    champ("Syndra", ["Mage"], 2, 9, 3), champ("Brand", ["Mage"], 2, 9, 2), champ("Draven", ["Marksman"], 9, 1, 3),
  ].map((c) => [c.id, c])),
};
