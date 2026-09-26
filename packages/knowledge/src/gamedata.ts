/**
 * Game facts the recommendation engine reasons with: items (stats and what their passives and
 * actives do), champion kits (resource, per-rank costs and cooldowns, damage types), runes with
 * stat shards, and summoner spells.
 *
 * Sources, merged by id and never invented:
 * - Riot Data Dragon (official, current patch): the item list, prices, maps and stat lines; the
 *   champion list, resource and spell costs; runes; summoner spells.
 * - Meraki Analytics lolstaticdata (League of Legends Wiki, CC BY-SA 3.0): item passive and active
 *   texts with their numbers (Data Dragon leaves many numbers blank) and champion ability details.
 * - CommunityDragon: rune texts and the stat shard rows (perks.json, perkstyles.json).
 *
 * Meraki can lag a patch behind. An item or champion that only Data Dragon has is still listed,
 * with `detail: "ddragon"` so callers know its texts may miss numbers.
 */

export const GAME_DATA_ATTRIBUTION = {
  text: "Game data: Riot Data Dragon; item and ability details from the League of Legends Wiki (CC BY-SA 3.0) via Meraki Analytics; rune details from CommunityDragon.",
  license: "https://creativecommons.org/licenses/by-sa/3.0/",
};

type Json = Record<string, unknown>;
const obj = (x: unknown): Json | null => (x && typeof x === "object" && !Array.isArray(x) ? (x as Json) : null);
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const str = (x: unknown): string | null => (typeof x === "string" && x.trim() ? x.trim() : null);
const num = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);
const nums = (x: unknown): number[] | null => {
  const a = arr(x).map(num);
  return a.length && a.every((v) => v !== null) ? (a as number[]) : null;
};

// ---------------------------------------------------------------------------------------------
// Text

