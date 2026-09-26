import type { ChampionKit, ItemFacts, ItemStat } from "@coach/knowledge";
import { COUNTERS, THREAT_ONLY, itemProfile, statGoldValues, type Counter, type ItemProfile, type StatKey } from "./capabilities.js";
import { championProfile, type ChampionProfile } from "./profile.js";
import { enemyPicture, type EnemyInput, type EnemyPicture, type Threat, type ThreatKind } from "./threats.js";

/**
 * The build as a decision: every item is scored by what the champion's kit needs and what the
 * enemy team brings, and every pick says why. Items that only counter a threat the enemy does not
 * have are ruled out, with the reason. No table of builds, no per-champion or per-item rules.
 */
export interface BuildInput {
  me: ChampionKit;
  enemies: EnemyInput[];
  items: ItemFacts[];
  /** Item ids already owned (in game); empty before the game. */
  owned?: number[];
  /** "TOP" | "JUNGLE" | "MIDDLE" | "BOTTOM" | "UTILITY" (client names), for the starting items. */
  position?: string | null;
  /** Also suggest the starting items (default: when nothing is owned yet). */
  starter?: boolean;
}

export interface ItemPick { id: number; name: string; gold: number; score: number; why: string[] }
export interface Situational extends ItemPick { when: string }

export interface BuildRecommendation {
  champion: string;
  /** Facts about the champion's own kit that drive the build. */
  kit: string[];
  enemyDamage: EnemyPicture["damage"];
  /** Threats the enemy team brings (weight ≥ 0.2), strongest first. */
  threats: Threat[];
  starter: { items: { id: number; name: string; gold: number }[]; why: string[] } | null;
  first: ItemPick | null;
  next: ItemPick[];
  boots: ItemPick | null;
  situational: Situational[];
  ruledOut: { id: number; name: string; why: string }[];
}

/** Every player starts a Summoner's Rift game with 500 gold. */
export const STARTING_GOLD = 500;
const RELEVANT = 0.2;

const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
const pct = (x: number) => `${Math.round(x * 100)}%`;
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

const NO_THREAT: Record<ThreatKind, string> = {
  crit: "no enemy relies on critical strikes",
  healing: "no enemy heals much",
  shields: "the enemies shield little",
  cc: "the enemies have little crowd control",
  tanks: "no enemy is built to take hits",
  attackSpeed: "no enemy relies on basic attacks",
  burst: "no enemy deals burst damage",
};

const STAT_NAMES: Partial<Record<ItemStat, string>> = {
  abilityPower: "ability power", attackDamage: "attack damage", attackSpeed: "attack speed", criticalStrikeChance: "critical strike chance",
  criticalStrikeDamage: "critical strike damage", lethality: "lethality", armorPenetration: "armor penetration", magicPenetration: "magic penetration",
  abilityHaste: "ability haste", mana: "mana", manaRegen: "mana regeneration", health: "health", armor: "armor", magicResistance: "magic resist",
  healthRegen: "health regeneration", lifesteal: "life steal", omnivamp: "omnivamp", movespeed: "move speed", tenacity: "tenacity",
  healAndShieldPower: "heal and shield power", adaptiveForce: "adaptive force",
};

interface State { threats: Record<ThreatKind, number>; manaNeed: number; effects: Set<string> }

/** How much this champion, in this game, values each stat (0 = not at all). */
function statWeights(p: ChampionProfile, e: EnemyPicture, s: State): Record<ItemStat, number> {
  const AD = p.scales.AD * p.offense, AP = p.scales.AP * p.offense;
  const defense = p.frontline * 0.9 + 0.1;
  const tanks = s.threats.tanks;
  return {
    abilityPower: AP,
    attackDamage: AD,
    adaptiveForce: Math.max(AD, AP),
    attackSpeed: p.scales.attackSpeed * p.offense * 0.9,
    criticalStrikeChance: p.scales.crit * p.offense,
    criticalStrikeDamage: p.scales.crit * p.offense,
    lethality: AD * p.abilityReliance * (1 - tanks * 0.5),
    armorPenetration: AD * (0.3 + tanks),
    magicPenetration: AP * (0.4 + tanks * 0.8),
    abilityHaste: 0.25 + 0.5 * p.abilityReliance,
    mana: s.manaNeed,
    manaRegen: s.manaNeed * 0.6,
    health: defense + p.scales.health * 0.8,
    armor: defense * e.damage.physical * 2 + p.scales.resists * 0.5,
    magicResistance: defense * e.damage.magic * 2 + p.scales.resists * 0.5,
    healthRegen: defense * 0.3,
    lifesteal: p.attackReliance * AD * 0.7,
    omnivamp: 0.4 * Math.max(AD, AP),
    movespeed: 0.25,
    tenacity: s.threats.cc * 0.8,
    healAndShieldPower: p.healsOrShields,
    goldPer10: 0,
  };
}

