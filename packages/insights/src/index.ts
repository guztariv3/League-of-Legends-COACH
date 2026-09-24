import { compareMeans, gameStateOf, mean, patternScope, sampleConfidence, type MatchAnalysis } from "@coach/analysis";
import type { GoalMetric } from "./goals.js";

export * from "./goals.js";

/**
 * Insight pipeline (the single "decision engine"):
 *   detectors → candidates (with evidence) → confidence → priority → anti-spam → output.
 *
 * Deterministic by design: the LLM may later rephrase an insight, but never
 * decides whether it exists, its priority or its epistemic kind.
 */
export const INSIGHTS_VERSION = 2;

/** fact = directly observed · observation = pattern across games · hypothesis = interpretation. */
export type InsightKind = "fact" | "observation" | "hypothesis";
export type Priority = "critical" | "important" | "info" | "suppressed";

export interface Evidence {
  label: string;
  value: string;
}

export interface Insight {
  id: string;
  kind: InsightKind;
  priority: Priority;
  /** 0..1 */
  confidence: number;
  /** One-line conclusion (layer 1). */
  title: string;
  /** Context (layer 2). */
  detail: string;
  /** Evidence (layer 3). */
  evidence: Evidence[];
  sampleSize: number;
  /** Match ids backing the insight, for drill-down. */
  matchIds: string[];
  /** Measurable metric this insight is about (links it to goals and focus). */
  metric?: GoalMetric;
  /** What to look at when reviewing games: a suggestion, never an order. */
  review?: string;
}

export interface InsightContext {
  analyses: MatchAnalysis[];
  dataSource: "riot" | "synthetic";
}

interface Candidate extends Omit<Insight, "priority" | "confidence"> {
  impact: number; // 0..1, how much it matters for improvement
  completeness: number; // 0..1, share of games with the data needed
}

// ------------------------------------------------------------ confidence

/**
 * Confidence from sample size, completeness and epistemic kind. Hypotheses are
 * capped below observations and facts, so an interpretation never reads
 * stronger than what was measured.
 */
export function confidenceFor(c: Pick<Candidate, "sampleSize" | "completeness" | "kind">): number {
  const kindCap = c.kind === "fact" ? 1 : c.kind === "observation" ? 0.9 : 0.7;
  return Math.round(Math.min(kindCap, sampleConfidence(c.sampleSize, c.completeness)) * 100) / 100;
}

export const MIN_CONFIDENCE = 0.45;

function prioritize(c: Candidate, confidence: number): Priority {
  if (confidence < MIN_CONFIDENCE) return "suppressed";
  // "critical" is reserved for the live/safety context; post-game insights top out at "important".
  return c.impact >= 0.6 ? "important" : "info";
}

// ------------------------------------------------------------ detectors

const pct = (x: number) => `${Math.round(x * 100)}%`;
const fmt = (x: number, d = 1) => x.toFixed(d);

type Detector = (ctx: InsightContext, usable: MatchAnalysis[]) => Candidate | null;

const earlyDeaths: Detector = (_ctx, usable) => {
  const sr = usable.filter((a) => a.mode === "summoners_rift");
  const withTl = sr.filter((a) => a.earlyDeaths !== null);
  if (withTl.length < 8) return null;
  const heavy = withTl.filter((a) => (a.earlyDeaths ?? 0) >= 2);
  const share = heavy.length / withTl.length;
  if (share < 0.3) return null;
  const lossRateHeavy = heavy.filter((a) => !a.win).length / Math.max(1, heavy.length);
  const light = withTl.filter((a) => (a.earlyDeaths ?? 0) < 2);
  const lossRateLight = light.filter((a) => !a.win).length / Math.max(1, light.length);
  // Global habit or tied to one champion? (brief §80)
  const scope = patternScope(withTl, (a) => (a.earlyDeaths === null ? null : a.earlyDeaths >= 2));
  const scopeText =
    scope.scope === "champion"
      ? ` Se concentra sobre todo en ${scope.champion}; con tus otros campeones ocurre bastante menos.`
      : scope.scope === "global"
        ? " Ocurre con varios de tus campeones, así que parece un hábito general más que algo del campeón."
        : "";
  return {
    id: "early-deaths",
    kind: "observation",
    title:
      scope.scope === "champion"
        ? `Con ${scope.champion} mueres 2 o más veces antes del minuto 14 mucho más que con el resto`
        : `Mueres 2 o más veces antes del minuto 14 en ${heavy.length} de ${withTl.length} partidas`,
    detail:
      `En esas partidas perdiste el ${pct(lossRateHeavy)}; en el resto, el ${pct(lossRateLight)}. ` +
      "Es una correlación, no prueba que las muertes causen la derrota, pero merece revisarlo." +
      scopeText,
    evidence: [
      { label: "Partidas con timeline (SR)", value: String(withTl.length) },
      { label: "Con 2+ muertes antes del 14", value: String(heavy.length) },
      { label: "Media de muertes tempranas", value: fmt(mean(withTl.map((a) => a.earlyDeaths ?? 0))) },
      ...scope.perChampion.slice(0, 3).map((c) => ({ label: c.championName, value: `${c.hits} de ${c.games}` })),
    ],
    metric: "earlyDeaths",
    review: "Abre esas partidas y mira las muertes antes del 14: qué información tenías del jungla rival y cuánta vida y recursos te quedaban.",
    sampleSize: withTl.length,
    matchIds: heavy.map((a) => a.matchId),
    impact: 0.8,
    completeness: withTl.length / Math.max(1, sr.length),
  };
};