/** Plain text from Data Dragon / CommunityDragon HTML-like markup. */
export function htmlText(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Positional and named ("key=value") arguments of a wiki template call. */
function templateArgs(args: string[]): { p: string[]; named: Record<string, string> } {
  const p: string[] = [];
  const named: Record<string, string> = {};
  for (const a of args) {
    const m = /^\s*([a-z0-9_]+)\s*=(.*)$/is.exec(a);
    if (m) named[m[1]!.toLowerCase()] = m[2]!.trim();
    else p.push(a.trim());
  }
  return { p, named };
}

/** Arithmetic in wiki values ("150*0.8", "(75*0.2)+75", "150 + (200-150)/10*(x-1)"); null if not plain arithmetic. */
export function arithmetic(expr: string, x?: number): number | null {
  const tokens = expr.replace(/\s+/g, "").match(/\d+(?:\.\d+)?|[x+\-*/()]/g);
  if (!tokens || tokens.join("") !== expr.replace(/\s+/g, "")) return null;
  let i = 0;
  const peek = () => tokens[i];
  const primary = (): number => {
    const t = tokens[i++];
    if (t === "(") { const v = sum(); if (tokens[i++] !== ")") throw new Error("paren"); return v; }
    if (t === "-") return -primary();
    if (t === "x") { if (x === undefined) throw new Error("x"); return x; }
    if (t !== undefined && /^\d/.test(t)) return Number(t);
    throw new Error("token");
  };
  const product = (): number => {
    let v = primary();
    while (peek() === "*" || peek() === "/") v = tokens[i++] === "*" ? v * primary() : v / primary();
    return v;
  };
  const sum = (): number => {
    let v = product();
    while (peek() === "+" || peek() === "-") v = tokens[i++] === "+" ? v + product() : v - product();
    return v;
  };
  try {
    const v = sum();
    return i === tokens.length && Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
  } catch {
    return null;
  }
}

/**
 * Wiki value lists as a reader sees them: "0 to 30 for 11" → "0–30"; "150*0.8" → "120";
 * "150 + (200-150)/10*(x-1) for 13" (a formula over levels) → "150+ (based on level)"; "14;11;8" → "14 / 11 / 8".
 */
function values(v: string | undefined): string {
  return (v ?? "").split(";").map((part) => {
    const t = part.trim();
    const range = /^(.+?)\s+to\s+(.+?)(?:\s+(?:for|by)\s+[\d.]+)?$/i.exec(t);
    if (range) {
      const [a, b] = [arithmetic(range[1]!), arithmetic(range[2]!)];
      if (a !== null && b !== null) return a === b ? `${a}` : `${a}–${b}`;
    }
    // A formula in x over N steps: its end depends on the Wiki's step domain, so only the start is certain.
    const steps = /^(.+?)\s+for\s+\d+$/i.exec(t);
    if (steps) {
      const a = arithmetic(steps[1]!, 1);
      if (a !== null) return `${a}+ (based on level)`;
    }
    const n = arithmetic(t);
    return n !== null ? `${n}` : t;
  }).join(" / ");
}

/** One wiki template ({{name|args}}), rendered as the text a reader would see. */
function template(body: string): string {
  const [rawName, ...rest] = body.split("|");
  const name = (rawName ?? "").trim().toLowerCase();
  const { p, named } = templateArgs(rest);
  const key = named["key"] ?? named["key1"] ?? "";
  switch (name) {
    case "rd": // melee | ranged values
      return p.length >= 2 && p[0] !== p[1] ? `${values(p[0])}${key} (melee) / ${values(p[1])}${key} (ranged)` : `${values(p[0])}${key}`;
    case "pp": { // values that grow with level (or with named "type")
      const type = named["type"] ? wikiText(named["type"]) : "level";
      return `${values(p[0])}${key} (based on ${type})`;
    }
    case "g":
      return `${p[0] ?? ""} gold`;
    case "ap": // a value or a list of values, often as arithmetic
    case "fd":
      return values(p[0]);
    case "ft": // short text | full text
    case "tt": // text | hover text
    case "as": // amount | stat (the stat only colours it)
      return p[0] ?? "";
    default: // tip, ii, sti, stil, si, bi, ui, ci, ai, ais…: link | shown text (icon-only links show nothing)
      return named["icononly"] === "true" ? "" : (p[1] ?? p[0] ?? "");
  }
}

/** Plain text from League of Legends Wiki markup ({{templates}}, [[links]], '''bold'''). */
export function wikiText(s: string): string {
  let out = s;
  // Innermost templates first, until none is left (they nest: {{as|{{rd|…}}|health}}).
  for (let i = 0; i < 10 && /\{\{[^{}]*\}\}/.test(out); i++) out = out.replace(/\{\{([^{}]*)\}\}/g, (_, body: string, at: number, all: string) => {
    const text = template(body);
    // "equal to{{…}}": the template supplied the space the source leaves out.
    return /[a-z]/i.test(all[at - 1] ?? "") && /^[\w(]/.test(text) ? ` ${text}` : text;
  });
  return out
    .replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, "$2")
    .replace(/\[\[([^\]]*)\]\]/g, "$1")
    .replace(/'{2,}/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\s+([.,;:])/g, "$1")
    .replace(/,(?=[a-z])/gi, ", ")
    .trim();
}

// ---------------------------------------------------------------------------------------------
// Items

export type ItemStat =
  | "abilityHaste" | "abilityPower" | "adaptiveForce" | "armor" | "armorPenetration" | "attackDamage" | "attackSpeed"
  | "criticalStrikeChance" | "criticalStrikeDamage" | "goldPer10" | "healAndShieldPower" | "health" | "healthRegen"
  | "lethality" | "lifesteal" | "magicPenetration" | "magicResistance" | "mana" | "manaRegen" | "movespeed" | "omnivamp" | "tenacity";

/** A stat line: flat and/or percent, as the shop shows it ("40% Attack Speed" is percent 40). */
export interface StatValue { flat: number; percent: number }

/** Data Dragon's stat labels in item descriptions. Unknown labels are kept in `otherStats`. */
const STAT_LABELS: Record<string, ItemStat> = {
  "ability haste": "abilityHaste", "ability power": "abilityPower", "adaptive force": "adaptiveForce", "armor": "armor",
  "armor penetration": "armorPenetration", "attack damage": "attackDamage", "attack speed": "attackSpeed",
  "critical strike chance": "criticalStrikeChance", "critical strike damage": "criticalStrikeDamage",
  "gold per 10 seconds": "goldPer10", "heal and shield power": "healAndShieldPower", "health": "health",
  "base health regen": "healthRegen", "health regen per 5 seconds": "healthRegen", "lethality": "lethality",
  "life steal": "lifesteal", "lifesteal": "lifesteal", "magic penetration": "magicPenetration", "magic resist": "magicResistance",
  "mana": "mana", "base mana regen": "manaRegen", "mana regen per 5 seconds": "manaRegen", "move speed": "movespeed",
  "omnivamp": "omnivamp", "tenacity": "tenacity",
};

export type ItemRank = "STARTER" | "BASIC" | "EPIC" | "LEGENDARY" | "BOOTS" | "CONSUMABLE" | "TRINKET" | "DISTRIBUTED" | "OTHER";

export interface ItemEffect {
  kind: "passive" | "active";
  name: string | null;
  text: string;
  unique: boolean;
  /** Cooldown in seconds when the source gives a plain number. */
  cooldown: number | null;
}

export interface ItemFacts {
  id: number;
  name: string;
  /** Total price in gold (Data Dragon). */
  gold: number;
  /** Sold in the shop on Summoner's Rift. */
  purchasable: boolean;
  maps: number[];
  /** Shop tier as the Wiki classifies it; derived from the recipe when Meraki lacks the item. */
  rank: ItemRank[];
  from: number[];
  into: number[];
  stats: Partial<Record<ItemStat, StatValue>>;
  /** Stat lines whose label is not recognised (kept, never dropped silently). */
  otherStats: { label: string; value: number; percent: boolean }[];
  effects: ItemEffect[];
  /** Data Dragon's one-line summary. */
  summary: string | null;
  /** Data Dragon shop tags (e.g. "CriticalStrike", "Boots"). */
  tags: string[];
  requiredChampion: string | null;
  requiredAlly: string | null;
  /** "full": Data Dragon + Wiki details; "ddragon": only Data Dragon (texts may miss numbers). */
  detail: "full" | "ddragon";
}

/** Stat lines from the <stats> block of a Data Dragon item description. */
export function parseStatLines(description: string): { stats: ItemFacts["stats"]; other: ItemFacts["otherStats"] } {
  const stats: ItemFacts["stats"] = {};
  const other: ItemFacts["otherStats"] = [];
  const block = /<stats>([\s\S]*?)<\/stats>/i.exec(description)?.[1] ?? "";
  for (const line of block.split(/<br\s*\/?>/i)) {
    const m = /<attention>\s*([\d.]+)(%?)\s*<\/attention>\s*(.+)/i.exec(line);
    if (!m) continue;
    const value = Number(m[1]);
    const percent = m[2] === "%";
    const label = htmlText(m[3]!).trim();
    const key = STAT_LABELS[label.toLowerCase()];
    if (!key) { other.push({ label, value, percent }); continue; }
    const cur = stats[key] ?? { flat: 0, percent: 0 };
    stats[key] = percent ? { ...cur, percent: cur.percent + value } : { ...cur, flat: cur.flat + value };
  }
  return { stats, other };
}

/** Passives and actives from a Data Dragon description (used when the Wiki lacks the item). */
function ddragonEffects(description: string): ItemEffect[] {
  const main = description.replace(/<stats>[\s\S]*?<\/stats>/i, "").replace(/<\/?mainText>/gi, "");
  const parts = main.split(/(<(?:passive|active)>[\s\S]*?<\/(?:passive|active)>)/i);
  const effects: ItemEffect[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    const head = /<(passive|active)>([\s\S]*?)<\/(?:passive|active)>/i.exec(parts[i]!)!;
    // "{{ Item_Melee_Ranged_Split }}" and similar are filled in by the game client; they cannot be resolved here.
    const text = htmlText((parts[i + 1] ?? "").replace(/\{\{[^}]*\}\}/g, "")).replace(/^\(([^)]*)\)\s*/, "").replace(/ {2,}/g, " ").trim();
    if (!text) continue;
    effects.push({ kind: head[1]!.toLowerCase() as "passive" | "active", name: htmlText(head[2]!) || null, text, unique: false, cooldown: null });
  }
  return effects;
}

