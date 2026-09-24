import { quantile, wilson, type MatchAnalysis } from "@coach/analysis";
import type { AnalysisMode } from "@coach/domain";

/**
 * Goals (brief §52–53): optional, at most 3 active, always measurable from
 * the player's own games. A target comes from the player's own better games
 * (no external benchmark). A goal is only "consolidated" when the success rate
 * since accepting it is significantly above the pre-goal baseline across
 * enough games, never after a few good games.
 */

export type GoalMetric = "earlyDeaths" | "csPerMin" | "deathsPerMin" | "goldDiff10" | "visionPerMin" | "killParticipation";

export interface MetricDef {
  label: string;
  /** Unit used when describing the target: [singular, plural]. */
  unit: [string, string];
  higherIsBetter: boolean;
  modes: AnalysisMode[];
  /** Rounding step for targets, so they read naturally. */
  step: number;
  extract: (a: MatchAnalysis) => number | null;
}

export const GOAL_METRICS: Record<GoalMetric, MetricDef> = {
  earlyDeaths: { label: "Muertes antes del minuto 14", unit: ["muerte", "muertes"], higherIsBetter: false, modes: ["summoners_rift"], step: 1, extract: (a) => a.earlyDeaths },
  csPerMin: { label: "CS por minuto", unit: ["CS/min", "CS/min"], higherIsBetter: true, modes: ["summoners_rift"], step: 0.5, extract: (a) => (a.role === "UTILITY" ? null : a.csPerMin) },
  deathsPerMin: { label: "Muertes por minuto", unit: ["muertes/min", "muertes/min"], higherIsBetter: false, modes: ["summoners_rift", "aram"], step: 0.05, extract: (a) => a.deathsPerMin },
  goldDiff10: { label: "Oro frente a tu rival al minuto 10", unit: ["de oro", "de oro"], higherIsBetter: true, modes: ["summoners_rift"], step: 100, extract: (a) => a.goldDiff10 },
  visionPerMin: { label: "Visión por minuto", unit: ["visión/min", "visión/min"], higherIsBetter: true, modes: ["summoners_rift"], step: 0.1, extract: (a) => a.visionPerMin },
  killParticipation: { label: "Participación en kills", unit: ["", ""], higherIsBetter: true, modes: ["summoners_rift", "aram"], step: 0.05, extract: (a) => a.killParticipation },
};

export const MAX_ACTIVE_GOALS = 3;
export const MIN_GAMES_FOR_CONSOLIDATION = 10;

export interface GoalSpec {
  metric: GoalMetric;
  /** Met when value ≤ target (lower is better) or ≥ target (higher is better). */
  target: number;
}

export function goalMet(spec: GoalSpec, a: MatchAnalysis): boolean | null {
  const def = GOAL_METRICS[spec.metric];
  if (!a.analyzable || !def.modes.includes(a.mode)) return null;
  const v = def.extract(a);
  if (v === null || !Number.isFinite(v)) return null;
  return def.higherIsBetter ? v >= spec.target : v <= spec.target;
}

export function describeTarget(spec: GoalSpec): string {
  const def = GOAL_METRICS[spec.metric];
  const n = +spec.target.toFixed(2);
  const value = spec.metric === "killParticipation" ? `${Math.round(spec.target * 100)}%` : `${n} ${def.unit[n === 1 ? 0 : 1]}`.trim();
  return `${def.label}: ${def.higherIsBetter ? "al menos" : "como mucho"} ${value}`;
}

function roundTo(x: number, step: number): number {
  return Math.round(x / step) * step;
}

/** Share of the given games that meet the spec (games without the metric are ignored). */
export function successRate(spec: GoalSpec, games: MatchAnalysis[]): { met: number; n: number; rate: number } {
  const results = games.map((g) => goalMet(spec, g)).filter((x): x is boolean => x !== null);
  const met = results.filter(Boolean).length;
  return { met, n: results.length, rate: results.length ? met / results.length : 0 };
}

/**
 * Proposes a target from the player's own games: the level reached in their
 * better quarter of games. Returns null without enough data (≥ 10 games).
 */
export function proposeTarget(metric: GoalMetric, games: MatchAnalysis[]): { spec: GoalSpec; baselineRate: number; sample: number } | null {
  const def = GOAL_METRICS[metric];
  const values = games
    .filter((g) => g.analyzable && def.modes.includes(g.mode))
    .map(def.extract)
    .filter((v): v is number => v !== null && Number.isFinite(v));
  if (values.length < 10) return null;
  const raw = quantile(values, def.higherIsBetter ? 0.75 : 0.25);
  const spec = { metric, target: roundTo(raw, def.step) };
  return { spec, baselineRate: successRate(spec, games).rate, sample: values.length };
}

export type GoalStatus = "collecting" | "in_progress" | "consolidated";

export interface GoalProgress {
  games: number;
  met: number;
  rate: number;
  interval: { low: number; high: number };
  baselineRate: number;
  status: GoalStatus;
  summary: string;
}

/** Progress on games played since the goal was accepted. */
export function evaluateGoal(spec: GoalSpec, baselineRate: number, since: MatchAnalysis[]): GoalProgress {
  const { met, n, rate } = successRate(spec, since);
  const interval = wilson(met, n);
  const consolidated = n >= MIN_GAMES_FOR_CONSOLIDATION && interval.low > baselineRate;
  const status: GoalStatus = n === 0 ? "collecting" : consolidated ? "consolidated" : "in_progress";
  const base = `${Math.round(baselineRate * 100)}%`;
  const summary =
    n === 0
      ? "Aún no hay partidas desde que aceptaste este objetivo."
      : consolidated
        ? `Lo cumples en ${met} de ${n} partidas, claramente por encima de tu ${base} anterior. Parece un hábito consolidado.`
        : n < MIN_GAMES_FOR_CONSOLIDATION
          ? `Lo cumples en ${met} de ${n} partidas (antes: ${base}). Hacen falta al menos ${MIN_GAMES_FOR_CONSOLIDATION} partidas para saber si es un cambio real.`
          : `Lo cumples en ${met} de ${n} partidas (antes: ${base}). Todavía no se distingue de la variación normal.`;
  return { games: n, met, rate, interval, baselineRate, status, summary };
}

export interface GoalSuggestion {
  metric: GoalMetric;
  target: number;
  title: string;
  reason: string;
  baselineRate: number;
  sourceInsightId: string;
}

/**
 * Turns high-value insights into at most `max` goal suggestions, skipping
 * metrics that already have a goal. Suggestions are never activated
 * automatically; the player accepts or rejects them.
 */
export function suggestGoals(
  insights: { id: string; metric?: GoalMetric; title: string; priority: string }[],
  games: MatchAnalysis[],
  existingMetrics: GoalMetric[],
  max = 1,
): GoalSuggestion[] {
  const out: GoalSuggestion[] = [];
  for (const i of insights) {
    if (out.length >= max) break;
    if (!i.metric || existingMetrics.includes(i.metric) || i.priority !== "important") continue;
    const proposal = proposeTarget(i.metric, games);
    if (!proposal) continue;
    out.push({
      metric: i.metric,
      target: proposal.spec.target,
      title: describeTarget(proposal.spec),
      reason: `Basado en: “${i.title}”. El objetivo es el nivel que ya alcanzas en tu mejor cuarta parte de partidas (ahora lo cumples en el ${Math.round(proposal.baselineRate * 100)}%).`,
      baselineRate: proposal.baselineRate,
      sourceInsightId: i.id,
    });
  }
  return out;
}