const ROLE_ES: Record<string, string> = { TOP: "top", JUNGLE: "jungla", MIDDLE: "mid", BOTTOM: "ADC", UTILITY: "support" };

function trendDetector(
  id: string,
  goalMetric: GoalMetric,
  metric: (a: MatchAnalysis) => number | null,
  name: string,
  unit: string,
  higherIsBetter: boolean,
): Detector {
  return (_ctx, usable) => {
    const sr = usable.filter((a) => a.mode === "summoners_rift");
    const mainRole = mode(sr.map((a) => a.role));
    const sameRole = sr.filter((a) => a.role === mainRole);
    const values = sameRole.map((a) => ({ a, v: metric(a) })).filter((x): x is { a: MatchAnalysis; v: number } => x.v !== null);
    if (values.length < 16) return null;
    const recent = values.slice(0, 10);
    const before = values.slice(10);
    const cmp = compareMeans(recent.map((x) => x.v), before.map((x) => x.v));
    if (!cmp.consolidated) return null;
    const improved = higherIsBetter ? cmp.diff > 0 : cmp.diff < 0;
    return {
      id,
      kind: "observation",
      title: improved
        ? `Tu ${name} ha mejorado en tus últimas 10 partidas de ${ROLE_ES[mainRole ?? ""] ?? mainRole}`
        : `Tu ${name} ha bajado en tus últimas 10 partidas de ${ROLE_ES[mainRole ?? ""] ?? mainRole}`,
      detail: `Pasa de ${fmt(cmp.b)}${unit} a ${fmt(cmp.a)}${unit}. El cambio supera la variación normal entre partidas, pero puede deberse a otros factores (campeón, parche o rivales).`,
      evidence: [
        { label: "Últimas 10", value: `${fmt(cmp.a)}${unit}` },
        { label: `Anteriores ${before.length}`, value: `${fmt(cmp.b)}${unit}` },
        { label: "Estadístico t (Welch)", value: fmt(cmp.t, 2) },
      ],
      sampleSize: values.length,
      matchIds: recent.map((x) => x.a.matchId),
      impact: improved ? 0.5 : 0.7,
      completeness: values.length / Math.max(1, sameRole.length),
      metric: goalMetric,
    };
  };
}

/** Leads that end in defeat (brief §34): a fact, with the counts. */
const lostLeads: Detector = (_ctx, usable) => {
  const ahead = usable.filter((a) => gameStateOf(a) === "ahead");
  if (ahead.length < 8) return null;
  const lost = ahead.filter((a) => !a.win);
  if (lost.length < 3 || lost.length / ahead.length < 0.3) return null;
  return {
    id: "lost-leads",
    kind: "fact",
    title: `Has perdido ${lost.length} de ${ahead.length} partidas en las que tu equipo iba por delante al minuto 15`,
    detail: "Ir por delante al 15 significa una ventaja de oro del equipo de al menos 1500. Revisar qué pasó después puede enseñar mucho.",
    evidence: [
      { label: "Partidas por delante al 15", value: String(ahead.length) },
      { label: "Perdidas", value: String(lost.length) },
    ],
    sampleSize: ahead.length,
    matchIds: lost.map((a) => a.matchId),
    impact: 0.7,
    completeness: 1,
    review: "En esas partidas, fíjate en tus muertes a partir del 15 y en qué objetivos se perdieron justo después.",
  };
};

