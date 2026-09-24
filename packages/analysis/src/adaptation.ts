import type { MatchAnalysis } from "./match.js";
import { compareMeans, mean } from "./stats.js";
import { gameStateOf } from "./dimensions.js";

/**
 * Adaptability (brief §59). What is observable is how the player's *results
 * and risk* change with the context (lane opponent's class, game state), not
 * their intentions. So every conclusion is a hypothesis, and a context only
 * gets a verdict when the difference against the player's other games is
 * consolidated.
 */

export type AdaptationVerdict = "insufficient" | "over" | "no_clear_difference";

export interface AdaptationContext {
  id: string;
  label: string;
  games: number;
  verdict: AdaptationVerdict;
  kind: "hypothesis";
  detail: string;
  metrics: { label: string; here: string; elsewhere: string }[];
}

const CLASS_ES: Record<string, string> = {
  Assassin: "asesinos",
  Mage: "magos",
  Fighter: "luchadores",
  Tank: "tanques",
  Marksman: "tiradores",
  Support: "soportes",
};

interface Diff {
  label: string;
  here: number[];
  elsewhere: number[];
  digits: number;
}

function fmt(d: Diff) {
  return { label: d.label, here: mean(d.here).toFixed(d.digits), elsewhere: mean(d.elsewhere).toFixed(d.digits) };
}

/** Stricter than |t| ≥ 2: up to 5 classes × 3 metrics are compared (multiple comparisons). */
const ADAPT_T = 2.8;

function judge(risk: Diff, lane: Diff, farm: Diff): { verdict: AdaptationVerdict; why: string } {
  const r = compareMeans(risk.here, risk.elsewhere, 5, ADAPT_T);
  const l = compareMeans(lane.here, lane.elsewhere, 5, ADAPT_T);
  const f = compareMeans(farm.here, farm.elsewhere, 5, ADAPT_T);
  const moreRisk = r.consolidated && r.diff > 0;
  const lessRisk = r.consolidated && r.diff < 0;
  const worseLane = l.consolidated && l.diff < 0;
  const lessFarm = f.consolidated && f.diff < 0;
  if (moreRisk && (worseLane || !l.consolidated)) {
    return { verdict: "insufficient", why: "mueres más pronto que en el resto de tus partidas" + (worseLane ? " y la línea te va peor" : "") + "; puede que no ajustes tu forma de jugar a este tipo de rival." };
  }
  if (lessRisk && (lessFarm || worseLane)) {
    return { verdict: "over", why: "mueres menos, pero pierdes bastante " + (lessFarm ? "farmeo" : "oro en línea") + "; quizá juegas más a la defensiva de lo necesario." };
  }
  return { verdict: "no_clear_difference", why: "no vemos diferencias claras respecto a tus otras partidas." };
}

/**
 * @param tagsOf champion id → official class tags (from the knowledge bundle).
 */
export function adaptationByOpponentClass(analyses: MatchAnalysis[], tagsOf: (championId: string) => string[] | undefined): AdaptationContext[] {
  const sr = analyses.filter((a) => a.analyzable && a.mode === "summoners_rift" && a.laneOpponentChampion);
  const out: AdaptationContext[] = [];
  for (const cls of Object.keys(CLASS_ES)) {
    const here = sr.filter((a) => (tagsOf(a.laneOpponentChampion!) ?? [])[0] === cls);
    const elsewhere = sr.filter((a) => !here.includes(a));
    if (here.length < 5 || elsewhere.length < 5) continue;
    const pick = (list: MatchAnalysis[], f: (a: MatchAnalysis) => number | null) => list.map(f).filter((v): v is number => v !== null);
    const risk: Diff = { label: "Muertes antes del 14", here: pick(here, (a) => a.earlyDeaths), elsewhere: pick(elsewhere, (a) => a.earlyDeaths), digits: 1 };
    const lane: Diff = { label: "Oro vs rival al 10", here: pick(here, (a) => a.goldDiff10), elsewhere: pick(elsewhere, (a) => a.goldDiff10), digits: 0 };
    const farm: Diff = { label: "CS por minuto", here: pick(here, (a) => a.csPerMin), elsewhere: pick(elsewhere, (a) => a.csPerMin), digits: 1 };
    const { verdict, why } = judge(risk, lane, farm);
    out.push({
      id: `vs-${cls}`,
      label: `Contra ${CLASS_ES[cls]} en tu línea`,
      games: here.length,
      verdict,
      kind: "hypothesis",
      detail: `Contra ${CLASS_ES[cls]} (${here.length} partidas) ${why}`,
      metrics: [risk, lane, farm].filter((d) => d.here.length && d.elsewhere.length).map(fmt),
    });
  }
  return out;
}

/** Risk when ahead vs. in even games (brief §34, §59: adapting to an advantage). */
export function adaptationToLead(analyses: MatchAnalysis[]): AdaptationContext | null {
  const rate = (a: MatchAnalysis) =>
    a.deathsAfter15 !== null && a.durationSec > 15 * 60 ? a.deathsAfter15 / ((a.durationSec - 15 * 60) / 60) : null;
  const ahead = analyses.filter((a) => gameStateOf(a) === "ahead").map(rate).filter((v): v is number => v !== null);
  const even = analyses.filter((a) => gameStateOf(a) === "even").map(rate).filter((v): v is number => v !== null);
  if (ahead.length < 5 || even.length < 5) return null;
  const cmp = compareMeans(ahead, even, 5);
  const verdict: AdaptationVerdict = cmp.consolidated && cmp.diff > 0 ? "insufficient" : "no_clear_difference";
  return {
    id: "lead",
    label: "Con ventaja",
    games: ahead.length,
    verdict,
    kind: "hypothesis",
    detail:
      verdict === "insufficient"
        ? "Cuando tu equipo va por delante mueres más a partir del 15 que en partidas igualadas; puede que arriesgues de más con ventaja."
        : "Tu riesgo tras el 15 yendo por delante es parecido al de partidas igualadas.",
    metrics: [{ label: "Muertes/min tras el 15", here: mean(ahead).toFixed(2), elsewhere: mean(even).toFixed(2) }],
  };
}
