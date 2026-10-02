import type { AbilityFacts, ChampionKit, Scaling } from "@coach/knowledge";

/**
 * What a champion's own kit asks for, read from its data (never from its class or role):
 * what its abilities scale with, which damage type they deal, how much it relies on
 * abilities versus basic attacks, how tanky it is meant to be, and how hungry for mana it is.
 * Every number keeps the facts it came from, so a recommendation can say why.
 */
export interface ChampionProfile {
  id: string;
  name: string;
  /** Share of the kit's damage by type (0–1, sums to 1). */
  damage: { physical: number; magic: number; true: number };
  /** 0–1: how much the kit relies on abilities (Wiki rating); attacks = 1 − abilities. */
  abilityReliance: number;
  attackReliance: number;
  /** 0–1: how much the kit scales with each kind of stat. */
  scales: { AP: number; AD: number; crit: number; attackSpeed: number; health: number; resists: number; mana: number; targetHealth: number };
  /** 0–1: built to take hits (Wiki toughness rating 1–3). */
  frontline: number;
  /** 0–1: built to deal damage (Wiki damage rating 1–3). */
  offense: number;
  /** 0–1 need for mana; 0 for champions without mana. */
  manaNeed: number;
  /** Mana facts behind `manaNeed` (null without mana or costs). */
  mana: { rotation: number; pool: number; costs: { slot: string; cost: number }[] } | null;
  /** Its abilities heal or shield (it values heal and shield power). */
  healsOrShields: number;
  /** The kit can heal or shield another ally, not only its owner. */
  allyHealShield: boolean;
  ranged: boolean;
  spellOnHit: boolean;
  attackSpeedCooldown: boolean;
  cannotBuyBoots: boolean;
  cannotGainHealth: boolean;
  critMultiplier: number;
  damagingUltimate: boolean;
  repeatUltimate: boolean;
  sustainedSpellDamage: boolean;
  channeledBasicDamage: boolean;
  /** Plain facts used by the explanations. */
  facts: string[];
}

const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
const first = (kit: ChampionKit, slot: string) => kit.abilities.find((a) => a.slot === slot);
const BASICS = ["Q", "W", "E"] as const;
const ALL = ["P", "Q", "W", "E", "R"] as const;

/** The abilities (first form per slot, plus later forms) that mention a scaling. */
function slotsWith(kit: ChampionKit, test: (s: Scaling) => boolean): string[] {
  return ALL.filter((slot) => kit.abilities.some((a) => a.slot === slot && a.scalings.some(test)));
}

const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

