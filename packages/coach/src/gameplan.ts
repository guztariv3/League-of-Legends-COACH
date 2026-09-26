import type { MatchAnalysis } from "@coach/analysis";
import type { DraftAnalysis } from "@coach/draft";
import type { Champion, KnowledgeBundle } from "@coach/knowledge";
import { usualMaxOrder, type Slot } from "./skills.js";
import type { Basis } from "./decision.js";

/**
 * COACH GAME PLAN (pre-game, F3): seven lines the player can read in the loading screen,
 * plus their usual loadout with this champion. Every line says what it rests on: the
 * player's own games (observation), the game's data (fact) or a general tendency of a
 * champion class (hypothesis). Lines without support are left out, never filled in.
 */

export interface PlanLine {
  text: string;
  basis: Basis;
  /** Why, with numbers when there are any. */
  why: string;
}

export interface GamePlan {
  primaryObjective: PlanLine | null;
  secondaryObjective: PlanLine | null;
  biggestThreat: PlanLine | null;
  yourPowerSpike: PlanLine | null;
  enemyPowerSpike: PlanLine | null;
  avoid: PlanLine | null;
  lookFor: PlanLine | null;
  /** What the player usually runs with this champion (their own games). */
  loadout: {
    games: number;
    keystone: { id: number; name: string; games: number } | null;
    spells: { ids: number[]; names: string[]; games: number } | null;
    maxOrder: ("Q" | "W" | "E")[] | null;
    firstItem: { id: number; name: string; games: number; medianMinute: number | null } | null;
  };
}

export interface GamePlanInput {
  myChampion: string;
  laneOpponent?: string;
  enemies: string[];
  draft: DraftAnalysis;
  /** All of the player's analysed games (any champion). */
  history: MatchAnalysis[];
  bundle: KnowledgeBundle | undefined;
  /** Loadout and timings come from games in this mode only (default: Summoner's Rift). */
  mode?: MatchAnalysis["mode"];
}

/** Items at or above this price count as a "major item" (the synthetic catalogue is cheaper). */
const bigItemGold = (bundle: KnowledgeBundle | undefined) => (bundle?.source === "synthetic" ? 900 : 2200);
const MIN_GAMES = 3;

