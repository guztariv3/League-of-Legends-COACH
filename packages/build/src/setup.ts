import { setupObservations, type BuildEvidence } from "./evidence.js";
import { normalizePosition, positionReason, type Position } from "./position.js";
import type { ChampionKit, RuneData, RuneFacts, SummonerSpellFacts } from "@coach/knowledge";
import { championProfile, type ChampionProfile } from "./profile.js";
import { enemyPicture, type EnemyInput, type EnemyPicture } from "./threats.js";

/**
 * Runes and summoner spells as decisions: each rune and spell is read for what its text says it
 * does (rewards basic attacks or abilities, burst or long fights, healing, helping allies,
 * immobilizing, mana, haste, bonus damage against healthy targets…) and matched with the
 * champion's kit and the enemy team. No rune or spell is named here; every pick says why.
 */
export interface SetupInput {
  me: ChampionKit;
  enemies: EnemyInput[];
  runes: RuneData;
  spells: SummonerSpellFacts[];
  position?: string | null;
  patch?: string;
  evidence?: BuildEvidence;
}

export interface RunePick { id: number; name: string; why: string }
export interface RuneRecommendation {
  primaryTree: string;
  keystone: RunePick;
  primary: RunePick[];
  secondaryTree: string;
  secondary: RunePick[];
  shards: RunePick[];
}
export interface SpellPick { id: string; key: number; name: string; why: string }
export interface SetupRecommendation { runes: RuneRecommendation | null; spells: SpellPick[] }

type Trait = "attacks" | "attackSpeed" | "abilities" | "burst" | "sustained" | "selfHeal" | "allies" | "immobilize" | "mana" | "haste" | "defense" | "vsHealthy" | "execute" | "movement" | "dash" | "economy";

/** What a rune's text says it does. */
const TRAITS: [Trait, RegExp][] = [
  ["attacks", /\b(?:basic )?attack(?:s|ing)?\b(?! speed)|on-attack|consecutive times/i],
  ["attackSpeed", /attack speed/i],
  ["abilities", /\babilit(?:y|ies)\b(?! haste)/i],
  ["burst", /3 separate|first 3 attacks|burst of[^.]*damage|initiate/i],
  ["sustained", /stacks?\b|until you leave combat|over the course of the game|over time/i],
  ["selfHeal", /heals? you\b|heal back|heal when|heal for a portion|restore[^.]*missing health|life steal/i],
  ["allies", /\ball(?:y|ies|ied)\b/i],
  ["immobilize", /immobiliz|impairing the movement|impaired movement|movement impaired/i],
  ["mana", /\bmana\b/i],
  ["haste", /ability haste|cooldown of basic abilities|basic ability haste/i],
  ["defense", /\barmor\b|magic resist|less damage|gain defenses|increases your health|permanent max health|max(?:imum)? health when/i],
  ["vsHealthy", /high health enem/i],
  ["execute", /low health/i],
  ["movement", /\bMS\b|move speed|movement speed/i],
  ["dash", /dash, leap, blink/i],
  ["economy", /\bgold\b|\bwards?\b|trinket|\bboots\b|potion|elixir|biscuit|summoner spell|minions or monsters|turrets/i],
];

const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
const HARD_CC = /\b(stun(?:s|ned)?|root(?:s|ed)?|knock(?:s|ed)? (?:up|back|aside|airborne)|airborne|charm(?:s|ed)?|fear(?:s|ed)?|taunt(?:s|ed)?|suppress(?:es|ed)?|sleep|polymorph(?:s|ed)?|snare(?:s|d)?|pull(?:s|ed)?)\b/i;

interface KitNeeds {
  p: ChampionProfile;
  selfBurst: number;
  /** 0–1: how much hard crowd control the kit has (abilities that stun, root, knock up…). */
  ownCc: number;
  mobility: number;
  reloads: boolean;
  helpsAllies: number;
  resource: string;
  position: Position | null;
  /** Set per rune: its text also mentions energy. */
  energyText?: boolean;
}

function needs(kit: ChampionKit, position: Position | null): KitNeeds {
  const p = championProfile(kit);
  const rating = (k: string) => (typeof kit.ratings?.[k] === "number" ? kit.ratings[k]! : 2);
  return {
    p,
    selfBurst: p.offense * (1 - p.frontline) * (0.3 + 0.7 * p.abilityReliance),
    ownCc: clamp(new Set(kit.abilities.filter((a) => a.slot !== "P" && HARD_CC.test(a.text)).map((a) => a.slot)).size / 2),
    mobility: clamp((rating("mobility") - 1) / 2),
    helpsAllies: clamp(((rating("utility") - 1) / 2) * 0.6 + p.healsOrShields * 0.6),
    resource: kit.resource, position,
    reloads: kit.abilities.some(a=>a.slot === "P" && /reload/i.test(a.text)),
  };
}

