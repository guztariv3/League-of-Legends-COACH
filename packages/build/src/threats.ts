import type { ChampionKit, ItemFacts } from "@coach/knowledge";
import { championProfile, type ChampionProfile } from "./profile.js";

/**
 * What the enemy team brings, read from each enemy's kit before the game and refined with
 * their items and scores once it starts. Each threat keeps the champions (and the reason)
 * behind it, so a counter item can say who it answers.
 */
export type ThreatKind = "crit" | "healing" | "shields" | "cc" | "tanks" | "attackSpeed" | "burst";

export interface Threat {
  kind: ThreatKind;
  /** 0–1: how much of this the team brings (several sources add up, one strong source counts). */
  weight: number;
  sources: { name: string; why: string }[];
}

export interface EnemyInput {
  kit: ChampionKit;
  /** Their current items (in game); empty before the game. */
  items?: ItemFacts[];
  kills?: number;
  deaths?: number;
  /** Your lane opponent weighs more for the early items. */
  laneOpponent?: boolean;
}

export interface EnemyPicture {
  /** Share of the team's damage by type (0–1). */
  damage: { physical: number; magic: number; true: number };
  threats: Record<ThreatKind, Threat>;
  profiles: ChampionProfile[];
  laneOpponent: string | null;
}

const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));

const HARD_CC = /\b(stun(?:s|ned)?|root(?:s|ed)?|knock(?:s|ed)? (?:up|back|aside|airborne)|airborne|charm(?:s|ed)?|fear(?:s|ed)?|flee|taunt(?:s|ed)?|suppress(?:es|ed)?|sleep|drowsy|polymorph(?:s|ed)?|snare(?:s|d)?|pull(?:s|ed)?|ground(?:s|ed)?)\b/i;
const HEALS = /\b(heals?|healing|restores? .{0,20}health|life steal|lifesteal|omnivamp|drains?)\b/i;
const SHIELDS = /\b(shield(?:s|ed)? (?:himself|herself|itself|themselves|an ally|allies|nearby allies)|grants? (?:a |him |her |them )?shield|gains? a shield|shield strength)\b/i;

/** Ability slots (P, Q, W, E, R) whose text or values match. */
function slots(kit: ChampionKit, test: RegExp): string[] {
  const hit = new Set<string>();
  for (const a of kit.abilities) if (test.test(a.text) || a.values.some((v) => test.test(v))) hit.add(a.slot);
  return [...hit];
}

const stat = (items: ItemFacts[], k: keyof ItemFacts["stats"], part: "flat" | "percent" = "flat") =>
  items.reduce((s, i) => s + (i.stats[k]?.[part] ?? 0), 0);
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

export function enemyPicture(enemies: EnemyInput[]): EnemyPicture {
  const kinds: ThreatKind[] = ["crit", "healing", "shields", "cc", "tanks", "attackSpeed", "burst"];
  const acc = Object.fromEntries(kinds.map((k) => [k, { none: 1, sources: [] as { name: string; why: string; x: number }[] }])) as Record<ThreatKind, { none: number; sources: { name: string; why: string; x: number }[] }>;
  // One source counts for at most 0.7, so a threat reaches its full weight only with several sources.
  const add = (kind: ThreatKind, name: string, x: number, why: string, w: number) => {
    const v = clamp(x * w, 0, 0.7);
    if (v < 0.05) return;
    acc[kind].none *= 1 - v;
    acc[kind].sources.push({ name, why, x: v });
  };

  let phys = 0, magic = 0, tru = 0, total = 0;
  const profiles: ChampionProfile[] = [];
  let laneOpponent: string | null = null;
  for (const e of enemies) {
    const p = championProfile(e.kit);
    profiles.push(p);
    const items = e.items ?? [];
    if (e.laneOpponent) laneOpponent = p.name;
    // How strong this enemy is right now (1 before the game) and how much it matters to you.
    const form = clamp(1 + 0.15 * ((e.kills ?? 0) - (e.deaths ?? 0)) + items.reduce((s, i) => s + i.gold, 0) / 20000, 0.5, 1.8);
    const w = form * (e.laneOpponent ? 1.3 : 1);
    const dmgWeight = w * (0.4 + p.offense);
    phys += dmgWeight * p.damage.physical;
    magic += dmgWeight * p.damage.magic;
    tru += dmgWeight * p.damage.true;
    total += dmgWeight;

    // Critical strikes: kits that scale with crit, confirmed by crit items in game.
    const critItems = stat(items, "criticalStrikeChance", "percent");
    const critKit = clamp((p.scales.crit - 0.3) / 0.5);
    const crit = Math.max(critKit, clamp(critItems / 40));
    add("crit", p.name, crit, critItems > 0
      ? `${critItems}% critical strike chance from items`
      : p.scales.crit >= 0.6 && p.attackReliance < 0.6 ? "abilities scale with critical strike chance" : "relies on basic attacks, which can critically strike", w);

    const heal = slots(e.kit, HEALS);
    const healItems = stat(items, "lifesteal", "percent") + stat(items, "omnivamp", "percent");
    add("healing", p.name, Math.max(heal.length * 0.22, clamp(healItems / 15)), healItems > 0
      ? `${healItems}% life steal and omnivamp from items`
      : `${list(heal)} ${heal.length > 1 ? "heal" : "heals"}`, w);

    const shield = slots(e.kit, SHIELDS);
    add("shields", p.name, shield.length * 0.3, `${list(shield)} ${shield.length > 1 ? "shield" : "shields"}`, w);

    const cc = slots(e.kit, HARD_CC);
    add("cc", p.name, cc.length * 0.25, `crowd control on ${list(cc)}`, w);

    const resists = stat(items, "armor") + stat(items, "magicResistance");
    const health = stat(items, "health");
    // Built to take hits: the Wiki's top toughness rating, or armor, magic resist and health from items.
    const tankKit = clamp((p.frontline - 0.5) / 0.5);
    const tank = Math.max(tankKit, clamp(resists / 150 + health / 2000));
    add("tanks", p.name, tank, resists + health > 0 && tank > tankKit
      ? `${resists} armor and magic resist and ${health} health from items`
      : "built to take hits (Wiki toughness rating)", w);

    add("attackSpeed", p.name, clamp((p.attackReliance - 0.4) / 0.5), "relies on basic attacks", w);

    const burst = p.offense * (1 - p.frontline) * (0.4 + p.abilityReliance * 0.6);
    add("burst", p.name, clamp((burst - 0.35) / 0.5), "deals its damage in short bursts (high damage, low toughness)", w);
  }

  const threats = Object.fromEntries(kinds.map((k) => [k, {
    kind: k,
    weight: 1 - acc[k].none,
    sources: acc[k].sources.sort((a, b) => b.x - a.x).map(({ name, why }) => ({ name, why })),
  }])) as Record<ThreatKind, Threat>;
  const t = total || 1;
  return { damage: { physical: phys / t, magic: magic / t, true: tru / t }, threats, profiles, laneOpponent };
}
