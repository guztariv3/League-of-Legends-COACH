import { compareMeans, mean, type MatchAnalysis } from "@coach/analysis";

/**
 * Insight pipeline (the single "decision engine"):
 *   detectors → candidates (with evidence) → confidence → priority → anti-spam → output.
 *
 * Deterministic by design: the LLM may later rephrase an insight, but never
 * decides whether it exists, its priority or its epistemic kind.
 */
export const INSIGHTS_VERSION = 1;

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
  const sample = 1 - Math.exp(-c.sampleSize / 12); // ≈0.56 at 10 games, ≈0.92 at 30
  const kindCap = c.kind === "fact" ? 1 : c.kind === "observation" ? 0.9 : 0.7;
  return Math.round(Math.min(kindCap, sample * (0.4 + 0.6 * c.completeness)) * 100) / 100;
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
  return {
    id: "early-deaths",
    kind: "observation",
    title: `Mueres 2 o más veces antes del minuto 14 en ${heavy.length} de ${withTl.length} partidas`,
    detail:
      `En esas partidas perdiste el ${pct(lossRateHeavy)}; en el resto, el ${pct(lossRateLight)}. ` +
      "Es una correlación, no prueba que las muertes causen la derrota, pero merece revisarlo.",
    evidence: [
      { label: "Partidas con timeline (SR)", value: String(withTl.length) },
      { label: "Media de muertes tempranas", value: fmt(mean(withTl.map((a) => a.earlyDeaths ?? 0))) },
    ],
    sampleSize: withTl.length,
    matchIds: heavy.map((a) => a.matchId),
    impact: 0.8,
    completeness: withTl.length / Math.max(1, sr.length),
  };
};

function trendDetector(
  id: string,
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
        ? `Tu ${name} ha mejorado en tus últimas 10 partidas de ${mainRole}`
        : `Tu ${name} ha bajado en tus últimas 10 partidas de ${mainRole}`,
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
    };
  };
}

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
  trendDetector("cs-trend", (a) => a.csPerMin, "CS por minuto", "", true),
  trendDetector("gold10-trend", (a) => a.goldDiff10, "diferencia de oro al minuto 10", " de oro", true),
  championPool,
];

// ------------------------------------------------------------ pipeline

export interface InsightResult {
  insights: Insight[];
  /** Set when there is not enough reliable data to say anything useful. */
  insufficientData: boolean;
}

export function generateInsights(ctx: InsightContext, maxVisible = 3): InsightResult {
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
    .filter((i) => i.priority !== "suppressed")
    .sort((a, b) => order[a.priority] - order[b.priority] || b.confidence - a.confidence)
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