interface Scored {
  ip: ItemProfile; score: number; why: string[]; counterValue: number; statValue: number;
  /** 0–1: the share of the item's stats (in gold) this champion makes use of. */
  fit: number;
}

function score(ip: ItemProfile, p: ChampionProfile, e: EnemyPicture, s: State): Scored {
  const w = statWeights(p, e, s);
  const cost = Math.max(ip.item.gold, 1);
  const lines = ip.stats.map((l) => ({ ...l, stat: l.key.split(":")[0] as ItemStat, value: l.gold * (w[l.key.split(":")[0] as ItemStat] ?? 0) }));
  const statValue = lines.reduce((sum, l) => sum + l.value, 0) / cost;
  const rawGold = lines.reduce((sum, l) => sum + l.gold, 0);
  const fit = rawGold > 0 ? lines.reduce((sum, l) => sum + l.gold * Math.min(1, w[l.stat] ?? 0), 0) / rawGold : 0;
  let counterValue = 0;
  const why: string[] = [];

  // The stats that matter most to this champion, with the kit facts behind them.
  const top = [...lines].sort((a, b) => b.value - a.value).filter((l) => l.value / cost >= 0.08).slice(0, 3);
  if (top.length) {
    const parts = top.map((l) => `${l.amount}${l.key.endsWith(":percent") ? "%" : ""} ${STAT_NAMES[l.stat] ?? l.stat}`);
    const facts = p.facts.filter((f) => top.some((l) => {
      const n = STAT_NAMES[l.stat] ?? "";
      return (n && f.includes(n)) || (l.stat === "attackSpeed" && f.includes("basic attacks")) || (l.stat === "criticalStrikeChance" && /critical strike|basic attacks/.test(f)) || (l.stat === "mana" && f.includes("mana"));
    }));
    // At most two kit facts, without the rating details (those are in the champion's own summary).
    const brief = facts.slice(0, 2).map((f) => f.replace(/ \(ability reliance \d+\/100 on the Wiki\)/, ""));
    why.push(`Gives ${list(parts)}${brief.length ? `: ${brief.join("; ")}.` : "."}`);
  }
  let bonus = 0;
  if ((ip.mana > 0 || ip.manaSustain) && s.manaNeed >= 0.2 && p.mana) {
    // Mana from stats is already in the stat value; restoring mana through a passive is valued here.
    if (ip.manaSustain) bonus += s.manaNeed * 0.35;
    why.push(`${ip.mana > 0 ? `Its ${ip.mana} mana` : "It restores mana, which"} ${ip.mana > 0 && ip.manaSustain ? "and mana restoration cover" : "covers"} ${p.name}'s mana use: one rotation of the basic abilities costs ${p.mana.rotation} of a ${p.mana.pool}-mana pool at level 1.`);
  }
  if (ip.critAmplify && p.scales.crit >= 0.4) {
    bonus += p.scales.crit * p.offense * 0.5;
    why.push(`It increases critical strike damage, which multiplies ${p.name}'s critical strikes.`);
  }
  const armor = lines.find((l) => l.stat === "armor"), mr = lines.find((l) => l.stat === "magicResistance");
  if (armor && e.damage.physical >= 0.55) why.push(`${pct(e.damage.physical)} of the enemy damage is physical.`);
  if (mr && e.damage.magic >= 0.55) why.push(`${pct(e.damage.magic)} of the enemy damage is magic.`);

  for (const c of ip.counters) {
    const answered = COUNTERS[c].answers.map((k) => ({ k, w: s.threats[k] })).sort((a, b) => b.w - a.w)[0]!;
    // A shield against magic damage only answers the magic part of the enemy's burst.
    const share = c === "magicShield" ? clamp(e.damage.magic * 1.5) : 1;
    if (answered.w * share < RELEVANT) continue;
    counterValue += answered.w * share * 0.4;
    const threat = e.threats[answered.k];
    const who = threat.sources.slice(0, 3).map((x) => `${x.name}${x.name === e.laneOpponent ? " (your lane opponent)" : ""}: ${x.why}`);
    why.push(`It ${COUNTERS[c].says}: ${who.join("; ")}.`);
  }
  return { ip, score: statValue + counterValue + bonus, why, counterValue, statValue, fit };
}

