import type { AnalysisMode, Role } from "@coach/domain";
import type { MatchAnalysis } from "./match.js";
import { mean, wilson } from "./stats.js";

/**
 * Descriptive player summary built only from the player's own games (the
 * player is compared against themselves, never against external benchmarks).
 */
export interface ChampionSummary {
  championName: string;
  games: number;
  wins: number;
}

export interface ModeSummary {
  mode: AnalysisMode;
  games: number;
  wins: number;
  winRate: number;
  winRateInterval: { low: number; high: number };
  avgKda: number;
  avgKillParticipation: number | null;
  avgDamageShare: number | null;
  avgCsPerMin: number | null;
  avgGoldDiff10: number | null;
  mainRole: Role | null;
  champions: ChampionSummary[];
}

export interface ProfileSummary {
  totalGames: number;
  analyzableGames: number;
  timelineCoverage: number;
  modes: ModeSummary[];
}

const defined = (xs: (number | null)[]) => xs.filter((x): x is number => x !== null);
const avgOrNull = (xs: (number | null)[]) => {
  const d = defined(xs);
  return d.length ? mean(d) : null;
};

export function summarize(analyses: MatchAnalysis[]): ProfileSummary {
  const usable = analyses.filter((a) => a.analyzable);
  const modes = [...new Set(usable.map((a) => a.mode))].map((mode): ModeSummary => {
    const games = usable.filter((a) => a.mode === mode);
    const wins = games.filter((a) => a.win).length;
    const roleCounts = new Map<Role, number>();
    for (const g of games) if (g.role !== "NONE") roleCounts.set(g.role, (roleCounts.get(g.role) ?? 0) + 1);
    const mainRole = [...roleCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const champMap = new Map<string, ChampionSummary>();
    for (const g of games) {
      const c = champMap.get(g.championName) ?? { championName: g.championName, games: 0, wins: 0 };
      c.games++;
      if (g.win) c.wins++;
      champMap.set(g.championName, c);
    }
    return {
      mode,
      games: games.length,
      wins,
      winRate: games.length ? wins / games.length : 0,
      winRateInterval: wilson(wins, games.length),
      avgKda: mean(games.map((g) => g.kda)),
      avgKillParticipation: avgOrNull(games.map((g) => g.killParticipation)),
      avgDamageShare: avgOrNull(games.map((g) => g.damageShare)),
      avgCsPerMin: avgOrNull(games.map((g) => g.csPerMin)),
      avgGoldDiff10: avgOrNull(games.map((g) => g.goldDiff10)),
      mainRole,
      champions: [...champMap.values()].sort((a, b) => b.games - a.games),
    };
  });
  return {
    totalGames: analyses.length,
    analyzableGames: usable.length,
    timelineCoverage: usable.length ? usable.filter((a) => a.hasTimeline).length / usable.length : 0,
    modes: modes.sort((a, b) => b.games - a.games),
  };
}