function merakiEffects(item: Json): ItemEffect[] {
  const read = (kind: ItemEffect["kind"]) => (e: unknown): ItemEffect | null => {
    const o = obj(e);
    const raw = o ? str(o["effects"]) : null;
    if (!o || !raw) return null;
    return { kind, name: str(o["name"]), text: wikiText(raw), unique: o["unique"] === true, cooldown: num(o["cooldown"]) };
  };
  return [...arr(item["passives"]).map(read("passive")), ...arr(item["active"]).map(read("active"))].filter((e): e is ItemEffect => e !== null);
}

const RANKS = new Set<ItemRank>(["STARTER", "BASIC", "EPIC", "LEGENDARY", "BOOTS", "CONSUMABLE", "TRINKET", "DISTRIBUTED"]);

/** Shop tier from the recipe, for items the Wiki does not list yet. */
function derivedRank(tags: string[], from: number[], into: number[], consumed: boolean): ItemRank[] {
  if (consumed) return ["CONSUMABLE"];
  if (tags.includes("Trinket")) return ["TRINKET"];
  if (tags.includes("Boots")) return ["BOOTS"];
  if (!from.length && !into.length) return tags.includes("Lane") || tags.includes("Jungle") ? ["STARTER"] : ["OTHER"];
  if (!from.length) return ["BASIC"];
  return into.length ? ["EPIC"] : ["LEGENDARY"];
}