/** How much a trait is worth to this champion in this game, with the fact that says why. */
function traitValue(t: Trait, k: KitNeeds, e: EnemyPicture): [number, string | null] {
  const { p } = k;
  const name = p.name;
  switch (t) {
    case "attacks": return [p.attackReliance, p.attackReliance >= 0.5 ? `${name} relies on basic attacks` : null];
    case "attackSpeed": return [p.scales.attackSpeed * (k.reloads ? .25 : .8), p.scales.attackSpeed >= 0.5 ? `${name} scales with attack speed` : null];
    case "abilities": return [p.abilityReliance, p.abilityReliance >= 0.5 ? `${name} relies on abilities` : null];
    case "burst": return [k.selfBurst, k.selfBurst >= 0.4 ? `${name} deals its damage in short bursts` : null];
    case "sustained": return [p.attackReliance * (k.reloads ? .15 : .6) + p.frontline * 0.3, p.attackReliance * 0.6 + p.frontline * 0.3 >= 0.45 ? `${name} fights in long trades` : null];
    case "selfHeal": return [(p.frontline * 0.5 + (p.ranged ? 0 : 0.4)) * 0.8, !p.ranged ? `${name} fights up close and takes damage` : null];
    case "allies": return [k.helpsAllies * 1.2, k.helpsAllies >= 0.4 ? `${name}'s kit supports allies` : null];
    case "immobilize": return [k.ownCc ? 0.8 * k.ownCc : -1, k.ownCc >= 0.5 ? `${name}'s abilities stun, root or knock up` : null];
    case "mana":
      // Mana runes are worth their mana need; to a champion without mana they are worth nothing.
      if (k.resource === "MANA") return [p.manaNeed * 1.2, p.manaNeed >= 0.3 && p.mana ? `${name}'s basic abilities cost ${p.mana.rotation} mana per rotation from a ${p.mana.pool}-mana pool` : null];
      return [k.resource === "ENERGY" && k.energyText ? 0.3 : -1, null];
    case "haste": return [p.abilityReliance * 0.6, p.abilityReliance >= 0.6 ? `${name} relies on ability cooldowns` : null];
    case "defense": return [p.frontline * 0.8 + e.threats.burst.weight * 0.2, p.frontline >= 0.5 ? `${name} is built to take hits` : null];
    case "vsHealthy": return [e.threats.tanks.weight * 0.7, e.threats.tanks.weight >= 0.3 ? `the enemy has tanky champions (${e.threats.tanks.sources.slice(0, 2).map((s) => s.name).join(", ")})` : null];
    case "execute": return [p.offense * 0.35, p.offense >= 0.6 ? `${name} is built to deal damage and finish fights` : null];
    case "movement": return [0.15, null];
    case "dash": return [k.mobility * 0.8, k.mobility >= 0.5 ? `${name} has dashes or blinks` : null];
    case "economy": return [0.05, null];
  }
}

function scoreText(text: string, needs: KitNeeds, e: EnemyPicture): { score: number; facts: string[] } {
  const k = { ...needs, energyText: /\benergy\b/i.test(text) };
  let score = 0;
  const facts: string[] = [];
  // "Attacks or abilities" works for any champion: counted once, as a neutral trigger.
  const both = TRAITS.find(([t]) => t === "attacks")![1].test(text) && TRAITS.find(([t]) => t === "abilities")![1].test(text);
  if (both) score += 0.5;
  for (const [t, re] of TRAITS) {
    if (!re.test(text) || (both && (t === "attacks" || t === "abilities"))) continue;
    const [v, fact] = traitValue(t, k, e);
    score += v;
    if (fact && v > 0.2 && !facts.includes(fact)) facts.push(fact);
  }
  let role = 0;
  if (k.position === "TOP" && /heal|sustain|overgrowth|health/i.test(text)) role += .18;
  if (k.position === "MIDDLE" && /ability haste|movement speed|move speed/i.test(text)) role += .12;
  if (k.position === "BOTTOM" && /heal|shield|less damage/i.test(text)) role += .18;
  if (k.position === "UTILITY" && /immobiliz/i.test(text)) role += .7 * k.ownCc * k.p.frontline;
  if (k.position === "UTILITY" && /all(?:y|ies|ied)|ward|trinket/i.test(text)) role += .35;
  if (k.position === "JUNGLE") {
    if (/movement speed|move speed|river|ward/i.test(text)) role += .25;
    if (/in combat[^.]*next basic attack|every 4 seconds in combat/i.test(text)) role -= .5;
  }
  if (role !== 0) { score += role; facts.push(positionReason(k.position)); }
  return { score, facts };
}

