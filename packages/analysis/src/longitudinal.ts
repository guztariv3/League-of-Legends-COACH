import type { AnalysisMode, Role } from "@coach/domain";
import type { MatchAnalysis } from "./match.js";
import { compareMeans, mean, quantile } from "./stats.js";

/**
 * Longitudinal analysis (brief §54–55, §71, §81–83). Every claim is measured
 * against the player's own history. A change only counts when it is
 * statistically consolidated, and the analysis always checks whether the
 * environment (patch, champions) could explain it before attributing it to
 * the player.
 */

export type LongMetricId = "csPerMin" | "deathsPerMin" | "earlyDeaths" | "goldDiff10" | "killParticipation" | "visionPerMin";

interface LongMetric {
  label: string;
  higherIsBetter: boolean;
  modes: AnalysisMode[];
  digits: number;
  pick: (a: MatchAnalysis) => number | null;
}

export const LONG_METRICS: Record<LongMetricId, LongMetric> = {
  csPerMin: { label: "CS por minuto", higherIsBetter: true, modes: ["summoners_rift"], digits: 1, pick: (a) => (a.role === "UTILITY" ? null : a.csPerMin) },
  deathsPerMin: { label: "muertes por minuto", higherIsBetter: false, modes: ["summoners_rift"], digits: 2, pick: (a) => a.deathsPerMin },
  earlyDeaths: { label: "muertes antes del minuto 14", higherIsBetter: false, modes: ["summoners_rift"], digits: 1, pick: (a) => a.earlyDeaths },
  goldDiff10: { label: "oro frente a tu rival al 10", higherIsBetter: true, modes: ["summoners_rift"], digits: 0, pick: (a) => a.goldDiff10 },
  killParticipation: { label: "participación en kills", higherIsBetter: true, modes: ["summoners_rift"], digits: 2, pick: (a) => a.killParticipation },
  visionPerMin: { label: "visión por minuto", higherIsBetter: true, modes: ["summoners_rift"], digits: 2, pick: (a) => a.visionPerMin },
};

/** Minimum games on each side of a change point. */
export const MIN_SIDE = 10;
/**
 * Significance for a change point. Many split points (and several metrics) are
 * tried, so a fixed |t| threshold gives too many false positives. Instead, the
 * maximum |t| over all splits is compared against its own null distribution
 * (the same values in random order, i.e. a permutation test). The level is then
 * Bonferroni-corrected across the metrics.
 */
export const PERMUTATIONS = 400;
export const FAMILY_ALPHA = 0.05;

export type Attribution = "player" | "environment_possible" | "unclear";

export interface InflectionPoint {
  metric: LongMetricId;
  label: string;
  /** Start time of the first game after the change. */
  at: number;
  before: { mean: number; n: number };
  after: { mean: number; n: number };
  t: number;
  direction: "improved" | "declined";
  attribution: Attribution;
  kind: "observation" | "hypothesis";
  /** Why the change is (or isn't) attributed to the player. */
  context: string[];
  sameChampion: { champion: string; before: number; after: number; consolidated: boolean } | null;
}

type Point = { a: MatchAnalysis; v: number };

function series(analyses: MatchAnalysis[], id: LongMetricId, role: Role | null): Point[] {
  const m = LONG_METRICS[id];
  return analyses
    .filter((a) => a.analyzable && m.modes.includes(a.mode) && (!role || a.role === role))
    .sort((x, y) => x.startedAt - y.startedAt) // chronological
    .map((a) => ({ a, v: m.pick(a) }))
    .filter((p): p is Point => p.v !== null && Number.isFinite(p.v));
}

function mainRole(analyses: MatchAnalysis[]): Role | null {
  const c = new Map<Role, number>();
  for (const a of analyses) if (a.analyzable && a.mode === "summoners_rift" && a.role !== "NONE") c.set(a.role, (c.get(a.role) ?? 0) + 1);
  return [...c.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null;
}

function shares(xs: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1 / xs.length);
  return m;
}

/** Overlap of two distributions (0 = disjoint, 1 = identical). */
function overlap(a: Map<string, number>, b: Map<string, number>): number {
  let s = 0;
  for (const [k, v] of a) s += Math.min(v, b.get(k) ?? 0);
  return s;
}

/** Welch t of (after − before) at every split k, in O(n) via prefix sums; returns the max-|t| split. */
function maxSplit(v: number[]): { k: number; t: number } | null {
  const n = v.length;
  const s1 = new Float64Array(n + 1);
  const s2 = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) { s1[i + 1] = s1[i]! + v[i]!; s2[i + 1] = s2[i]! + v[i]! * v[i]!; }
  let best: { k: number; t: number } | null = null;
  for (let k = MIN_SIDE; k <= n - MIN_SIDE; k++) {
    const nb = k, na = n - k;
    const mb = s1[k]! / nb, ma = (s1[n]! - s1[k]!) / na;
    const vb = (s2[k]! - nb * mb * mb) / (nb - 1);
    const va = (s2[n]! - s2[k]! - na * ma * ma) / (na - 1);
    const se = Math.sqrt(Math.max(0, va) / na + Math.max(0, vb) / nb);
    if (!(se > 0)) continue;
    const t = (ma - mb) / se;
    if (!best || Math.abs(t) > Math.abs(best.t)) best = { k, t };
  }
  return best;
}