const SUMMONERS_RIFT = 11;
/**
 * Data Dragon gives copies of items made for other modes (Arena, ARAM variants, event modes)
 * six-digit ids, sometimes still flagged for map 11; the regular shop uses ids below this.
 */
const MODE_COPY_ID = 100_000;

/**
 * Items of the current patch (Data Dragon), with the Wiki's effect texts where it has them.
 * Data Dragon repeats some items under a second id for other modes; for a name listed more than
 * once on the same map the lowest id is the shop's own.
 */
export function parseItems(ddragonItems: unknown, merakiItems: unknown): ItemFacts[] {
  const data = obj(obj(ddragonItems)?.["data"]) ?? {};
  const meraki = new Map<number, Json>();
  for (const m of Object.values(obj(merakiItems) ?? {})) {
    const o = obj(m);
    const id = o ? num(o["id"]) : null;
    if (o && id !== null && o["removed"] !== true) meraki.set(id, o);
  }

  const items: ItemFacts[] = [];
  for (const [idText, raw] of Object.entries(data)) {
    const d = obj(raw);
    const name = d ? str(d["name"]) : null;
    const id = Number(idText);
    if (!d || !name || !Number.isInteger(id)) continue;
    const gold = obj(d["gold"]);
    const maps = Object.entries(obj(d["maps"]) ?? {}).filter(([, on]) => on === true).map(([m]) => Number(m));
    const description = str(d["description"]) ?? "";
    const { stats, other } = parseStatLines(description);
    const from = arr(d["from"]).map(Number).filter(Number.isInteger);
    const into = arr(d["into"]).map(Number).filter(Number.isInteger);
    const tags = arr(d["tags"]).filter((t): t is string => typeof t === "string");
    const m = meraki.get(id);
    const rank = m ? arr(m["rank"]).filter((r): r is ItemRank => RANKS.has(r as ItemRank)) : [];
    items.push({
      id,
      name,
      gold: num(gold?.["total"]) ?? 0,
      purchasable: gold?.["purchasable"] === true && d["inStore"] !== false && maps.includes(SUMMONERS_RIFT) && id < MODE_COPY_ID,
      maps,
      rank: rank.length ? rank : derivedRank(tags, from, into, d["consumed"] === true),
      from,
      into,
      stats,
      otherStats: other,
      effects: m ? merakiEffects(m) : ddragonEffects(description),
      summary: str(d["plaintext"]),
      tags,
      requiredChampion: str(d["requiredChampion"]),
      requiredAlly: str(d["requiredAlly"]),
      detail: m ? "full" : "ddragon",
    });
  }

  // Same name twice on Summoner's Rift: keep the lowest id as the shop's item.
  const shopId = new Map<string, number>();
  for (const i of items) if (i.purchasable && (shopId.get(i.name) ?? Infinity) > i.id) shopId.set(i.name, i.id);
  return items
    .map((i) => (i.purchasable && shopId.get(i.name) !== i.id ? { ...i, purchasable: false } : i))
    .sort((a, b) => a.id - b.id);
}

