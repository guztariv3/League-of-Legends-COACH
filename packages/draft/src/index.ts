import { compareMeans, wilson, type MatchAnalysis } from "@coach/analysis";
import type { Champion } from "@coach/knowledge";

/**
 * Pre-game / draft analysis (brief §41–44, decision D-03): works on
 * champions only. It never looks up or reveals players during champion
 * select. Composition signals come from Data Dragon's class tags and 0–10
 * ratings, so they are approximate and always labelled as such. Personal
 * notes come from the player's own games, with sample sizes.
 */
export const DRAFT_VERSION = 1;

export interface Composition {
  champions: { id: string; name: string; tags: string[] }[];
  /** Champions whose class tags include Tank or Fighter. */
  frontline: number;
  classes: Record<string, number>;
  /** Approximate share of magic vs physical damage from Data Dragon ratings; null if unknown. */
  magicShare: number | null;
  /** Champions without ratings (excluded from the damage estimate). */
  unrated: number;
}

export interface DraftPoint {
  id: string;
  kind: "fact" | "observation" | "hypothesis";
  title: string;
  detail: string;
  /** Higher = more important; only the top 3 are shown first. */
  weight: number;
}

export interface DraftInput {
  /** Riot champion ids (e.g. "MonkeyKing"). */
  myChampion: string;
  allies: string[];
  enemies: string[];
  /** Optional: the enemy champion expected in the player's lane. */
  laneOpponent?: string;
}

export interface DraftAnalysis {
  version: number;
  ally: Composition;
  enemy: Composition;
  /** Up to 3 points, most important first ("this is what matters most"). */
  keyPoints: DraftPoint[];
  /** Everything else, on demand. */
  morePoints: DraftPoint[];
  personal: {
    withChampion: { games: number; wins: number; interval: { low: number; high: number } };
    vsOpponent: { games: number; wins: number } | null;
  };
  unknownChampions: string[];
  limits: string[];
}

export const DRAFT_LIMITS = [
  "The damage profile is approximate: it is based on Data Dragon's general ratings, not on specific builds or abilities.",
  "Classes (Tank, Fighter…) are general official tags; they do not describe engage, peel or scaling.",
  "No information about other players is looked up during champion select.",
];