function mode<T>(values: T[], key: (v: T) => string = String): { value: T; count: number } | null {
  const counts = new Map<string, { value: T; count: number }>();
  for (const v of values) {
    const k = key(v);
    const c = counts.get(k) ?? { value: v, count: 0 };
    c.count++;
    counts.set(k, c);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count)[0] ?? null;
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** Riot's damage rating for a champion (the higher of attack and magic). */
const damage = (c: Champion) => Math.max(c.info?.attack ?? 0, c.info?.magic ?? 0);

/** When each class usually comes online: a general tendency, labelled as such. */
const CLASS_SPIKE: Record<string, string> = {
  Assassin: "level 6 and their first completed item",
  Marksman: "their second completed item",
  Mage: "level 6",
  Fighter: "their first completed item",
  Tank: "their first completed item and level 6",
  Support: "level 6",
};

export function gamePlan(input: GamePlanInput): GamePlan {
  const { draft, history, bundle } = input;
  const champs = new Map((bundle?.champions ?? []).map((c) => [c.id, c]));
  const items = new Map((bundle?.items ?? []).map((i) => [i.id, i]));
  const me = champs.get(input.myChampion);
  const myName = me?.name ?? input.myChampion;
  const opp = input.laneOpponent ? champs.get(input.laneOpponent) : undefined;
  const mine = history.filter((a) => a.analyzable && a.mode === (input.mode ?? "summoners_rift") && a.championName === input.myChampion);
  const point = (id: string) => [...draft.keyPoints, ...draft.morePoints].find((p) => p.id === id);

  const loadout = usualLoadout(mine, bundle);

  // ---- Biggest threat: the enemy with the highest damage rating among damage classes
  const enemies = input.enemies.map((id) => champs.get(id)).filter((c): c is Champion => c !== undefined);
  const dealers = enemies.filter((c) => c.tags.some((t) => ["Assassin", "Marksman", "Mage"].includes(t)) && c.info);
  const threat = [...dealers].sort((a, b) => damage(b) - damage(a) || (b.id === opp?.id ? 1 : 0) - (a.id === opp?.id ? 1 : 0))[0];
  const biggestThreat: PlanLine | null = threat ? {
    text: threat.name,
    basis: "hypothesis",
    why: `${threat.tags[0]} with the highest damage rating on their team (${damage(threat)}/10 in Riot's general ratings).`,
  } : null;

  // ---- Power spikes
  const yourPowerSpike: PlanLine = loadout.firstItem && loadout.firstItem.medianMinute !== null
    ? {
      text: `${loadout.firstItem.name} (around minute ${Math.round(loadout.firstItem.medianMinute)})`,
      basis: "observation",
      why: `Your first major item in ${loadout.firstItem.games} of your ${mine.length} games with ${myName}; the minute is the median of those games.`,
    }
    : { text: "Level 6", basis: "fact", why: "Your ultimate unlocks. Play a few games with this champion and I will add your usual first-item timing." };
  const spikeOf = opp ?? threat;
  const enemyPowerSpike: PlanLine | null = spikeOf ? {
    text: `${spikeOf.name}: ${CLASS_SPIKE[spikeOf.tags[0] ?? ""] ?? "level 6"}`,
    basis: "hypothesis",
    why: `A general tendency of the ${spikeOf.tags[0] ?? "champion"} class, not a statistic about this champion.`,
  } : null;

  // ---- Objectives, from what separates the player's wins from losses and from the composition
  const wincon = point("personal-wincon");
  const primaryObjective: PlanLine = wincon
    ? { text: wincon.title.replace(/^On [^,]+, what separates your wins from your losses most is your /, "Your key number: "), basis: "observation", why: wincon.detail }
    : { text: `Reach ${yourPowerSpike.text} without falling behind`, basis: yourPowerSpike.basis, why: "Until your own games show what decides your wins with this champion, your first power spike is the safest target." };
  const dmg = point("enemy-damage") ?? point("ally-damage");
  const secondaryObjective: PlanLine | null = dmg ? { text: dmg.title, basis: "hypothesis", why: dmg.detail } : null;

  // ---- What to avoid: the player's own early deaths against this class, else the composition
  let avoid: PlanLine | null = null;
  const oppClass = opp?.tags[0];
  if (oppClass) {
    const vsClass = history.filter((a) => a.analyzable && a.earlyDeaths !== null && a.laneOpponentChampion && champs.get(a.laneOpponentChampion)?.tags[0] === oppClass);
    const all = history.filter((a) => a.analyzable && a.earlyDeaths !== null);
    const avg = (xs: MatchAnalysis[]) => xs.reduce((s, a) => s + (a.earlyDeaths ?? 0), 0) / Math.max(1, xs.length);
    if (vsClass.length >= 5 && avg(vsClass) - avg(all) >= 0.5) {
      avoid = {
        text: `Early deaths against ${oppClass.toLowerCase()}s`,
        basis: "observation",
        why: `You average ${avg(vsClass).toFixed(1)} deaths before minute 14 against ${oppClass.toLowerCase()} lane opponents (${vsClass.length} games) versus ${avg(all).toFixed(1)} overall.`,
      };
    }
  }
  const assassins = point("enemy-assassins");
  if (!avoid && assassins) avoid = { text: "Walking alone without vision", basis: "hypothesis", why: assassins.detail };

  // ---- What to look for
  const noFront = point("no-frontline") ?? point("frontline-gap");
  const lookFor: PlanLine | null = noFront
    ? { text: "Fights where you have the better position", basis: "hypothesis", why: noFront.detail }
    : opp ? { text: `Trades before ${opp.name} reaches ${CLASS_SPIKE[opp.tags[0] ?? ""] ?? "level 6"}`, basis: "hypothesis", why: `Before their spike, a ${opp.tags[0]?.toLowerCase() ?? "champion"} usually has less to fight with (general class tendency).` }
    : null;

  return { primaryObjective, secondaryObjective, biggestThreat, yourPowerSpike, enemyPowerSpike, avoid, lookFor, loadout };
}

export type Loadout = GamePlan["loadout"];

/**
 * What the player usually runs with a champion, from their own games (already filtered to that
 * champion and mode): keystone, summoner spells, max order and first major item with its median minute.
 */
export function usualLoadout(mine: MatchAnalysis[], bundle: KnowledgeBundle | undefined): Loadout {
  const items = new Map((bundle?.items ?? []).map((i) => [i.id, i]));
  const keystone = mode(mine.map((a) => a.runes.keystone).filter((k): k is number => k !== null));
  const spells = mode(mine.filter((a) => a.spells.length === 2).map((a) => [...a.spells].sort((x, y) => x - y)), (s) => s.join(","));
  const max = usualMaxOrder(mine.flatMap((a) => (a.skillOrder ? [a.skillOrder as Slot[]] : [])));
  const firstBig = mine.flatMap((a) => {
    const p = (a.purchases ?? []).find((x) => (items.get(x.itemId)?.goldTotal ?? 0) >= bigItemGold(bundle));
    return p ? [p] : [];
  });
  const firstItem = mode(firstBig, (p) => String(p.itemId));
  const firstItemMinute = firstItem ? median(firstBig.filter((p) => p.itemId === firstItem.value.itemId).map((p) => p.atSec / 60)) : null;
  const runeName = (id: number) => bundle?.runes?.find((r) => r.id === id)?.name ?? `Rune ${id}`;
  const spellName = (id: number) => bundle?.spells?.find((s) => s.key === id)?.name ?? `Spell ${id}`;
  return {
    games: mine.length,
    keystone: keystone && mine.length >= MIN_GAMES ? { id: keystone.value, name: runeName(keystone.value), games: keystone.count } : null,
    spells: spells && mine.length >= MIN_GAMES ? { ids: spells.value, names: spells.value.map(spellName), games: spells.count } : null,
    maxOrder: max ? max.map((s) => (s === 1 ? "Q" : s === 2 ? "W" : "E")) : null,
    firstItem: firstItem && firstItem.count >= 2
      ? { id: firstItem.value.itemId, name: items.get(firstItem.value.itemId)?.name ?? `Item ${firstItem.value.itemId}`, games: firstItem.count, medianMinute: firstItemMinute }
      : null,
  };

}

/** The player's most common full levelling order with the champion (1 = Q … 4 = R), or null. */
export function usualSkillOrder(mine: MatchAnalysis[]): Slot[] | null {
  const orders = mine.flatMap((a) => (a.skillOrder && a.skillOrder.length >= 9 ? [a.skillOrder as Slot[]] : []));
  if (orders.length < MIN_GAMES) return null;
  // Most common order level by level: robust to games that ended before level 18.
  const out: Slot[] = [];
  for (let i = 0; i < 18; i++) {
    const at = mode(orders.map((o) => o[i]).filter((x): x is Slot => x !== undefined));
    if (!at || at.count < Math.ceil(orders.length / 3)) break;
    out.push(at.value);
  }
  return out.length ? out : null;
}