/**
 * Items whose only purpose is to counter something this enemy team does not bring. Judged on the
 * enemy team itself (not on what your other items already cover), so the reason is always true.
 */
function counterWithoutThreat(ip: ItemProfile, e: EnemyPicture): Counter | null {
  if (!ip.counters.length || !ip.counters.every((c) => THREAT_ONLY.includes(c))) return null;
  const relevant = ip.counters.some((c) => COUNTERS[c].answers.some((k) => e.threats[k].weight * (c === "magicShield" ? clamp(e.damage.magic * 1.5) : 1) >= RELEVANT));
  return relevant ? null : ip.counters[0]!;
}

const pick = (x: Scored): ItemPick => ({ id: x.ip.item.id, name: x.ip.item.name, gold: x.ip.item.gold, score: Math.round(x.score * 100) / 100, why: x.why });

function starter(input: BuildInput, p: ChampionProfile, e: EnemyPicture, s: State, gold: Map<StatKey, number>): BuildRecommendation["starter"] {
  const shop = input.items.filter((i) => i.purchasable);
  const position = (input.position ?? "").toUpperCase();
  const starters = shop.filter((i) => i.rank.includes("STARTER") && i.gold > 0 && i.gold <= STARTING_GOLD && (i.requiredChampion === null || i.requiredChampion === p.id));
  const potion = shop.filter((i) => i.rank.includes("CONSUMABLE") && i.tags.includes("HealthRegen") && i.gold > 0).sort((a, b) => a.gold - b.gold)[0];
  const withPotions = (first: ItemFacts, why: string[]) => {
    const n = potion ? Math.floor((STARTING_GOLD - first.gold) / potion.gold) : 0;
    return {
      items: [first, ...Array.from({ length: n }, () => potion!)].map((i) => ({ id: i.id, name: i.name, gold: i.gold })),
      why,
    };
  };

  if (position === "JUNGLE") {
    const pets = starters.filter((i) => i.tags.includes("Jungle"));
    if (!pets.length) return null;
    // Companions differ in what they add: damage, defense (shield/health) or movement.
    const fit = (i: ItemFacts) => {
      const t = i.effects.map((x) => x.text).join(" ");
      return (/damage|burn/i.test(t) ? p.offense * (1 - p.frontline) : 0) + (/shield|tenacity|health/i.test(t) ? p.frontline : 0) + (/movement speed/i.test(t) ? 0.3 : 0);
    };
    const best = [...pets].sort((a, b) => fit(b) - fit(a) || a.id - b.id)[0]!;
    const t = best.effects.map((x) => x.text).join(" ");
    const adds = [/damage|burn/i.test(t) && "damage", /shield|tenacity|health/i.test(t) && "defense", /movement speed/i.test(t) && "movement speed"].filter(Boolean);
    const others = pets.filter((x) => x.id !== best.id).map((x) => x.name);
    const fitText = adds.length
      ? ` ${best.name}'s companion adds ${list(adds as string[])}${adds.includes("damage") && p.offense >= 0.6 ? `, which suits ${p.name}'s damage-focused kit` : adds.includes("defense") && p.frontline >= 0.5 ? `, which suits ${p.name}'s tanky kit` : ""}.`
      : "";
    return withPotions(best, [`Jungle companions are the jungle's starting item.${fitText}${others.length ? ` The others (${list(others)}) upgrade your jungle spell differently; any of them works.` : ""}`]);
  }
  if (position === "UTILITY" || position === "SUPPORT") {
    const quest = starters.find((i) => i.effects.some((x) => /quest/i.test(x.name ?? "")));
    if (quest) return withPotions(quest, [`${quest.name} is the support starting item: it earns gold while you share lane and upgrades as you go.`]);
  }
  const lane = starters.filter((i) => i.tags.includes("Lane") && !i.tags.includes("GoldPer") && !i.tags.includes("Jungle") && !i.effects.some((x) => /quest/i.test(x.name ?? "")));
  if (!lane.length) return null;
  const opponent = e.profiles.find((x) => x.name === e.laneOpponent);
  const rated = lane.map((i) => {
    const sc = score(itemProfile(i, gold, new Map(input.items.map((x) => [x.id, x]))), p, e, s);
    const text = i.effects.map((x) => x.text).join(" ");
    let bonus = 0;
    const why = [...sc.why];
    if (opponent && !p.ranged && opponent.ranged && /health regeneration/i.test(text)) {
      bonus += 0.4;
      why.push(`You are melee against ${opponent.name}, who is ranged: it regenerates health after taking damage.`);
    }
    if (s.manaNeed >= 0.35 && /mana/i.test(text) && !why.some((x) => /mana/.test(x))) {
      bonus += 0.3 * s.manaNeed;
      why.push(`It restores mana, which ${p.name}'s abilities spend quickly early on.`);
    }
    // A starter is bought with a fixed budget, so its value counts in full rather than per gold.
    return { i, value: sc.statValue * i.gold / STARTING_GOLD + bonus, why };
  }).sort((a, b) => b.value - a.value || a.i.id - b.i.id);
  return withPotions(rated[0]!.i, rated[0]!.why);
}

