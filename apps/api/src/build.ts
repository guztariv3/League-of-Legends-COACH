import type { MatchAnalysis } from "@coach/analysis";
import type { KnowledgeBundle } from "@coach/knowledge";

/**
 * "Your build" with a champion, from the player's own games only (user decision): which big
 * items they finished with, how often, and how those games went. Facts with sample sizes,
 * never an order; nothing is inferred from other players or invented.
 */
export interface BuildItem { id: number; name: string; games: number; wins: number }
export interface PersonalBuild {
  champion: string;
  mode: "summoners_rift" | "aram";
  games: number;
  wins: number;
  items: BuildItem[];
  /** Why there is no suggestion, when there is none. */
  note: string | null;
}

export const MIN_GAMES_FOR_BUILD = 3;
const MIN_GAMES_PER_ITEM = 2;
const MAX_ITEMS = 6;
// Tier-2 boots are cheaper than a big item but are part of every build.
const BOOTS = new Set([3006, 3009, 3020, 3047, 3111, 3117, 3158]);

export function personalBuild(analyses: MatchAnalysis[], champion: string, mode: PersonalBuild["mode"], bundle: KnowledgeBundle | undefined): PersonalBuild {
  const games = analyses.filter((a) => a.analyzable && a.mode === mode && a.championName === champion);
  const wins = games.filter((a) => a.win).length;
  const base = { champion, mode, games: games.length, wins };
  if (games.length < MIN_GAMES_FOR_BUILD) {
    return { ...base, items: [], note: games.length ? `You only have ${games.length} ${games.length === 1 ? "game" : "games"} on this champion in this mode: not enough data yet.` : "You have no games on this champion in this mode yet." };
  }
  // The synthetic catalogue has cheaper items; real Data Dragon items use the Live Coach's threshold.
  const bigGold = bundle?.source === "synthetic" ? 900 : 2200;
  const catalog = new Map((bundle?.items ?? []).map((i) => [i.id, i]));
  const tally = new Map<number, { games: number; wins: number }>();
  for (const g of games) {
    for (const id of new Set(g.items)) {
      const item = catalog.get(id);
      if (!item || (item.goldTotal < bigGold && !BOOTS.has(id))) continue;
      const t = tally.get(id) ?? { games: 0, wins: 0 };
      t.games++;
      if (g.win) t.wins++;
      tally.set(id, t);
    }
  }
  const items = [...tally.entries()]
    .filter(([, t]) => t.games >= MIN_GAMES_PER_ITEM)
    .sort((a, b) => b[1].games - a[1].games || b[1].wins - a[1].wins || a[0] - b[0])
    .slice(0, MAX_ITEMS)
    .map(([id, t]) => ({ id, name: catalog.get(id)!.name, ...t }));
  return { ...base, items, note: items.length ? null : "You do not repeat major items on this champion: no pattern yet." };
}