const sentence = (s: string) => s.split(/(?<=\.)\s|\n/)[0]!.trim();
const why = (r: { short: string }, facts: string[]) =>
  `${sentence(r.short)} ${facts.length ? `Fits: ${facts.slice(0, 2).join("; ")}.` : "No rune in this row stands out for this champion; this one is a reasonable default."}`;

const eligibleRune = (r: RuneFacts, k: KitNeeds) => !(/\bmana\b/i.test(r.short) && k.resource !== "MANA" && !(k.resource === "ENERGY" && /\benergy\b/i.test(r.short)))
  && !(/immobiliz/i.test(r.short) && k.ownCc === 0);

/** Validate a complete observed page before it can affect statistical scope or weights. */
function legalObservedPage(key: string, data: RuneData, k: KitNeeds): boolean {
  if (!/^\d+(>\d+){10}$/.test(key)) return false;
  const ids=key.split('>').map(Number);
  const pt=data.trees.find(t=>t.id===ids[0]), st=data.trees.find(t=>t.id===ids[1]);
  if(!pt || !st || pt.id===st.id || !pt.secondary.includes(st.id)) return false;
  if(![0,1,2,3].every(row=>pt.rows[row]?.includes(ids[2+row]!))) return false;
  const rows=[ids[6]!,ids[7]!].map(id=>st.rows.findIndex(row=>row.includes(id)));
  if(rows.some(row=>row<=0) || rows[0]===rows[1]) return false;
  if(data.shardRows.length!==3 || !data.shardRows.every((row,i)=>row.shards.includes(ids[8+i]!) && data.shards.some(s=>s.id===ids[8+i]))) return false;
  return ids.slice(2,8).every(id=>{const rune=data.runes.find(r=>r.id===id);return !!rune && eligibleRune(rune,k);});
}