function seedFrom(v: number[]): number {
  let h = 2166136261;
  for (const x of v) h = Math.imul(h ^ Math.round(x * 1000), 16777619);
  return h >>> 0;
}

/** P(max |t| over splits ≥ observed) under random ordering; deterministic for reproducibility. */
function permutationP(v: number[], observed: number, seed: number): number {
  let a = seed || 1;
  const rand = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const w = [...v];
  let exceed = 0;
  for (let p = 0; p < PERMUTATIONS; p++) {
    for (let i = w.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [w[i], w[j]] = [w[j]!, w[i]!]; }
    const m = maxSplit(w);
    if (m && Math.abs(m.t) >= observed) exceed++;
  }
  return (exceed + 1) / (PERMUTATIONS + 1);
}

export function findInflection(analyses: MatchAnalysis[], id: LongMetricId): InflectionPoint | null {
  const role = mainRole(analyses);
  const pts = series(analyses, id, role);
  if (pts.length < 2 * MIN_SIDE) return null;
  const values = pts.map((p) => p.v);
  const best = maxSplit(values);
  if (!best) return null;
  const alpha = FAMILY_ALPHA / Object.keys(LONG_METRICS).length;
  if (permutationP(values, Math.abs(best.t), seedFrom(values)) >= alpha) return null;

  const before = pts.slice(0, best.k);
  const after = pts.slice(best.k);
  const m = LONG_METRICS[id];
  const diff = mean(after.map((p) => p.v)) - mean(before.map((p) => p.v));
  const improved = (diff > 0) === m.higherIsBetter;

  // Environment checks (brief §71): patch boundary and champion mix.
  const patchOverlap = overlap(shares(before.map((p) => p.a.patch)), shares(after.map((p) => p.a.patch)));
  const champOverlap = overlap(shares(before.map((p) => p.a.championName)), shares(after.map((p) => p.a.championName)));
  const context: string[] = [];
  const patchChanged = patchOverlap < 0.4;
  const champsChanged = champOverlap < 0.5;
  if (patchChanged) context.push("El cambio coincide con un cambio de parche.");
  if (champsChanged) context.push("También cambiaron bastante los campeones que jugabas.");

  // Same-champion check: does the change also appear on one champion played on both sides?
  // Prefer a champion where the change is consolidated; otherwise the most-played one on both sides.
  const candidates: (NonNullable<InflectionPoint["sameChampion"]> & { games: number })[] = [];
  for (const c of new Set(pts.map((p) => p.a.championName))) {
    const b = before.filter((p) => p.a.championName === c).map((p) => p.v);
    const a = after.filter((p) => p.a.championName === c).map((p) => p.v);
    if (b.length < 5 || a.length < 5) continue;
    const cmp = compareMeans(a, b, 5);
    candidates.push({ champion: c, before: mean(b), after: mean(a), consolidated: cmp.consolidated && (cmp.diff > 0) === (diff > 0), games: a.length + b.length });
  }
  candidates.sort((x, y) => Number(y.consolidated) - Number(x.consolidated) || y.games - x.games);
  const sameChampion: InflectionPoint["sameChampion"] = candidates[0]
    ? { champion: candidates[0].champion, before: candidates[0].before, after: candidates[0].after, consolidated: candidates[0].consolidated }
    : null;

  let attribution: Attribution;
  if (sameChampion?.consolidated && !patchChanged) {
    attribution = "player";
    context.push(`El cambio también aparece jugando solo con ${sameChampion.champion}, lo que apunta a un cambio tuyo.`);
  } else if (patchChanged || champsChanged) {
    attribution = "environment_possible";
    context.push("No podemos separar tu evolución del cambio de entorno con estos datos.");
  } else if (sameChampion && !sameChampion.consolidated) {
    attribution = "unclear";
    context.push(`Con ${sameChampion.champion} por separado la diferencia no está clara.`);
  } else {
    attribution = "player";
    context.push("No vemos cambios de parche ni de campeones que lo expliquen.");
  }

  return {
    metric: id,
    label: m.label,
    at: after[0]!.a.startedAt,
    before: { mean: mean(before.map((p) => p.v)), n: before.length },
    after: { mean: mean(after.map((p) => p.v)), n: after.length },
    t: best.t,
    direction: improved ? "improved" : "declined",
    attribution,
    kind: attribution === "player" ? "observation" : "hypothesis",
    context,
    sameChampion,
  };
}

