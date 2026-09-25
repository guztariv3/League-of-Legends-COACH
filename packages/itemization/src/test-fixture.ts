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
    "1001": item("Botas", 300, { tags: ["Boots"], into: ["3020", "3047", "3111", "3006"] }),
    "3020": item("Botas de hechicero", 1100, { tags: ["Boots", "MagicPenetration"], from: ["1001"] }),
    "3047": item("Grebas de acero", 1200, { tags: ["Boots", "Armor"], from: ["1001", "1029"], stats: { FlatArmorMod: 20 } }),
    "3111": item("Botas de mercurio", 1250, { tags: ["Boots", "SpellBlock", "Tenacity"], from: ["1001", "1033"], stats: { FlatSpellBlockMod: 25 } }),
    "3006": item("Grebas de berserker", 1100, { tags: ["Boots", "AttackSpeed"], from: ["1001", "1042"], stats: { PercentAttackSpeedMod: 0.35 } }),
    "1029": item("Armadura de tela", 300, { tags: ["Armor"], stats: { FlatArmorMod: 15 } }),
    "1033": item("Manto antimagia", 450, { tags: ["SpellBlock"], stats: { FlatSpellBlockMod: 25 } }),
    "1042": item("Daga", 250, { tags: ["AttackSpeed"], stats: { PercentAttackSpeedMod: 0.1 } }),
    "1052": item("Tomo amplificador", 400, { tags: ["SpellDamage"], stats: { FlatMagicDamageMod: 20 } }),
    "1026": item("Vara explosiva", 850, { tags: ["SpellDamage"], stats: { FlatMagicDamageMod: 45 } }),
    "1058": item("Vara innecesariamente grande", 1200, { tags: ["SpellDamage"], stats: { FlatMagicDamageMod: 60 } }),
    "1057": item("Capa de negatrón", 900, { tags: ["SpellBlock"], stats: { FlatSpellBlockMod: 50 } }),
    "1037": item("Pico", 875, { tags: ["Damage"], stats: { FlatPhysicalDamageMod: 25 } }),
    "1038": item("Espadón", 1300, { tags: ["Damage"], stats: { FlatPhysicalDamageMod: 40 } }),
    "1028": item("Cristal de rubí", 400, { tags: ["Health"], stats: { FlatHPPoolMod: 150 } }),
    "3916": item("Orbe del olvido", 800, { tags: ["SpellDamage"], stats: { FlatMagicDamageMod: 25 }, description: "Aplica <status>Heridas graves</status>." }),
    "6655": item("Tormento de Luden", 2750, { tags: ["SpellDamage", "MagicPenetration"], from: ["1052", "1026", "1052"], stats: { FlatMagicDamageMod: 90 } }),
    "3089": item("Sombrero mortal de Rabadon", 3600, { tags: ["SpellDamage"], from: ["1058", "1026", "1058"], stats: { FlatMagicDamageMod: 130 } }),
    "3165": item("Morellonomicon", 2950, { tags: ["SpellDamage", "Health"], from: ["3916", "1026"], stats: { FlatMagicDamageMod: 75, FlatHPPoolMod: 350 }, description: "Aplica <status>Heridas graves</status>." }),
    "3102": item("Velo de la banshee", 3000, { tags: ["SpellDamage", "SpellBlock"], from: ["1026", "1057"], stats: { FlatMagicDamageMod: 105, FlatSpellBlockMod: 40 } }),
    "3157": item("Reloj de arena de Zhonya", 3250, { tags: ["SpellDamage", "Armor"], from: ["1026", "1029", "1058"], stats: { FlatMagicDamageMod: 105, FlatArmorMod: 50 }, maps: { "11": true } }),
    "3135": item("Bastón del vacío", 3000, { tags: ["SpellDamage", "MagicPenetration"], from: ["1026", "1052"], stats: { FlatMagicDamageMod: 95 } }),
    "3031": item("Filo del infinito", 3450, { tags: ["Damage", "CriticalStrike"], from: ["1038", "1037"], stats: { FlatPhysicalDamageMod: 65, FlatCritChanceMod: 0.25 } }),
    "3033": item("Recordatorio mortal", 3000, { tags: ["Damage", "CriticalStrike", "ArmorPenetration"], from: ["1037", "1038"], stats: { FlatPhysicalDamageMod: 35, FlatCritChanceMod: 0.25 }, description: "Aplica <status>Heridas graves</status>." }),
    "3072": item("Sanguinaria", 3400, { tags: ["Damage", "LifeSteal"], from: ["1038", "1037"], stats: { FlatPhysicalDamageMod: 80, PercentLifeStealMod: 0.15 } }),
    "3065": item("Semblante espiritual", 2900, { tags: ["Health", "SpellBlock"], from: ["1057", "1028"], stats: { FlatHPPoolMod: 450, FlatSpellBlockMod: 60 } }),
    "3075": item("Malla de espinas", 2450, { tags: ["Health", "Armor"], from: ["1029", "1028"], stats: { FlatHPPoolMod: 150, FlatArmorMod: 75 }, description: "Aplica <status>Heridas graves</status>." }),
    "7001": item("Mejora de Ornn", 4000, { tags: ["SpellDamage"], stats: { FlatMagicDamageMod: 200 }, requiredAlly: "Ornn", inStore: false }),
    "2003": item("Poción de vida", 50, { tags: ["Consumable"], consumed: true }),
  },
};
const champ = (id: string, tags: string[], attack: number, magic: number, defense: number) => ({ id, name: id, tags, info: { attack, magic, defense } });
export const championJson = {
  version: "test",
  data: Object.fromEntries([
    champ("Ahri", ["Mage", "Assassin"], 3, 8, 4), champ("Lux", ["Mage", "Support"], 2, 9, 4),
    champ("Zed", ["Assassin"], 9, 1, 2), champ("Jinx", ["Marksman"], 9, 2, 2), champ("Garen", ["Fighter", "Tank"], 7, 1, 7),
    champ("Malphite", ["Tank", "Fighter"], 5, 7, 9), champ("Aatrox", ["Fighter", "Tank"], 8, 3, 4),
    champ("Syndra", ["Mage"], 2, 9, 3), champ("Brand", ["Mage"], 2, 9, 2), champ("Draven", ["Marksman"], 9, 1, 3),
  ].map((c) => [c.id, c])),
};