function recommendRunes(data: RuneData, k: KitNeeds, e: EnemyPicture, observations: ReturnType<typeof setupObservations>): RuneRecommendation | null {
  const byId = new Map(data.runes.map((r) => [r.id, r]));
  // The summary says what the rune is for; the long text lists details that would add noise.
  const eligible = (r: RuneFacts) => eligibleRune(r,k);
  const rated = (r: RuneFacts) => ({ r, ...scoreText(r.short, k, e), ...(eligible(r) ? {} : {score: -Infinity}) });
  const bestOf = (ids: number[]) => ids.map((id) => byId.get(id)).filter((r): r is RuneFacts => r !== undefined).map(rated).sort((a, b) => b.score - a.score || a.r.id - b.r.id)[0];
  // The primary tree is the one whose whole page (keystone, which weighs most, plus its best rune per row) fits best.
  const pages = data.trees.map((t) => {
    const key = bestOf(t.rows[0] ?? []);
    const rows = t.rows.slice(1).map(bestOf).filter((x) => x !== undefined);
    return { t, key, rows, total: (key ? key.score * 2 : -Infinity) + rows.reduce((sum, x) => sum + x.score, 0) };
  }).sort((a, b) => b.total - a.total || a.t.id - b.t.id);
  const best = pages[0];
  if (!best?.key) return null;
  const tree = best.t;
  const key = best.key;
  const primary = best.rows;

  // Secondary: the allowed tree whose two best runes (from different rows) add up to the most.
  let secondary: { tree: string; picks: ReturnType<typeof rated>[]; total: number } | null = null;
  for (const t of data.trees.filter((x) => x.id !== tree.id && tree.secondary.includes(x.id))) {
    const perRow = t.rows.slice(1).map(bestOf).filter((x) => x !== undefined).sort((a, b) => b.score - a.score);
    const picks = perRow.slice(0, 2);
    const total = picks.reduce((s, x) => s + x.score, 0);
    if (picks.length === 2 && (!secondary || total > secondary.total)) secondary = { tree: t.name, picks, total };
  }

  // Stat shards, one per row, by what the kit and the enemy call for.
  const shardValue = (text: string): [number, string | null] => {
    const { p } = k;
    if (/tenacity/i.test(text)) return [e.threats.cc.weight * 0.9, e.threats.cc.weight >= 0.5 ? `the enemy team has a lot of crowd control` : null];
    if (/attack speed/i.test(text)) return [p.scales.attackSpeed * 0.8, p.scales.attackSpeed >= 0.5 ? `${p.name} scales with attack speed` : null];
    if (/ability haste/i.test(text)) return [p.abilityReliance * 0.6, p.abilityReliance >= 0.6 ? `${p.name} relies on ability cooldowns` : null];
    if (/adaptive/i.test(text)) return [p.offense * 0.7, p.offense >= 0.6 ? `${p.name} is built to deal damage` : null];
    if (/move speed/i.test(text)) return [0.25, null];
    if (/health/i.test(text) && /based on level/i.test(text)) return [p.frontline * 0.5 + 0.2, p.frontline >= 0.5 ? `${p.name} is built to take hits` : null];
    if (/health/i.test(text)) return [0.3 + e.threats.burst.weight * 0.3, e.threats.burst.weight >= 0.5 ? `the enemy team deals burst damage` : null];
    return [0, null];
  };
  const shardById = new Map(data.shards.map((s) => [s.id, s]));
  const shards = data.shardRows.map((row) => row.shards.map((id) => shardById.get(id)).filter((s) => s !== undefined)
    .map((s) => ({ s, v: shardValue(`${s.name} ${s.text}`) }))
    .sort((a, b) => b.v[0] - a.v[0] || a.s.id - b.s.id)[0])
    .filter((x) => x !== undefined)
    .map(({ s, v }) => ({ id: s.id, name: s.name, why: `${s.text}${v[1] ? `: ${v[1]}.` : "."}` }));

  const pick = (x: ReturnType<typeof rated>): RunePick => ({ id: x.r.id, name: x.r.name, why: why(x.r, x.facts) });
  const fallback: RuneRecommendation = {
    primaryTree: tree.name,
    keystone: pick(key),
    primary: primary.map(pick),
    secondaryTree: secondary?.tree ?? "",
    secondary: (secondary?.picks ?? []).map(pick),
    shards,
  };
  const mechanicalScore = (page: RuneRecommendation) => {
    const score = (id: number) => { const r = byId.get(id); return r ? rated(r).score : -Infinity; };
    return score(page.keystone.id) * 2 + [...page.primary, ...page.secondary].reduce((n,r)=>n+score(r.id),0)
      + page.shards.reduce((n,r)=>{const shard=shardById.get(r.id);return n+(shard ? shardValue(`${shard.name} ${shard.text}`)[0] : -Infinity);},0);
  };
  let answer = fallback, bestScore = mechanicalScore(fallback);
  for (const observation of observations) {
    if (!legalObservedPage(observation.key,data,k)) continue;
    const ids = observation.key.split(">").map(Number);
    const pt = data.trees.find(t=>t.id===ids[0])!, st=data.trees.find(t=>t.id===ids[1])!;
    const perks=ids.slice(2,8).map(id=>byId.get(id)!);
    const rp = perks.map(r=>pick(rated(r!)));
    const page: RuneRecommendation = {primaryTree:pt.name,secondaryTree:st.name,keystone:rp[0]!,primary:rp.slice(1,4),secondary:rp.slice(4),shards:ids.slice(8).map(id=>{const shard=shardById.get(id)!;return {id,name:shard.name,why:shard.text};})};
    const score = mechanicalScore(page) + observation.bonus * 4;
    if (score > bestScore) { bestScore=score;answer=page;answer.keystone.why += ` ${observation.reason}`; }
  }
  answer.keystone.why += ` ${positionReason(k.position)}`;
  if (answer === fallback) answer.keystone.why += " Mechanic-based page; no observed complete page displaced it. This is not a matchup win-rate prediction.";
  return answer;
}

