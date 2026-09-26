// Reduces the downloaded game data to the fields the recommendation engine reads, so the test
// fixtures stay small. Shared by snapshot-game-data.mjs; values are never changed, only dropped.

export const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o?.[k] !== undefined).map((k) => [k, o[k]]));

const zero = (v) => v && typeof v === "object" && !Array.isArray(v) && Object.values(v).every((x) => x === 0 || x === null);
/** Drops stat entries whose every field is 0 (Meraki lists all ~25 stats on every item). */
const nonZero = (stats) => Object.fromEntries(Object.entries(stats ?? {}).filter(([, v]) => !zero(v)));

export function compactDdragonChampions(full) {
  return {
    type: full.type, format: full.format, version: full.version,
    data: Object.fromEntries(Object.entries(full.data).map(([id, c]) => [id, {
      ...pick(c, ["id", "key", "name", "title", "tags", "partype", "info", "stats"]),
      passive: pick(c.passive, ["name", "description"]),
      spells: c.spells.map((s) => pick(s, ["id", "name", "description", "maxrank", "cooldown", "cost", "costType", "range", "resource"])),
    }])),
  };
}

export function compactMerakiChampions(champions) {
  return Object.fromEntries(Object.entries(champions).map(([k, c]) => [k, {
    ...pick(c, ["id", "key", "name", "title", "resource", "attackType", "adaptiveType", "stats", "positions", "roles", "attributeRatings", "patchLastChanged"]),
    abilities: Object.fromEntries(Object.entries(c.abilities ?? {}).map(([slot, list]) => [slot, list.map((a) => pick(a, [
      "name", "effects", "cost", "cooldown", "targeting", "affects", "spellshieldable", "resource", "damageType", "spellEffects", "projectile", "blurb", "rechargeRate", "targetRange",
    ]))])),
  }]));
}

export function compactMerakiItems(items) {
  return Object.fromEntries(Object.entries(items).map(([k, i]) => [k, {
    ...pick(i, ["name", "id", "tier", "rank", "buildsFrom", "buildsInto", "specialRecipe", "noEffects", "removed", "requiredChampion", "requiredAlly", "simpleDescription"]),
    passives: (i.passives ?? []).map((p) => ({ ...pick(p, ["unique", "name", "effects", "range", "cooldown"]), stats: nonZero(p.stats) })),
    active: (i.active ?? []).map((a) => pick(a, ["unique", "name", "effects", "range", "cooldown"])),
    stats: nonZero(i.stats),
    shop: i.shop,
  }]));
}

export function compactDdragonItems(items) {
  return {
    type: items.type, version: items.version,
    data: Object.fromEntries(Object.entries(items.data).map(([id, i]) => [id, pick(i, [
      "name", "plaintext", "from", "into", "gold", "tags", "maps", "stats", "inStore", "requiredChampion", "requiredAlly", "consumed", "depth",
    ])])),
  };
}

export function compactPerks(perks) {
  return perks.map((p) => pick(p, ["id", "name", "shortDesc", "longDesc", "recommendationDescriptor", "iconPath"]));
}

export function compactPerkStyles(styles) {
  return {
    styles: styles.styles.map((s) => ({
      ...pick(s, ["id", "name", "tooltip", "iconPath", "isAdvanced", "allowedSubStyles", "defaultSubStyle"]),
      slots: s.slots.map((slot) => pick(slot, ["type", "slotLabel", "perks"])),
    })),
  };
}