export function championProfile(kit: ChampionKit): ChampionProfile {
  const facts: string[] = [];
  const reliance = kit.ratings?.["abilityReliance"];
  // The Wiki gives 0–100; without it, a champion whose abilities do most things is assumed ability-reliant.
  const kitText = kit.abilities.map(a => a.text).join(" ");
  const attackSpeedCooldown = kit.abilities.some(a => /attack speed/i.test(a.cooldownFormula ?? "") || /cooldown/i.test(a.text) && /cooldowns?[^\n]{0,160}attack speed|attack speed[^\n]{0,160}(?:cooldown|cast time)/i.test(a.text));
  // Read the active spell, not a passive whose *following basic attack* applies on-hit.
  const spellOnHit = !attackSpeedCooldown && kit.abilities.some(a => {
    const active = (a.text.split(/Active:\s*/i)[1] ?? "").split("\n")[0] ?? "";
    return BASICS.includes(a.slot as typeof BASICS[number]) && (a.cooldown?.[0] ?? 999) <= 6 && /appl(?:ies|ying) on-hit effects/i.test(active) && a.scalings.some(s => s === "AD" || s === "bonusAD");
  });
  const cannotBuyBoots = /cannot (?:purchase|buy) boots/i.test(kitText);
  const cannotGainHealth = /maximum health cannot increase/i.test(kitText);
  const critMultiplier = /critical strike chance is doubled/i.test(kitText) ? 2 : 1;
  const reportedReliance = typeof reliance === "number" ? clamp(reliance / 100) : 0.6;
  // A repeatable damaging spell is not an attack-speed steroid, even if it applies on-hit.
  const abilityReliance = spellOnHit ? Math.max(.75, reportedReliance) : reportedReliance;
  const attackReliance = 1 - abilityReliance;

  // Damage type: abilities by their damage type, plus basic attacks (physical) by attack reliance.
  let phys = 0, magic = 0, tru = 0;
  for (const a of kit.abilities) {
    if (a.damageType === "PHYSICAL") phys += 1;
    else if (a.damageType === "MAGIC") magic += 1;
    else if (a.damageType === "TRUE") tru += 1;
    else if (a.damageType === "MIXED") { phys += 0.5; magic += 0.5; }
  }
  const abilityTotal = phys + magic + tru;
  const abilityShare = abilityTotal ? { p: phys / abilityTotal, m: magic / abilityTotal, t: tru / abilityTotal }
    : kit.adaptiveType === "MAGIC" ? { p: 0, m: 1, t: 0 } : { p: 1, m: 0, t: 0 };
  const damage = {
    physical: abilityShare.p * abilityReliance + attackReliance,
    magic: abilityShare.m * abilityReliance,
    true: abilityShare.t * abilityReliance,
  };

  // Scalings: in how many ability slots each kind of stat appears.
  const count = (test: (s: Scaling) => boolean) => slotsWith(kit, test);
  const apSlots = count((s) => s === "AP");
  const adSlots = count((s) => s === "AD" || s === "bonusAD" || s === "lethality");
  const critSlots = count((s) => s === "critChance");
  if (critMultiplier > 1 && !critSlots.includes("P")) critSlots.push("P");
  const asSlots = count((s) => s === "attackSpeed");
  const hpSlots = count((s) => s === "health" || s === "bonusHealth");
  const resSlots = count((s) => s === "armor" || s === "magicResist");
  const manaSlots = count((s) => s === "mana");
  const targetSlots = count((s) => s === "targetMaxHealth" || s === "targetCurrentHealth" || s === "targetMissingHealth");
  const share = (n: number) => clamp(n / 3);
  const attacksPhysical = attackReliance; // basic attacks are physical damage and scale with AD
  const scales = {
    AP: clamp(share(apSlots.length) * (0.4 + abilityReliance)),
    AD: clamp(Math.max(share(adSlots.length) * (0.4 + abilityReliance), attacksPhysical * 0.9)),
    // Basic-attack champions scale with crit through their attacks; some abilities scale with it too.
    crit: clamp(critSlots.length ? 0.5 + 0.2 * critSlots.length : attacksPhysical * (kit.attackType === "RANGED" ? 0.8 : 0.55)),
    attackSpeed: clamp(Math.max(attackReliance * 0.9, share(asSlots.length), attackSpeedCooldown ? .9 : 0)),
    health: share(hpSlots.length),
    resists: share(resSlots.length),
    mana: share(manaSlots.length),
    targetHealth: share(targetSlots.length),
  };
  const scaleFact = (slots: string[], what: string) => {
    const named = slots.map((s) => (s === "P" ? "passive" : s));
    facts.push(`${kit.name}'s ${list(named)} ${slots.length > 1 ? "scale" : "scales"} with ${what}`);
  };
  if (apSlots.length) scaleFact(apSlots, "ability power");
  if (adSlots.length) scaleFact(adSlots, "attack damage");
  if (critSlots.length) scaleFact(critSlots, "critical strike chance");
  if (hpSlots.length) scaleFact(hpSlots, "health");
  if (attackReliance >= 0.6) facts.push(`${kit.name} relies on basic attacks (ability reliance ${Math.round(abilityReliance * 100)}/100 on the Wiki)`);
  else if (abilityReliance >= 0.8) facts.push(`${kit.name} relies on abilities (ability reliance ${Math.round(abilityReliance * 100)}/100 on the Wiki)`);

  const rating = (k: string) => (typeof kit.ratings?.[k] === "number" ? kit.ratings[k]! : 2);
  const frontline = clamp((rating("toughness") - 1) / 2 + share(hpSlots.length + resSlots.length) * 0.3);
  const offense = clamp((rating("damage") - 1) / 2 * 0.8 + 0.2);

  // Mana: the cost of one rotation of the basic abilities at rank 1 against the level-1 pool,
  // and how fast casting them on cooldown drains mana compared with regeneration.
  let manaNeed = 0;
  let mana: ChampionProfile["mana"] = null;
  if (kit.resource === "MANA" && kit.stats.mana > 0) {
    const costs = BASICS.map((slot) => ({ slot, a: first(kit, slot) }))
      .filter((x): x is { slot: (typeof BASICS)[number]; a: AbilityFacts } => (x.a?.resource === "MANA" || x.a?.resource === "MANA_PER_SECOND") && (x.a.cost?.[0] ?? 0) > 0)
      .map(({ slot, a }) => ({ slot, cost: a.cost![0]!, cooldown: a.cooldown?.[0] ?? null }));
    const rotation = costs.reduce((s, c) => s + c.cost, 0);
    if (rotation > 0) {
      const perSecond = costs.reduce((s, c) => s + (c.cooldown ? c.cost / c.cooldown : 0), 0);
      const regenPerSecond = kit.stats.manaRegen / 5;
      const poolPart = clamp((rotation / kit.stats.mana - 0.2) / 0.4);
      const burnPart = regenPerSecond > 0 && perSecond > 0 ? clamp(Math.log(perSecond / regenPerSecond) / Math.log(40)) : 0;
      manaNeed = clamp(0.5 * poolPart + 0.5 * burnPart);
      mana = { rotation, pool: kit.stats.mana, costs: costs.map(({ slot, cost }) => ({ slot, cost })) };
      facts.push(`${kit.name}'s ${list(costs.map((c) => c.slot))} cost ${list(costs.map((c) => String(c.cost)))} mana at rank 1 (${rotation} per rotation) from a ${kit.stats.mana}-mana pool at level 1`);
    }
  }

  const healsOrShields = clamp(kit.abilities.filter((a) => a.values.some((v) => /^(heal|shield strength|maximum heal|minimum heal|heal per)/i.test(v))).length / 3);
  const allyHealShield = kit.abilities.some(a =>
    a.values.some(v => /^(heal|shield strength|maximum heal|minimum heal|heal per)/i.test(v))
    && /\ball(?:y|ies|ied)\b/i.test(a.text));

  if (cannotBuyBoots) facts.push(`${kit.name}'s kit prohibits purchasing boots`);
  if (cannotGainHealth) facts.push(`${kit.name}'s kit converts bonus health instead of gaining maximum health`);
  if (critMultiplier > 1) facts.push(`${kit.name}'s passive multiplies critical strike chance by ${critMultiplier}`);
  if (attackSpeedCooldown) facts.push(`${kit.name}'s ability cooldown or cast time scales with attack speed`);
  if (spellOnHit) facts.push(`${kit.name} has a short-cooldown damage spell that applies on-hit effects; attack speed does not reduce its cooldown`);
  const ultimate = first(kit, "R");
  const damagingUltimate = Boolean(ultimate && /(?:deals?|dealing) .{0,80}damage/i.test(ultimate.text));
  const repeatUltimate = Boolean(damagingUltimate && ultimate && /recast|damage every|per second/i.test(ultimate.text));
  const sustainedSpellDamage=kit.abilities.some(a=>a.damageType!==null && /damage every [\d.]|damage per (?:second|tick)|damage over [\d.]+ seconds/i.test(a.text));
  const channeledBasicDamage=kit.abilities.some(a=>BASICS.includes(a.slot as typeof BASICS[number]) && a.damageType!==null && /channel(?:ling|ing|s)? for|channel duration|while channel(?:l)?ing/i.test(a.text));
  if(sustainedSpellDamage)facts.push(`${kit.name}'s kit documents repeated spell damage over time`);
  if(channeledBasicDamage)facts.push(`${kit.name} has a channeled basic damage spell; weaving attacks can interrupt its damage window`);
  const total = damage.physical + damage.magic + damage.true || 1;
  return {
    id: kit.id,
    name: kit.name,
    damage: { physical: damage.physical / total, magic: damage.magic / total, true: damage.true / total },
    abilityReliance,
    attackReliance,
    scales,
    frontline,
    offense,
    manaNeed,
    mana,
    healsOrShields,
    allyHealShield,
    spellOnHit, attackSpeedCooldown, cannotBuyBoots, cannotGainHealth, critMultiplier, damagingUltimate, repeatUltimate, sustainedSpellDamage, channeledBasicDamage,
    ranged: kit.attackType === "RANGED",
    facts,
  };
}