export function recommendBuild(input: BuildInput): BuildRecommendation {
  const p = championProfile(input.me);
  const e = enemyPicture(input.enemies);
  const gold = statGoldValues(input.items);
  const owned = new Set(input.owned ?? []);
  const catalog = new Map(input.items.map((i) => [i.id, i]));
  const profiles = input.items.map((i) => itemProfile(i, gold, catalog))
    .filter((ip) => (ip.finished || ip.boots) && (ip.item.requiredChampion === null || ip.item.requiredChampion === p.id) && ip.item.requiredAlly === null);

  const state: State = {
    threats: Object.fromEntries(Object.entries(e.threats).map(([k, t]) => [k, t.weight])) as Record<ThreatKind, number>,
    manaNeed: p.manaNeed,
    effects: new Set(),
  };
  const take = (ip: ItemProfile) => {
    // What an item already answers no longer needs answering; its unique effects can't stack.
    for (const c of ip.counters) for (const k of COUNTERS[c].answers) state.threats[k] *= 0.15;
    state.manaNeed *= clamp(1 - ip.mana / 600);
    for (const ef of ip.item.effects) if (ef.unique && ef.name) state.effects.add(ef.name);
  };
  for (const id of owned) { const it = catalog.get(id); if (it) take(itemProfile(it, gold, catalog)); }

  const ruledOut = new Map<number, { id: number; name: string; why: string; score: number }>();
  const candidates = (boots: boolean) => profiles
    .filter((ip) => ip.boots === boots && !owned.has(ip.item.id) && !picked.has(ip.item.id) && !ip.item.effects.some((ef) => ef.unique && ef.name && state.effects.has(ef.name)))
    .map((ip) => {
      const sc = score(ip, p, e, state);
      const useless = counterWithoutThreat(ip, e);
      if (useless) {
        const kind = COUNTERS[useless].answers[0]!;
        ruledOut.set(ip.item.id, { id: ip.item.id, name: ip.item.name, why: `Its passive ${COUNTERS[useless].says}, and ${NO_THREAT[kind]}.`, score: sc.statValue });
        return null;
      }
      return sc;
    })
    .filter((x): x is Scored => x !== null)
    .sort((a, b) => b.score - a.score || a.ip.item.gold - b.ip.item.gold || a.ip.item.id - b.ip.item.id);

  const core: Scored[] = [];
  const picked = new Set<number>();
  const hasBoots = [...owned].some((id) => catalog.get(id)?.rank.includes("BOOTS"));
  let boots: Scored | null = null;
  for (let n = 0; n < 3; n++) {
    const best = candidates(false)[0];
    if (!best) break;
    core.push(best);
    picked.add(best.ip.item.id);
    take(best.ip);
    if (n === 0 && !hasBoots) { boots = candidates(true)[0] ?? null; if (boots) take(boots.ip); }
  }

  // Situational: a strong threat the core does not answer, with the best item that does.
  const situational: Situational[] = [];
  const chosen = new Set([...core, ...(boots ? [boots] : [])].map((x) => x.ip.item.id));
  for (const t of Object.values(e.threats).filter((x) => x.weight >= 0.3).sort((a, b) => b.weight - a.weight)) {
    if (state.threats[t.kind] < RELEVANT) continue; // already answered by the core
    const who = list(t.sources.slice(0, 3).map((x) => x.name));
    const counter = profiles
      .filter((ip) => !chosen.has(ip.item.id) && !owned.has(ip.item.id) && ip.counters.some((c) => COUNTERS[c].answers.includes(t.kind)))
      .map((ip) => score(ip, p, e, state))
      .sort((a, b) => b.score - a.score)[0];
    if (!counter) continue;
    // A counter whose stats this champion barely uses (a tank item for a damage dealer) is replaced by
    // the item that fits the champion best among those giving the resist against that threat.
    const resist = resistAgainst(t, e);
    const fitting = counter.fit < FITS && resist
      ? profiles
          .filter((ip) => ip.finished && !chosen.has(ip.item.id) && !owned.has(ip.item.id) && (ip.item.stats[resist]?.flat ?? 0) > 0 && !counterWithoutThreat(ip, e))
          .map((ip) => score(ip, p, e, state))
          .filter((x) => x.fit >= FITS)
          .sort((a, b) => b.score - a.score)[0]
      : undefined;
    const answer = fitting ?? counter;
    chosen.add(answer.ip.item.id);
    situational.push({
      ...pick(answer),
      when: fitting
        ? `Against the ${threatPhrase(t.kind)} from ${who}: ${resist === "armor" ? "armor" : "magic resist"} with stats ${p.name} uses (${counter.ip.item.name} counters it directly but is built for tanky champions).`
        : `Against the ${threatPhrase(t.kind)} from ${who}.`,
    });
    if (situational.length >= 3) break;
  }
  for (const [kind, share] of [["physical", e.damage.physical], ["magic", e.damage.magic]] as const) {
    if (share < 0.6 || situational.length >= 3) continue;
    const stat = kind === "physical" ? "armor" : "magicResistance";
    const answer = profiles
      .filter((ip) => ip.finished && !chosen.has(ip.item.id) && !owned.has(ip.item.id) && (ip.item.stats[stat]?.flat ?? 0) > 0 && !counterWithoutThreat(ip, e))
      .map((ip) => score(ip, p, e, state))
      .sort((a, b) => b.score - a.score)[0];
    if (!answer) continue;
    chosen.add(answer.ip.item.id);
    situational.push({ ...pick(answer), when: `If the ${kind} damage (${pct(share)} of the enemy team's) is hard to survive.` });
  }

  const first = core[0] ?? null;
  if (first && core[1]) first.why.push(`It scores ${Math.round(first.score * 100) / 100} for this game, against ${Math.round(core[1].score * 100) / 100} for ${core[1].ip.item.name}, the next best.`);

  return {
    champion: p.name,
    kit: p.facts,
    enemyDamage: e.damage,
    threats: Object.values(e.threats).filter((t) => t.weight >= RELEVANT).sort((a, b) => b.weight - a.weight),
    starter: !(input.starter ?? owned.size === 0) ? null : starter(input, p, e, { ...state, threats: Object.fromEntries(Object.entries(e.threats).map(([k, t]) => [k, t.weight])) as Record<ThreatKind, number>, manaNeed: p.manaNeed }, gold),
    first: first ? pick(first) : null,
    next: core.slice(1).map(pick),
    boots: boots ? pick(boots) : null,
    situational,
    ruledOut: [...ruledOut.values()].sort((a, b) => b.score - a.score).slice(0, 3).map(({ id, name, why }) => ({ id, name, why })),
  };
}

/** Items count as fitting a champion when it uses at least this share of their stats. */
const FITS = 0.4;

/** The resist that protects against a threat: armor or magic resist, by the damage its sources deal. */
function resistAgainst(t: Threat, e: EnemyPicture): "armor" | "magicResistance" | null {
  if (t.kind === "crit" || t.kind === "attackSpeed") return "armor";
  if (t.kind !== "burst") return null;
  const sources = e.profiles.filter((p) => t.sources.some((x) => x.name === p.name));
  const phys = sources.reduce((s, p) => s + p.damage.physical, 0), magic = sources.reduce((s, p) => s + p.damage.magic, 0);
  return phys + magic === 0 ? null : phys >= magic ? "armor" : "magicResistance";
}

function threatPhrase(kind: ThreatKind): string {
  return {
    crit: "critical strike damage",
    healing: "healing",
    shields: "shields",
    cc: "crowd control",
    tanks: "tankiness",
    attackSpeed: "basic-attack damage",
    burst: "burst damage",
  }[kind];
}