// ---------------------------------------------------------------------------------------------
// Champions

export type Slot = "P" | "Q" | "W" | "E" | "R";
const SLOTS: Slot[] = ["P", "Q", "W", "E", "R"];

export type DamageType = "MAGIC" | "PHYSICAL" | "TRUE" | "MIXED" | "OTHER";

export interface AbilityFacts {
  slot: Slot;
  name: string;
  /** What casting it spends (e.g. MANA, ENERGY, HEALTH); null when it costs nothing. */
  resource: string | null;
  /** Flat cost per rank, when the cost is a plain number. */
  cost: number[] | null;
  /** Cooldown per rank in seconds. */
  cooldown: number[] | null;
  damageType: DamageType | null;
  targeting: string | null;
  /** Plain-text description of every effect. */
  text: string;
  /** What its values scale with (from the Wiki's per-rank values); empty when unknown. */
  scalings: Scaling[];
  /** Names of the Wiki's per-rank values ("Magic Damage", "Slow", "Heal", "Shield Strength"…). */
  values: string[];
}

export type Scaling =
  | "AP" | "AD" | "bonusAD" | "health" | "bonusHealth" | "armor" | "magicResist" | "mana" | "critChance" | "attackSpeed" | "lethality"
  | "targetMaxHealth" | "targetMissingHealth" | "targetCurrentHealth";

/** A Wiki value unit ("% bonus AD", "% of target's maximum health") as what it scales with. */
export function scalingOf(unit: string): Scaling | null {
  const u = unit.toLowerCase();
  if (/target|enemy/.test(u)) {
    if (/missing health/.test(u)) return "targetMissingHealth";
    if (/current health/.test(u)) return "targetCurrentHealth";
    if (/maximum health|max health|bonus health/.test(u)) return "targetMaxHealth";
    return null; // e.g. "% of target's armor"
  }
  if (/\bap\b/.test(u)) return "AP";
  if (/bonus ad\b/.test(u)) return "bonusAD";
  if (/\bad\b/.test(u)) return "AD";
  if (/critical strike/.test(u)) return "critChance";
  if (/attack speed/.test(u)) return "attackSpeed";
  if (/lethality/.test(u)) return "lethality";
  if (/bonus health/.test(u)) return "bonusHealth";
  if (/maximum health|max health/.test(u)) return "health";
  if (/armor/.test(u)) return "armor";
  if (/magic resist/.test(u)) return "magicResist";
  if (/mana/.test(u)) return "mana";
  return null;
}

function abilityValues(a: Json): { scalings: Scaling[]; values: string[] } {
  const scalings = new Set<Scaling>();
  const values = new Set<string>();
  for (const e of arr(a["effects"])) {
    // Some scalings are only written in the text: "(based on critical strike chance)".
    const text = str(obj(e)?.["description"]) ?? "";
    if (/based on (?:bonus )?critical strike chance/i.test(text)) scalings.add("critChance");
    if (/based on (?:bonus )?attack speed|per \d+% bonus attack speed/i.test(text)) scalings.add("attackSpeed");
    for (const lv of arr(obj(e)?.["leveling"])) {
      const attr = str(obj(lv)?.["attribute"]);
      if (attr) values.add(attr);
      for (const m of arr(obj(lv)?.["modifiers"])) {
        for (const u of arr(obj(m)?.["units"])) {
          const sc = typeof u === "string" ? scalingOf(u) : null;
          if (sc) scalings.add(sc);
        }
      }
    }
  }
  return { scalings: [...scalings], values: [...values] };
}