export function composition(ids: string[], champions: Map<string, Champion>): Composition {
  const list = ids.map((id) => champions.get(id)).filter((c): c is Champion => c !== undefined);
  const classes: Record<string, number> = {};
  for (const c of list) for (const t of c.tags) classes[t] = (classes[t] ?? 0) + 1;
  const rated = list.filter((c) => c.info);
  const magic = rated.reduce((s, c) => s + c.info!.magic, 0);
  const attack = rated.reduce((s, c) => s + c.info!.attack, 0);
  return {
    champions: list.map((c) => ({ id: c.id, name: c.name, tags: c.tags })),
    frontline: list.filter((c) => c.tags.includes("Tank") || c.tags.includes("Fighter")).length,
    classes,
    magicShare: rated.length && magic + attack > 0 ? magic / (magic + attack) : null,
    unrated: list.length - rated.length,
  };
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** What separates the player's wins from their losses on this champion (own data only). */
function personalWinCondition(games: MatchAnalysis[], name: string): DraftPoint | null {
  const wins = games.filter((g) => g.win);
  const losses = games.filter((g) => !g.win);
  if (wins.length < 5 || losses.length < 5) return null;
  const metrics: [string, (a: MatchAnalysis) => number | null, boolean, number][] = [
    ["deaths before minute 14", (a) => a.earlyDeaths, false, 1],
    ["CS per minute", (a) => a.csPerMin, true, 1],
    ["kill participation", (a) => a.killParticipation, true, 2],
    ["gold vs your opponent at 10:00", (a) => a.goldDiff10, true, 0],
  ];
  let best: { label: string; w: number; l: number; t: number; digits: number } | null = null;
  for (const [label, pick, , digits] of metrics) {
    const w = wins.map(pick).filter((v): v is number => v !== null);
    const l = losses.map(pick).filter((v): v is number => v !== null);
    const cmp = compareMeans(w, l, 5);
    if (cmp.consolidated && (!best || Math.abs(cmp.t) > Math.abs(best.t))) best = { label, w: cmp.a, l: cmp.b, t: cmp.t, digits };
  }
  if (!best) return null;
  const fmt = (x: number) => (best!.label.startsWith("kill participation") ? pct(x) : x.toFixed(best!.digits));
  return {
    id: "personal-wincon",
    kind: "observation",
    title: `On ${name}, what separates your wins from your losses most is your ${best.label}`,
    detail: `${fmt(best.w)} in wins versus ${fmt(best.l)} in losses (${wins.length} wins, ${losses.length} losses). It is a difference observed in your games, not a proven cause.`,
    weight: 0.9,
  };
}

export function analyzeDraft(input: DraftInput, knowledge: Champion[], history: MatchAnalysis[]): DraftAnalysis {
  const champions = new Map(knowledge.map((c) => [c.id, c]));
  const allyIds = [input.myChampion, ...input.allies.filter((a) => a !== input.myChampion)];
  const unknownChampions = [...allyIds, ...input.enemies].filter((id) => !champions.has(id));
  const ally = composition(allyIds, champions);
  const enemy = composition(input.enemies, champions);
  const me = champions.get(input.myChampion);
  const myName = me?.name ?? input.myChampion;
  const points: DraftPoint[] = [];

  // Enemy damage profile (hypothesis from ratings)
  if (enemy.magicShare !== null && enemy.champions.length >= 3) {
    if (enemy.magicShare >= 0.65 || enemy.magicShare <= 0.35) {
      const magic = enemy.magicShare >= 0.65;
      points.push({
        id: "enemy-damage",
        kind: "hypothesis",
        title: `The enemy damage looks mostly ${magic ? "magic" : "physical"}`,
        detail: `Based on Data Dragon's ratings, around ${pct(magic ? enemy.magicShare : 1 - enemy.magicShare)} of their damage profile is ${magic ? "magic" : "physical"}. If you buy defense, ${magic ? "magic resist" : "armor"} will likely pay off more. Check it against their builds in game.`,
        weight: 0.8,
      });
    }
  }
  if (ally.magicShare !== null && ally.champions.length >= 3 && (ally.magicShare >= 0.75 || ally.magicShare <= 0.25)) {
    const magic = ally.magicShare >= 0.75;
    points.push({
      id: "ally-damage",
      kind: "hypothesis",
      title: `Your team relies heavily on ${magic ? "magic" : "physical"} damage`,
      detail: `If the enemy stacks ${magic ? "magic resist" : "armor"}, your team may struggle more. It is an estimate from general ratings.`,
      weight: 0.6,
    });
  }

  // Frontline (fact about tags, hypothesis about the consequence)
  if (ally.champions.length >= 3 && ally.frontline === 0) {
    points.push({
      id: "no-frontline",
      kind: "hypothesis",
      title: "Your team has no clear frontline",
      detail: "No ally has the Tank or Fighter tag. Long head-on fights may be hard for you; fighting with a positional advantage usually matters more.",
      weight: 0.7,
    });
  } else if (enemy.frontline >= 3 && ally.frontline <= 1) {
    points.push({
      id: "frontline-gap",
      kind: "hypothesis",
      title: "The enemy has much more frontline",
      detail: `${enemy.frontline} enemies are Tank or Fighter versus ${ally.frontline} on your team.`,
      weight: 0.55,
    });
  }
  if ((enemy.classes["Assassin"] ?? 0) >= 2) {
    points.push({
      id: "enemy-assassins",
      kind: "hypothesis",
      title: "Several assassins on the enemy team",
      detail: "With two or more Assassin champions, they usually look for picks on squishy targets; vision and not walking alone become more important.",
      weight: 0.5,
    });
  }

  // Personal layer (facts from the player's own games)
  const mine = history.filter((a) => a.analyzable && a.championName === input.myChampion);
  const wins = mine.filter((a) => a.win).length;
  const vs = input.laneOpponent ? mine.filter((a) => a.laneOpponentChampion === input.laneOpponent) : null;
  const opponentName = input.laneOpponent ? champions.get(input.laneOpponent)?.name ?? input.laneOpponent : null;
  if (mine.length === 0) {
    points.push({ id: "new-champion", kind: "fact", title: `You have no analyzed games on ${myName} yet`, detail: "There is no personal history to lean on for this champion.", weight: 0.4 });
  } else {
    points.push({
      id: "champion-record",
      kind: "fact",
      title: `On ${myName}: ${wins} ${wins === 1 ? "win" : "wins"} in ${mine.length} ${mine.length === 1 ? "game" : "games"}`,
      detail: mine.length < 10 ? "It is a small sample; take it as a reference, not a trend." : `Likely win-rate range: ${pct(wilson(wins, mine.length).low)}–${pct(wilson(wins, mine.length).high)}.`,
      weight: 0.45,
    });
  }
  if (vs && opponentName) {
    const vsWins = vs.filter((a) => a.win).length;
    points.push({
      id: "matchup-record",
      kind: "fact",
      title: vs.length ? `Against ${opponentName} in lane: ${vsWins} of ${vs.length}` : `You have no games on ${myName} against ${opponentName} in lane`,
      detail: vs.length && vs.length < 5 ? "Too few games to draw conclusions." : "",
      weight: vs.length >= 3 ? 0.65 : 0.35,
    });
  }
  const wincon = personalWinCondition(mine, myName);
  if (wincon) points.push(wincon);

  points.sort((a, b) => b.weight - a.weight);
  return {
    version: DRAFT_VERSION,
    ally,
    enemy,
    keyPoints: points.slice(0, 3),
    morePoints: points.slice(3),
    personal: {
      withChampion: { games: mine.length, wins, interval: wilson(wins, mine.length) },
      vsOpponent: vs ? { games: vs.length, wins: vs.filter((a) => a.win).length } : null,
    },
    unknownChampions,
    limits: DRAFT_LIMITS,
  };
}