export function findInflections(analyses: MatchAnalysis[]): InflectionPoint[] {
  return (Object.keys(LONG_METRICS) as LongMetricId[])
    .map((id) => findInflection(analyses, id))
    .filter((x): x is InflectionPoint => x !== null)
    .sort((a, b) => Math.abs(b.t) - Math.abs(a.t));
}

// ------------------------------------------------------------ anomalies (brief §81)

export interface Anomaly {
  metric: LongMetricId;
  label: string;
  direction: "better" | "worse";
  /** Recent games (of the last 5) that were anomalous in this direction. */
  count: number;
  matchIds: string[];
  baseline: number;
  recent: number[];
  verdict: "variance" | "possible_change";
  explanation: string;
}

const RECENT = 5;
const Z = 2.5;

/** Robust z-scores (median / MAD) of the last 5 games against the rest of the history. */
export function detectAnomalies(analyses: MatchAnalysis[]): Anomaly[] {
  const role = mainRole(analyses);
  const out: Anomaly[] = [];
  for (const id of Object.keys(LONG_METRICS) as LongMetricId[]) {
    const m = LONG_METRICS[id];
    const pts = series(analyses, id, role).reverse(); // newest first
    if (pts.length < RECENT + 15) continue;
    const recent = pts.slice(0, RECENT);
    const base = pts.slice(RECENT).map((p) => p.v);
    const med = quantile(base, 0.5);
    const mad = quantile(base.map((v) => Math.abs(v - med)), 0.5) * 1.4826;
    if (!(mad > 0)) continue;
    const z = recent.map((p) => (p.v - med) / mad);
    for (const sign of [1, -1] as const) {
      const hits = recent.filter((_, i) => z[i]! * sign >= Z);
      if (!hits.length) continue;
      const better = (sign > 0) === m.higherIsBetter;
      const verdict = hits.length >= 3 ? "possible_change" : "variance";
      const f = (x: number) => x.toFixed(m.digits);
      out.push({
        metric: id,
        label: m.label,
        direction: better ? "better" : "worse",
        count: hits.length,
        matchIds: hits.map((p) => p.a.matchId),
        baseline: med,
        recent: hits.map((p) => p.v),
        verdict,
        explanation:
          verdict === "possible_change"
            ? `En ${hits.length} de tus últimas ${RECENT} partidas tu ${m.label} (${hits.map((p) => f(p.v)).join(", ")}) se sale mucho de lo habitual en ti (${f(med)}). Puede ser el inicio de un cambio; aún no está consolidado.`
            : `Tu ${m.label} en ${hits.length === 1 ? "una partida reciente" : `${hits.length} partidas recientes`} (${hits.map((p) => f(p.v)).join(", ")}) se sale de lo habitual (${f(med)}), pero con tan pocas partidas parece variación normal.`,
      });
    }
  }
  return out;
}

// ------------------------------------------------------------ evolution timeline (brief §83)

export interface TimelineEntry {
  at: number;
  type: "inflection" | "champion_shift" | "patch";
  title: string;
  detail: string;
}

export function buildTimeline(analyses: MatchAnalysis[], inflections: InflectionPoint[]): TimelineEntry[] {
  const usable = analyses.filter((a) => a.analyzable).sort((a, b) => a.startedAt - b.startedAt);
  const out: TimelineEntry[] = [];

  let lastPatch: string | null = null;
  for (const a of usable) {
    if (a.patch !== lastPatch) {
      if (lastPatch !== null) out.push({ at: a.startedAt, type: "patch", title: `Parche ${a.patch}`, detail: "Primera partida analizada en este parche." });
      lastPatch = a.patch;
    }
  }

  // Champion shifts: most-played champion per block of 15 games.
  const BLOCK = 15;
  let lastTop: string | null = null;
  for (let i = 0; i + BLOCK <= usable.length; i += BLOCK) {
    const block = usable.slice(i, i + BLOCK);
    const counts = new Map<string, number>();
    for (const a of block) counts.set(a.championName, (counts.get(a.championName) ?? 0) + 1);
    const [top, n] = [...counts.entries()].sort((x, y) => y[1] - x[1])[0]!;
    if (n >= 5 && top !== lastTop) {
      if (lastTop !== null) out.push({ at: block[0]!.startedAt, type: "champion_shift", title: `Empiezas a jugar sobre todo ${top}`, detail: `${n} de ${BLOCK} partidas en ese periodo (antes: ${lastTop}).` });
      lastTop = top;
    }
  }

  for (const inf of inflections) {
    const m = LONG_METRICS[inf.metric];
    const f = (x: number) => x.toFixed(m.digits);
    out.push({
      at: inf.at,
      type: "inflection",
      title: `${inf.direction === "improved" ? "Mejora" : "Bajada"} consolidada: ${inf.label}`,
      detail: `${f(inf.before.mean)} → ${f(inf.after.mean)} (${inf.before.n} y ${inf.after.n} partidas). ${inf.context.join(" ")}`,
    });
  }
  return out.sort((a, b) => a.at - b.at);
}
