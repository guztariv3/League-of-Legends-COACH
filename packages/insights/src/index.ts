import { compareMeans, detectAnomalies, findInflections, gameStateOf, LONG_METRICS, mean, patternScope, sampleConfidence, type MatchAnalysis } from "@coach/analysis";
import type { GoalMetric } from "./goals.js";

export * from "./goals.js";
export * from "./challenges.js";

/**
 * Insight pipeline (the single "decision engine"):
 *   detectors → candidates (with evidence) → confidence → priority → anti-spam → output.
 *
 * Deterministic by design: the LLM may later rephrase an insight, but never
 * decides whether it exists, its priority or its epistemic kind.
 */
export const INSIGHTS_VERSION = 3;

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
      ? ` It is concentrated on ${scope.champion}; it happens much less with your other champions.`
      : scope.scope === "global"
        ? " It happens across several of your champions, so it looks like a general habit rather than something about one champion."
        : "";
  return {
    id: "early-deaths",
    kind: "observation",
    title:
      scope.scope === "champion"
        ? `On ${scope.champion} you die 2+ times before minute 14 much more often than on other champions`
        : `You die 2+ times before minute 14 in ${heavy.length} of ${withTl.length} games`,
    detail:
      `You lost ${pct(lossRateHeavy)} of those games, versus ${pct(lossRateLight)} of the rest. ` +
      "This is a correlation, not proof that those deaths cause the losses, but it is worth reviewing." +
      scopeText,
    evidence: [
      { label: "Games with timeline (SR)", value: String(withTl.length) },
      { label: "With 2+ deaths before 14:00", value: String(heavy.length) },
      { label: "Average early deaths", value: fmt(mean(withTl.map((a) => a.earlyDeaths ?? 0))) },
      ...scope.perChampion.slice(0, 3).map((c) => ({ label: c.championName, value: `${c.hits} of ${c.games}` })),
    ],
    metric: "earlyDeaths",
    review: "Open those games and look at the deaths before 14:00: what you knew about the enemy jungler, and how much health and resources you had left.",
    sampleSize: withTl.length,
    matchIds: heavy.map((a) => a.matchId),
    impact: 0.8,
    completeness: withTl.length / Math.max(1, sr.length),
  };
};

/**
 * Consolidated changes over time (permutation-tested inflection points, brief
 * §54, §71). This replaces the older "last 10 vs rest" trend detectors, which
 * used a weaker test.
 */
const DATE = new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short" });

const consolidatedChange: Detector = (_ctx, usable) => {
  const inf = findInflections(usable)[0];
  if (!inf) return null;
  const digits = LONG_METRICS[inf.metric].digits;
  const f = (x: number) => x.toFixed(digits);
  return {
    id: `change-${inf.metric}`,
    kind: inf.kind,
    title: `Your ${inf.label} has ${inf.direction === "improved" ? "improved" : "dropped"} consistently since ${DATE.format(inf.at)}`,
    detail: `From ${f(inf.before.mean)} to ${f(inf.after.mean)}. ${inf.context.join(" ")}`,
    evidence: [
      { label: "Before", value: `${f(inf.before.mean)} (${inf.before.n} games)` },
      { label: "After", value: `${f(inf.after.mean)} (${inf.after.n} games)` },
      ...(inf.sameChampion ? [{ label: `On ${inf.sameChampion.champion} only`, value: `${f(inf.sameChampion.before)} → ${f(inf.sameChampion.after)}` }] : []),
    ],
    sampleSize: inf.before.n + inf.after.n,
    matchIds: [],
    impact: inf.direction === "declined" ? 0.75 : 0.55,
    completeness: 1,
    metric: inf.metric,
  };
};

/** Recent games far outside the player's usual range (anomalies, brief §81); only sustained ones are reported. */
const recentShift: Detector = (_ctx, usable) => {
  const a = detectAnomalies(usable).find((x) => x.verdict === "possible_change");
  if (!a) return null;
  return {
    id: `shift-${a.metric}-${a.direction}`,
    kind: "observation",
    title: `Your latest games are outside your usual range in ${a.label} (${a.direction === "better" ? "for the better" : "for the worse"})`,
    detail: a.explanation,
    evidence: [{ label: "Your usual value (median)", value: a.baseline.toFixed(2) }, { label: "Games affected", value: `${a.count} of 5` }],
    sampleSize: a.count,
    matchIds: a.matchIds,
    impact: a.direction === "worse" ? 0.6 : 0.45,
    completeness: 1,
    metric: a.metric,
  };
};

/** Leads that end in defeat (brief §34): a fact, with the counts. */
const lostLeads: Detector = (_ctx, usable) => {
  const ahead = usable.filter((a) => gameStateOf(a) === "ahead");
  if (ahead.length < 8) return null;
  const lost = ahead.filter((a) => !a.win);
  if (lost.length < 3 || lost.length / ahead.length < 0.3) return null;
  return {
    id: "lost-leads",
    kind: "fact",
    title: `You lost ${lost.length} of ${ahead.length} games where your team was ahead at minute 15`,
    detail: "Ahead at 15:00 means a team gold lead of at least 1,500. Reviewing what happened next can teach a lot.",
    evidence: [
      { label: "Games ahead at 15:00", value: String(ahead.length) },
      { label: "Lost", value: String(lost.length) },
    ],
    sampleSize: ahead.length,
    matchIds: lost.map((a) => a.matchId),
    impact: 0.7,
    completeness: 1,
    review: "In those games, look at your deaths after 15:00 and which objectives were lost right after.",
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
    title: "When your team is ahead, you die more after minute 15 than in even games",
    detail: `${fmt(cmp.a, 2)} deaths per minute when ahead versus ${fmt(cmp.b, 2)} in even games. It may be taking too many risks with a lead, though the champion and the game also play a part.`,
    evidence: [
      { label: "Ahead (deaths/min after 15:00)", value: fmt(cmp.a, 2) },
      { label: "Even (deaths/min after 15:00)", value: fmt(cmp.b, 2) },
      { label: "Games ahead / even", value: `${ahead.length} / ${even.length}` },
    ],
    sampleSize: ahead.length + even.length,
    matchIds: [],
    impact: 0.65,
    completeness: 1,
    metric: "deathsPerMin",
    review: "Look for the deaths after 15:00 in those games: were you far from your team, or without vision?",
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
    title: `Your 3 most played champions make up ${pct(topShare)} of your games`,
    detail: top.map(([c, n]) => `${c} (${n})`).join(", "),
    evidence: top.map(([c, n]) => ({ label: c, value: `${n} games` })),
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
  consolidatedChange,
  recentShift,
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
  if (a.earlyDeaths !== null && a.earlyDeaths >= 3) return `${a.earlyDeaths} deaths before minute 14`;
  if (a.goldDiff15 !== null && Math.abs(a.goldDiff15) >= 1500) {
    return a.goldDiff15 > 0
      ? `+${Math.round(a.goldDiff15)} gold over your lane opponent at 15:00`
      : `${Math.round(a.goldDiff15)} gold versus your lane opponent at 15:00`;
  }
  if (averages.kda > 0 && a.kda >= averages.kda * 1.8 && a.kda >= 4) return "One of your best recent KDAs";
  if (averages.deathsPerMin > 0 && a.deathsPerMin >= averages.deathsPerMin * 1.8) return "Many more deaths than usual for you";
  return null;
}