/** Does the player die more after 15:00 when ahead than in even games? (observation) */
const lateDeathsWhenAhead: Detector = (_ctx, usable) => {
  const rate = (a: MatchAnalysis) =>
    a.deathsAfter15 !== null && a.durationSec > 15 * 60 ? a.deathsAfter15 / ((a.durationSec - 15 * 60) / 60) : null;
  const ahead = usable.filter((a) => gameStateOf(a) === "ahead").map(rate).filter((x): x is number => x !== null);
  const even = usable.filter((a) => gameStateOf(a) === "even").map(rate).filter((x): x is number => x !== null);
  const cmp = compareMeans(ahead, even);
  if (!cmp.consolidated || cmp.diff <= 0) return null;
  return {
    id: "late-deaths-ahead",
    kind: "observation",
    title: "Cuando tu equipo va por delante, mueres más a partir del minuto 15 que en partidas igualadas",
    detail: `${fmt(cmp.a, 2)} muertes por minuto por delante frente a ${fmt(cmp.b, 2)} en partidas igualadas. Puede ser una forma de arriesgar de más con ventaja, aunque también influyen el campeón y la partida.`,
    evidence: [
      { label: "Por delante (muertes/min tras el 15)", value: fmt(cmp.a, 2) },
      { label: "Igualadas (muertes/min tras el 15)", value: fmt(cmp.b, 2) },
      { label: "Partidas por delante / igualadas", value: `${ahead.length} / ${even.length}` },
    ],
    sampleSize: ahead.length + even.length,
    matchIds: [],
    impact: 0.65,
    completeness: 1,
    metric: "deathsPerMin",
    review: "Busca en esas partidas las muertes tras el 15: ¿estabas lejos de tu equipo o sin visión?",
  };
};

const championPool: Detector = (_ctx, usable) => {
  if (usable.length < 10) return null;
  const counts = new Map<string, number>();
  for (const a of usable) counts.set(a.championName, (counts.get(a.championName) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const topShare = top.reduce((s, [, n]) => s + n, 0) / usable.length;
  return {
    id: "champion-pool",
    kind: "fact",
    title: `Tus 3 campeones más jugados suman el ${pct(topShare)} de tus partidas`,
    detail: top.map(([c, n]) => `${c} (${n})`).join(", "),
    evidence: top.map(([c, n]) => ({ label: c, value: `${n} partidas` })),
    sampleSize: usable.length,
    matchIds: [],
    impact: 0.3,
    completeness: 1,
  };
};

function mode<T>(xs: T[]): T | undefined {
  const m = new Map<T, number>();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

const DETECTORS: Detector[] = [
  earlyDeaths,
  trendDetector("cs-trend", "csPerMin", (a) => a.csPerMin, "CS por minuto", "", true),
  trendDetector("gold10-trend", "goldDiff10", (a) => a.goldDiff10, "diferencia de oro al minuto 10", " de oro", true),
  lostLeads,
  lateDeathsWhenAhead,
  championPool,
];

// ------------------------------------------------------------ pipeline

export interface InsightResult {
  insights: Insight[];
  /** Set when there is not enough reliable data to say anything useful. */
  insufficientData: boolean;
}

export interface InsightOptions {
  maxVisible?: number;
  /** The player's chosen focus (brief §110): matching insights go first; others are not hidden. */
  focus?: GoalMetric | null;
  /** Insight ids the player marked as not useful (Coach memory → corrections). */
  dismissed?: string[];
}

export function generateInsights(ctx: InsightContext, opts: InsightOptions = {}): InsightResult {
  const { maxVisible = 3, focus = null, dismissed = [] } = opts;
  const usable = ctx.analyses.filter((a) => a.analyzable).sort((a, b) => b.startedAt - a.startedAt);
  if (usable.length < 5) return { insights: [], insufficientData: true };

  const all: Insight[] = [];
  for (const detect of DETECTORS) {
    const c = detect(ctx, usable);
    if (!c) continue;
    const confidence = confidenceFor(c);
    const { impact: _i, completeness: _c, ...rest } = c;
    all.push({ ...rest, confidence, priority: prioritize(c, confidence) });
  }

  const order: Record<Priority, number> = { critical: 0, important: 1, info: 2, suppressed: 3 };
  const visible = all
    .filter((i) => i.priority !== "suppressed" && !dismissed.includes(i.id))
    .sort(
      (a, b) =>
        Number(b.metric !== undefined && b.metric === focus) - Number(a.metric !== undefined && a.metric === focus) ||
        order[a.priority] - order[b.priority] ||
        b.confidence - a.confidence,
    )
    .slice(0, maxVisible);

  return { insights: visible, insufficientData: visible.length === 0 };
}

/** One short, deterministic line for a single match in the Match Center. */
export function matchHeadline(a: MatchAnalysis, averages: { deathsPerMin: number; kda: number }): string | null {
  if (!a.analyzable) return null;
  if (a.earlyDeaths !== null && a.earlyDeaths >= 3) return `${a.earlyDeaths} muertes antes del minuto 14`;
  if (a.goldDiff15 !== null && Math.abs(a.goldDiff15) >= 1500) {
    return a.goldDiff15 > 0
      ? `+${Math.round(a.goldDiff15)} de oro sobre tu rival de línea al 15`
      : `${Math.round(a.goldDiff15)} de oro frente a tu rival de línea al 15`;
  }
  if (averages.kda > 0 && a.kda >= averages.kda * 1.8 && a.kda >= 4) return "Uno de tus mejores KDA recientes";
  if (averages.deathsPerMin > 0 && a.deathsPerMin >= averages.deathsPerMin * 1.8) return "Muchas más muertes de lo habitual en ti";
  return null;
}