function recommendSpells(spells: SummonerSpellFacts[], k: KitNeeds, e: EnemyPicture, position: string, observations: ReturnType<typeof setupObservations>): SpellPick[] {
  const { p } = k;
  const t = (s: SummonerSpellFacts) => s.text;
  const picks: SpellPick[] = [];
  const take = (s: SummonerSpellFacts | undefined, reason: string) => { if (s && !picks.some((x) => x.id === s.id)) picks.push({ id: s.id, key: s.key, name: s.name, why: reason }); };

  // Jungle: the spell that damages monsters is required to clear camps.
  if (position === "JUNGLE") take(spells.find((s) => /monster/i.test(t(s))), "Required in the jungle: it damages monsters and upgrades with your jungle companion.");
  // An instant short-range blink is the only spell that repositions you on the spot.
  take(spells.find((s) => /teleports you a short distance/i.test(t(s))), "Instantly repositions you a short distance: an escape or engage no other spell gives.");

  const options: { s: SummonerSpellFacts; v: number; reason: string }[] = [];
  for (const s of spells) {
    const x = t(s);
    const burst = e.threats.burst, cc = e.threats.cc, heal = e.threats.healing;
    let v = 0, reason = "";
    if (/true damage over time/i.test(x) && /reduces healing/i.test(x)) {
      v = 0.4 * p.offense + 0.3 * k.selfBurst + 0.4 * heal.weight + (["MIDDLE", "UTILITY", "TOP"].includes(position) ? 0.2 : 0);
      reason = heal.weight >= 0.4 ? `Damage to finish fights, and it cuts healing (${heal.sources.slice(0, 2).map((y) => y.name).join(", ")}).` : `Extra damage to win early fights: ${p.name} is built to deal damage.`;
    } else if (/travel to an allied unit/i.test(x)) {
      v = (position === "TOP" ? 0.6 : position === "MIDDLE" ? 0.3 : 0) + 0.3 * p.frontline;
      reason = "Gets you back to lane or into a fight across the map; side lanes are far from the rest of the team.";
    } else if (/restores health/i.test(x) && /allied/i.test(x)) {
      v = (position === "BOTTOM" ? 0.6 : 0) + 0.3 * (p.ranged ? 1 : 0) * (1 - p.frontline);
      reason = "Heals you and your lane partner and gives both movement speed.";
    } else if (/reduces their damage/i.test(x)) {
      v = 0.5 * burst.weight * (1 - p.frontline) + (position === "UTILITY" ? 0.25 : 0) + 0.2 * e.threats.attackSpeed.weight;
      reason = `Reduces the damage of one enemy${burst.sources[0] ? `, e.g. ${burst.sources[0].name}'s burst` : ""}.`;
    } else if (/gain a brief shield/i.test(x)) {
      v = 0.4 * burst.weight * (1 - p.frontline);
      reason = `A shield against burst damage${burst.sources[0] ? ` (${burst.sources.slice(0, 2).map((y) => y.name).join(", ")})` : ""}.`;
    } else if (/removes all disables/i.test(x)) {
      v = 0.5 * cc.weight * (1 - p.frontline) * (0.4 + p.attackReliance);
      reason = `Removes crowd control (${cc.sources.slice(0, 2).map((y) => y.name).join(", ")}).`;
    } else if (/gain move speed/i.test(x)) {
      v = 0.4 * p.attackReliance * (p.ranged ? 0.3 : 1);
      reason = `Movement speed to reach targets: ${p.name} fights with basic attacks up close.`;
    }
    if (v > 0) options.push({ s, v, reason });
  }
  // Keep the mandatory jungle spell / repositioning choice; evidence can rank the second spell.
  for (const option of options) {
    const pair=[picks[0]?.key,option.s.key].sort((a,b)=>(a??0)-(b??0)).join("+");
    const observed=observations.find(row=>row.key===pair);
    if (observed) {option.v+=observed.bonus;option.reason+=` ${observed.reason}`;}
  }
  for (const o of options.sort((a, b) => b.v - a.v || a.s.id.localeCompare(b.s.id))) {
    if (picks.length >= 2) break;
    take(o.s, o.reason);
  }
  return picks.slice(0, 2);
}

export function recommendSetup(input: SetupInput): SetupRecommendation {
  if (input.me.detail !== "full") return {runes:null,spells:[]};
  const position = normalizePosition(input.position);
  const k = needs(input.me, position);
  const e = enemyPicture(input.enemies);
  const evidence = {evidence:input.evidence,champion:input.me.id,position,patch:input.patch,opponent:input.enemies.find(x=>x.laneOpponent)?.kit.id};
  return {
    runes: recommendRunes(input.runes, k, e, setupObservations({...evidence,kind:'runePages',acceptKey:key=>legalObservedPage(key,input.runes,k)})),
    spells: recommendSpells(input.spells, k, e, position ?? "", setupObservations({...evidence,kind:'spells'})),
  };
}