export interface ChampionStats {
  hp: number; hpPerLevel: number;
  mana: number; manaPerLevel: number; manaRegen: number; manaRegenPerLevel: number;
  armor: number; armorPerLevel: number; magicResist: number; magicResistPerLevel: number;
  attackDamage: number; attackDamagePerLevel: number; attackSpeed: number; attackSpeedPerLevel: number;
  attackRange: number; moveSpeed: number;
}

export interface ChampionKit {
  /** Data Dragon id ("MonkeyKing"). */
  id: string;
  /** Numeric key used by match and client data. */
  key: number;
  name: string;
  /** Resource bar, upper-case (MANA, ENERGY, NONE, FURY, …). */
  resource: string;
  attackType: "MELEE" | "RANGED";
  /** The damage type adaptive stats turn into (Wiki), when known. */
  adaptiveType: "PHYSICAL" | "MAGIC" | null;
  /** Data Dragon classes (Fighter, Mage, …). */
  tags: string[];
  /** Wiki subclasses (e.g. BURST, DIVER). */
  roles: string[];
  positions: string[];
  /** Wiki 1–3 ratings (damage, toughness, control, mobility, utility) and ability reliance 1–? */
  ratings: Record<string, number> | null;
  stats: ChampionStats;
  abilities: AbilityFacts[];
  detail: "full" | "ddragon";
}

const damageType = (x: unknown): DamageType | null => {
  const s = str(x)?.replace(/_DAMAGE$/, "");
  return s === "MAGIC" || s === "PHYSICAL" || s === "TRUE" || s === "MIXED" || s === "OTHER" ? s : null;
};

/** The per-rank numbers of a Wiki cost/cooldown when they are plain numbers (no "% of health"). */
function plainPerRank(x: unknown): number[] | null {
  const mods = arr(obj(x)?.["modifiers"]);
  if (mods.length !== 1) return null;
  const m = obj(mods[0]);
  const units = arr(m?.["units"]);
  return units.every((u) => u === "" || u === " seconds") ? nums(m?.["values"]) : null;
}

const upper = (s: string | null) => (s ? s.toUpperCase().replace(/\s+/g, "_") : null);

function ddragonStats(s: Json | null): ChampionStats {
  const n = (k: string) => num(s?.[k]) ?? 0;
  return {
    hp: n("hp"), hpPerLevel: n("hpperlevel"), mana: n("mp"), manaPerLevel: n("mpperlevel"),
    manaRegen: n("mpregen"), manaRegenPerLevel: n("mpregenperlevel"),
    armor: n("armor"), armorPerLevel: n("armorperlevel"), magicResist: n("spellblock"), magicResistPerLevel: n("spellblockperlevel"),
    attackDamage: n("attackdamage"), attackDamagePerLevel: n("attackdamageperlevel"),
    attackSpeed: n("attackspeed"), attackSpeedPerLevel: n("attackspeedperlevel"),
    attackRange: n("attackrange"), moveSpeed: n("movespeed"),
  };
}

function wikiAbilities(m: Json): AbilityFacts[] {
  const abilities = obj(m["abilities"]) ?? {};
  return SLOTS.flatMap((slot) => arr(abilities[slot]).map((raw): AbilityFacts | null => {
    const a = obj(raw);
    const name = a ? str(a["name"]) : null;
    if (!a || !name) return null;
    const resource = str(a["resource"]);
    const text = arr(a["effects"]).map((e) => str(obj(e)?.["description"])).filter((t): t is string => t !== null).map(wikiText).join("\n");
    return {
      slot, name, resource: resource === "NONE" ? null : resource,
      cost: plainPerRank(a["cost"]), cooldown: plainPerRank(a["cooldown"]),
      damageType: damageType(a["damageType"]), targeting: str(a["targeting"]), text,
      ...abilityValues(a),
    };
  }).filter((x): x is AbilityFacts => x !== null));
}

