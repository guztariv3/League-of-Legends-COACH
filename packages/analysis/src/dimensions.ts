import type { AnalysisMode, Role } from "@coach/domain";
import type { MatchAnalysis } from "./match.js";
import { findInflection, MIN_SIDE, testableGames, type LongMetricId } from "./longitudinal.js";
import { mean, sampleConfidence, twoProportionZ, wilson } from "./stats.js";

/**
 * Player profile (the internal "Player DNA", brief §45–46): contextual
 * dimensions measured only against the player's own games. There is no
 * overall score and no external benchmark. The UI shows the conclusions,
 * and the numbers stay available as evidence.
 */

export type GameState = "ahead" | "even" | "behind";

/**
 * Team gold difference at 15:00 that separates "ahead/behind" from "even".
 * A product heuristic (not a Riot constant); documented in docs/06-fase2.md.
 */
export const GAME_STATE_THRESHOLD = 1500;

export function gameStateOf(a: MatchAnalysis): GameState | null {
  if (a.teamGoldDiff15 === null || a.teamGoldDiff15 === undefined) return null;
  if (a.teamGoldDiff15 >= GAME_STATE_THRESHOLD) return "ahead";
  if (a.teamGoldDiff15 <= -GAME_STATE_THRESHOLD) return "behind";
  return "even";
}

export interface StateBucket {
  state: GameState;
  games: number;
  wins: number;
  winRate: number;
  interval: { low: number; high: number };
  /** Deaths per minute after 15:00. */
  lateDeathsPerMin: number | null;
}

export function gameStateSplit(analyses: MatchAnalysis[]): StateBucket[] {
  const sr = analyses.filter((a) => a.analyzable && a.mode === "summoners_rift");
  return (["ahead", "even", "behind"] as const).map((state) => {
    const games = sr.filter((a) => gameStateOf(a) === state);
    const wins = games.filter((a) => a.win).length;
    const late = games
      .filter((a) => a.deathsAfter15 !== null && a.durationSec > 15 * 60)
      .map((a) => a.deathsAfter15! / ((a.durationSec - 15 * 60) / 60));
    return {
      state,
      games: games.length,
      wins,
      winRate: games.length ? wins / games.length : 0,
      interval: wilson(wins, games.length),
      lateDeathsPerMin: late.length ? mean(late) : null,
    };
  });
}

export type Trend = "improving" | "declining" | "stable" | "unknown";

export interface Dimension {
  id: "lane" | "farm" | "risk" | "teamfight" | "vision" | "state" | "pool";
  label: string;
  /** One-line conclusion (layer 1). */
  headline: string;
  /** Evidence (layer 2). */
  metrics: { label: string; value: string }[];
  sampleSize: number;
  confidence: number;
  trend: Trend;
}

export interface ModeProfile {
  mode: AnalysisMode;
  mainRole: Role | null;
  games: number;
  dimensions: Dimension[];
}

const f1 = (x: number) => x.toFixed(1);
const f2 = (x: number) => x.toFixed(2);
const pct = (x: number) => `${Math.round(x * 100)}%`;
const signed = (x: number) => `${x > 0 ? "+" : ""}${Math.round(x)}`;

function values(list: MatchAnalysis[], pick: (a: MatchAnalysis) => number | null): number[] {
  return list.map(pick).filter((v): v is number => v !== null && Number.isFinite(v));
}

/**
 * Trend = a permutation-tested inflection point (longitudinal.ts) whose
 * "after" segment reaches the present. It is the same definition used by the
 * Coach's insights, so the profile and the Coach never disagree.
 */
function trendOf(list: MatchAnalysis[], metric: LongMetricId | null): Trend {
  if (!metric) return "unknown";
  // Count exactly the games the test would use (main role only), so "stable" always means "tested, no change".
  if (testableGames(list, metric) < 2 * MIN_SIDE) return "unknown";
  const inf = findInflection(list, metric);
  return inf ? (inf.direction === "improved" ? "improving" : "declining") : "stable";
}

const TREND_METRIC: Partial<Record<Dimension["id"], LongMetricId>> = {
  lane: "goldDiff10",
  farm: "csPerMin",
  vision: "visionPerMin",
  risk: "deathsPerMin",
  teamfight: "killParticipation",
};

function metricDimension(
  id: Dimension["id"],
  label: string,
  list: MatchAnalysis[],
  pick: (a: MatchAnalysis) => number | null,
  _higherIsBetter: boolean,
  describe: (avg: number) => string,
  extra: (v: number[]) => { label: string; value: string }[] = () => [],
): Dimension | null {
  const v = values(list, pick);
  if (v.length < 5) return null;
  const avg = mean(v);
  return {
    id,
    label,
    headline: describe(avg),
    metrics: extra(v),
    sampleSize: v.length,
    confidence: Math.round(sampleConfidence(v.length, v.length / Math.max(1, list.length)) * 100) / 100,
    trend: list[0]?.mode === "summoners_rift" ? trendOf(list, TREND_METRIC[id] ?? null) : "unknown",
  };
}

