import { wilson, type MatchAnalysis } from "@coach/analysis";

/**
 * Champion Pool and Matchup Pool (F6): how each of your champions and lane matchups goes,
 * from your own Summoner's Rift games only. A verdict is only given when the win rate is
 * clearly away from 50% (95% Wilson interval) over enough games; otherwise it says so.
 */
export type PoolVerdict = "strong" | "weak" | "even" | "few";

/** Games needed before any verdict. */
export const MIN_POOL_GAMES = 5;

export interface PoolEntry {
  /** Champion (champion pool) or lane opponent (matchup pool). */
  name: string;
  games: number;
  wins: number;
  interval: { low: number; high: number };
  verdict: PoolVerdict;
  /** (kills + assists) / deaths over all the games. */
  kda: number;
  /** Mean over games that have the metric; null when none do. */
  csPerMin: number | null;
  goldDiff15: number | null;
  csDiff15: number | null;
  lastPlayed: number;
}

const avg = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
};

function entry(name: string, games: MatchAnalysis[]): PoolEntry {
  const wins = games.filter((g) => g.win).length;
  const interval = wilson(wins, games.length);
  const verdict: PoolVerdict = games.length < MIN_POOL_GAMES ? "few" : interval.low > 0.5 ? "strong" : interval.high < 0.5 ? "weak" : "even";
  const k = games.reduce((s, g) => s + g.kills + g.assists, 0);
  const d = games.reduce((s, g) => s + g.deaths, 0);
  return {
    name,
    games: games.length,
    wins,
    interval,
    verdict,
    kda: Math.round((k / Math.max(1, d)) * 100) / 100,
    csPerMin: avg(games.map((g) => (g.role === "UTILITY" ? null : g.csPerMin))),
    goldDiff15: avg(games.map((g) => g.goldDiff15)),
    csDiff15: avg(games.map((g) => g.csDiff15)),
    lastPlayed: Math.max(...games.map((g) => g.startedAt)),
  };
}

const rift = (analyses: MatchAnalysis[]) => analyses.filter((a) => a.analyzable && a.mode === "summoners_rift");

function group(analyses: MatchAnalysis[], key: (a: MatchAnalysis) => string | null): PoolEntry[] {
  const by = new Map<string, MatchAnalysis[]>();
  for (const a of analyses) {
    const k = key(a);
    if (!k) continue;
    let list = by.get(k);
    if (!list) { list = []; by.set(k, list); }
    list.push(a);
  }
  return [...by].map(([name, games]) => entry(name, games))
    .sort((a, b) => b.games - a.games || b.lastPlayed - a.lastPlayed || a.name.localeCompare(b.name));
}

export function championPool(analyses: MatchAnalysis[]): PoolEntry[] {
  return group(rift(analyses), (a) => a.championName);
}

/** Lane opponents you have faced, optionally only while playing one champion. */
export function matchupPool(analyses: MatchAnalysis[], champion?: string): PoolEntry[] {
  return group(rift(analyses).filter((a) => !champion || a.championName === champion), (a) => a.laneOpponentChampion);
}

/** Games per local day are binned by the client (it knows the time zone); this is the raw list. */
export function activity(analyses: MatchAnalysis[], since: number): { t: number; win: boolean; mode: MatchAnalysis["mode"]; analyzable: boolean }[] {
  return analyses.filter((a) => a.startedAt >= since).map((a) => ({ t: a.startedAt, win: a.win, mode: a.mode, analyzable: a.analyzable }))
    .sort((a, b) => a.t - b.t);
}