function ddragonAbilities(d: Json, resource: string): AbilityFacts[] {
  const passive = obj(d["passive"]);
  const spells = arr(d["spells"]).map(obj).filter((s): s is Json => s !== null);
  const costs = (s: Json) => {
    const c = nums(s["cost"]);
    return c && c.some((v) => v > 0) ? c : null;
  };
  return [
    ...(passive ? [{ slot: "P" as Slot, name: str(passive["name"]) ?? "Passive", resource: null, cost: null, cooldown: null, damageType: null, targeting: null, text: htmlText(str(passive["description"]) ?? ""), scalings: [], values: [] }] : []),
    ...spells.slice(0, 4).map((s, i): AbilityFacts => ({
      slot: SLOTS[i + 1]!, name: str(s["name"]) ?? SLOTS[i + 1]!,
      resource: costs(s) ? resource : null, cost: costs(s), cooldown: nums(s["cooldown"]),
      damageType: null, targeting: null, text: htmlText(str(s["description"]) ?? ""), scalings: [], values: [],
    })),
  ];
}

/** Champion kits of the current patch (Data Dragon), with the Wiki's ability details where it has them. */
export function parseChampionKits(ddragonChampionFull: unknown, merakiChampions: unknown): ChampionKit[] {
  const data = obj(obj(ddragonChampionFull)?.["data"]) ?? {};
  const wiki = obj(merakiChampions) ?? {};
  const kits: ChampionKit[] = [];
  for (const raw of Object.values(data)) {
    const d = obj(raw);
    const id = d ? str(d["id"]) : null;
    const name = d ? str(d["name"]) : null;
    if (!d || !id || !name) continue;
    const m = obj(wiki[id]);
    const stats = ddragonStats(obj(d["stats"]));
    const resource = (m && str(m["resource"])) ?? upper(str(d["partype"])) ?? "NONE";
    const ratings = obj(m?.["attributeRatings"]);
    const adaptive = str(m?.["adaptiveType"])?.replace(/_DAMAGE$/, "");
    const attack = str(m?.["attackType"]);
    kits.push({
      id, key: Number(d["key"]), name, resource,
      attackType: attack === "MELEE" || attack === "RANGED" ? attack : stats.attackRange >= 300 ? "RANGED" : "MELEE",
      adaptiveType: adaptive === "PHYSICAL" || adaptive === "MAGIC" ? adaptive : null,
      tags: arr(d["tags"]).filter((t): t is string => typeof t === "string"),
      roles: arr(m?.["roles"]).filter((t): t is string => typeof t === "string"),
      positions: arr(m?.["positions"]).filter((t): t is string => typeof t === "string"),
      ratings: ratings ? Object.fromEntries(Object.entries(ratings).filter(([, v]) => typeof v === "number")) as Record<string, number> : null,
      stats,
      abilities: m ? wikiAbilities(m) : ddragonAbilities(d, resource),
      detail: m ? "full" : "ddragon",
    });
  }
  return kits.sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------------------------
// Runes

export interface RuneFacts {
  id: number;
  name: string;
  treeId: number;
  tree: string;
  /** 0 = keystone row; 1–3 = the minor rows. */
  row: number;
  keystone: boolean;
  /** Plain-text summary and full description. */
  short: string;
  long: string;
}

export interface RuneTree {
  id: number;
  name: string;
  /** Rune ids per row; row 0 holds the keystones. */
  rows: number[][];
  /** Trees this one can be paired with as the secondary tree. */
  secondary: number[];
}

export interface StatShard { id: number; name: string; text: string }

export interface RuneData {
  trees: RuneTree[];
  runes: RuneFacts[];
  /** The three stat shard rows (offense, flex, defense), as ids. */
  shardRows: { label: string | null; shards: number[] }[];
  shards: StatShard[];
}

/** Placeholders the client fills at runtime (@f1@, @Damage@) cannot be resolved offline. */
const perkText = (s: string | null) => htmlText(s ?? "").replace(/@[^@\s]+@/g, "").replace(/ {2,}/g, " ").trim();

export function parseRunes(perks: unknown, perkStyles: unknown): RuneData {
  const byId = new Map<number, Json>();
  for (const p of arr(perks)) {
    const o = obj(p);
    const id = o ? num(o["id"]) : null;
    if (o && id !== null) byId.set(id, o);
  }
  const trees: RuneTree[] = [];
  const runes: RuneFacts[] = [];
  const shardRows: RuneData["shardRows"] = [];
  const shardIds = new Set<number>();
  for (const s of arr(obj(perkStyles)?.["styles"])) {
    const style = obj(s);
    const id = style ? num(style["id"]) : null;
    const name = style ? str(style["name"]) : null;
    if (!style || id === null || !name) continue;
    const slots = arr(style["slots"]).map(obj).filter((x): x is Json => x !== null);
    const rows: number[][] = [];
    for (const slot of slots) {
      const ids = arr(slot["perks"]).map(num).filter((x): x is number => x !== null);
      if (slot["type"] === "kStatMod") {
        // Every tree repeats the same shard rows; keep one copy.
        if (shardRows.length < slots.filter((x) => x["type"] === "kStatMod").length) shardRows.push({ label: str(slot["slotLabel"]), shards: ids });
        ids.forEach((i) => shardIds.add(i));
        continue;
      }
      const row = rows.length;
      rows.push(ids);
      for (const rid of ids) {
        const p = byId.get(rid);
        const rname = p ? str(p["name"]) : null;
        if (!p || !rname) continue;
        runes.push({ id: rid, name: rname, treeId: id, tree: name, row, keystone: slot["type"] === "kKeyStone", short: perkText(str(p["shortDesc"])), long: perkText(str(p["longDesc"])) });
      }
    }
    trees.push({ id, name, rows, secondary: arr(style["allowedSubStyles"]).map(num).filter((x): x is number => x !== null) });
  }
  const shards = [...shardIds].map((id): StatShard | null => {
    const p = byId.get(id);
    const name = p ? str(p["name"]) : null;
    return p && name ? { id, name, text: perkText(str(p["shortDesc"])) } : null;
  }).filter((x): x is StatShard => x !== null);
  return { trees, runes, shardRows, shards };
}

// ---------------------------------------------------------------------------------------------
// Summoner spells

export interface SummonerSpellFacts {
  /** Data Dragon id ("SummonerFlash"), also the image name. */
  id: string;
  /** Numeric key used by match data. */
  key: number;
  name: string;
  text: string;
  /** Cooldown in seconds. */
  cooldown: number | null;
  summonerLevel: number | null;
  modes: string[];
}

/** Summoner spells available in a game mode (Summoner's Rift is "CLASSIC"). */
export function parseSummonerSpells(ddragonSummoner: unknown, mode = "CLASSIC"): SummonerSpellFacts[] {
  return Object.values(obj(obj(ddragonSummoner)?.["data"]) ?? {}).map((raw): SummonerSpellFacts | null => {
    const s = obj(raw);
    const id = s ? str(s["id"]) : null;
    const name = s ? str(s["name"]) : null;
    if (!s || !id || !name) return null;
    return {
      id, key: Number(s["key"]), name, text: htmlText(str(s["description"]) ?? ""),
      cooldown: nums(s["cooldown"])?.[0] ?? null, summonerLevel: num(s["summonerLevel"]),
      modes: arr(s["modes"]).filter((m): m is string => typeof m === "string"),
    };
  }).filter((s): s is SummonerSpellFacts => s !== null && s.modes.includes(mode)).sort((a, b) => a.name.localeCompare(b.name));
}