export function buildProfile(analyses: MatchAnalysis[]): ModeProfile[] {
  const usable = analyses.filter((a) => a.analyzable).sort((a, b) => b.startedAt - a.startedAt);
  const profiles: ModeProfile[] = [];

  for (const mode of ["summoners_rift", "aram"] as const) {
    const games = usable.filter((a) => a.mode === mode);
    if (games.length < 5) continue;
    const roleCounts = new Map<Role, number>();
    for (const g of games) if (g.role !== "NONE") roleCounts.set(g.role, (roleCounts.get(g.role) ?? 0) + 1);
    const mainRole = [...roleCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    // Role-dependent metrics use the main role only, so different roles are not mixed.
    const roleGames = mode === "summoners_rift" && mainRole ? games.filter((g) => g.role === mainRole) : games;

    const dims: (Dimension | null)[] = [];
    if (mode === "summoners_rift") {
      dims.push(
        metricDimension("lane", "Laning phase", roleGames, (a) => a.goldDiff10, true,
          (avg) => `Gold vs your lane opponent at minute 10: ${signed(avg)}`,
          (v) => [{ label: "Games ahead at 10:00", value: pct(v.filter((x) => x > 0).length / v.length) }]),
        mainRole === "UTILITY"
          ? null // CS is not a meaningful measure for supports
          : metricDimension("farm", "Farming", roleGames, (a) => a.csPerMin, true, (avg) => `CS per minute: ${f1(avg)}`),
        metricDimension("vision", "Vision", roleGames, (a) => a.visionPerMin, true, (avg) => `Vision per minute: ${f2(avg)}`),
      );
    }
    dims.push(
      metricDimension("risk", "Risk", games, (a) => a.deathsPerMin, false,
        (avg) => `Deaths per minute: ${f2(avg)}`,
        () => {
          const early = values(games, (a) => a.earlyDeaths);
          return early.length ? [{ label: "Deaths before 14:00 (average)", value: f1(mean(early)) }] : [];
        }),
      metricDimension("teamfight", "Teamfights", games, (a) => a.killParticipation, true,
        (avg) => `Kill participation: ${pct(avg)}`,
        () => {
          const dmg = values(games, (a) => a.damageShare);
          return dmg.length ? [{ label: "Team damage share (average)", value: pct(mean(dmg)) }] : [];
        }),
    );

    if (mode === "summoners_rift") {
      const split = gameStateSplit(games);
      const known = split.reduce((s, b) => s + b.games, 0);
      if (known >= 10) {
        const ahead = split[0]!;
        const behind = split[2]!;
        const parts: string[] = [];
        if (ahead.games >= 3) parts.push(`ahead at 15:00 you win ${ahead.wins} of ${ahead.games}`);
        if (behind.games >= 3) parts.push(`behind you come back in ${behind.wins} of ${behind.games}`);
        dims.push({
          id: "state",
          label: "By game state",
          headline: parts.length ? `When ${parts.join("; when ")}` : "Still few games clearly ahead or behind",
          metrics: split.map((b) => ({
            label: { ahead: "Ahead", even: "Even", behind: "Behind" }[b.state],
            value: b.games
              ? `${b.wins}/${b.games} wins${b.lateDeathsPerMin !== null ? ` · ${f2(b.lateDeathsPerMin)} deaths/min after 15:00` : ""}`
              : "no games",
          })),
          sampleSize: known,
          confidence: Math.round(sampleConfidence(known) * 100) / 100,
          trend: "unknown",
        });
      }
    }

    const counts = new Map<string, number>();
    for (const g of games) counts.set(g.championName, (counts.get(g.championName) ?? 0) + 1);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    dims.push({
      id: "pool",
      label: "Champions",
      headline: `${counts.size} different champions; your 3 most played make up ${pct(top.slice(0, 3).reduce((s, [, n]) => s + n, 0) / games.length)}`,
      metrics: top.slice(0, 5).map(([c, n]) => ({ label: c, value: `${n} games` })),
      sampleSize: games.length,
      confidence: 1,
      trend: "unknown",
    });

    profiles.push({ mode, mainRole, games: games.length, dimensions: dims.filter((d): d is Dimension => d !== null) });
  }
  return profiles;
}

// ------------------------------------------------------------ cross-champion patterns

export interface ChampionRate {
  championName: string;
  games: number;
  hits: number;
  rate: number;
}

export interface PatternScope {
  /** "global" = shows up on several champions; "champion" = concentrated on one; "none" = not enough evidence. */
  scope: "global" | "champion" | "none";
  champion?: string;
  perChampion: ChampionRate[];
}

/**
 * Is a pattern (e.g. "2+ early deaths") a player-wide habit or tied to one
 * champion? Needs ≥5 games per champion. "champion" requires the champion's
 * rate to be significantly above the rest (two-proportion z ≥ 2).
 */
export function patternScope(
  analyses: MatchAnalysis[],
  hit: (a: MatchAnalysis) => boolean | null,
  minRate = 0.3,
): PatternScope {
  const rows = analyses.filter((a) => a.analyzable).map((a) => ({ a, h: hit(a) })).filter((r): r is { a: MatchAnalysis; h: boolean } => r.h !== null);
  const by = new Map<string, { games: number; hits: number }>();
  for (const { a, h } of rows) {
    const c = by.get(a.championName) ?? { games: 0, hits: 0 };
    c.games++;
    if (h) c.hits++;
    by.set(a.championName, c);
  }
  const perChampion = [...by.entries()]
    .filter(([, c]) => c.games >= 5)
    .map(([championName, c]) => ({ championName, games: c.games, hits: c.hits, rate: c.hits / c.games }))
    .sort((a, b) => b.rate - a.rate);

  const totalHits = rows.filter((r) => r.h).length;
  for (const c of perChampion) {
    const restN = rows.length - c.games;
    const z = twoProportionZ(c.hits, c.games, totalHits - c.hits, restN);
    if (restN >= 5 && z >= 2 && (totalHits - c.hits) / restN < minRate) return { scope: "champion", champion: c.championName, perChampion };
  }
  if (perChampion.filter((c) => c.rate >= minRate).length >= 2) return { scope: "global", perChampion };
  return { scope: "none", perChampion };
}
