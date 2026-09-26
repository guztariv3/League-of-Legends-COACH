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

const CLASS_NAMES: Record<string, string> = {
  Assassin: "assassins",
  Mage: "mages",
  Fighter: "fighters",
  Tank: "tanks",
  Marksman: "marksmen",
  Support: "supports",
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
    return { verdict: "insufficient", why: "you die earlier than in your other games" + (worseLane ? " and your lane goes worse" : "") + "; you may not be adjusting your play to this kind of opponent." };
  }
  if (lessRisk && (lessFarm || worseLane)) {
    return { verdict: "over", why: "you die less, but you lose a lot of " + (lessFarm ? "farm" : "lane gold") + "; you may be playing more defensively than needed." };
  }
  return { verdict: "no_clear_difference", why: "we see no clear difference from your other games." };
}

/**
 * @param tagsOf champion id → official class tags (from the knowledge bundle).
 */
export function adaptationByOpponentClass(analyses: MatchAnalysis[], tagsOf: (championId: string) => string[] | undefined): AdaptationContext[] {
  const sr = analyses.filter((a) => a.analyzable && a.mode === "summoners_rift" && a.laneOpponentChampion);
  const out: AdaptationContext[] = [];
  for (const cls of Object.keys(CLASS_NAMES)) {
    const here = sr.filter((a) => (tagsOf(a.laneOpponentChampion!) ?? [])[0] === cls);
    const elsewhere = sr.filter((a) => !here.includes(a));
    if (here.length < 5 || elsewhere.length < 5) continue;
    const pick = (list: MatchAnalysis[], f: (a: MatchAnalysis) => number | null) => list.map(f).filter((v): v is number => v !== null);
    const risk: Diff = { label: "Deaths before 14:00", here: pick(here, (a) => a.earlyDeaths), elsewhere: pick(elsewhere, (a) => a.earlyDeaths), digits: 1 };
    const lane: Diff = { label: "Gold vs opponent at 10:00", here: pick(here, (a) => a.goldDiff10), elsewhere: pick(elsewhere, (a) => a.goldDiff10), digits: 0 };
    const farm: Diff = { label: "CS per minute", here: pick(here, (a) => a.csPerMin), elsewhere: pick(elsewhere, (a) => a.csPerMin), digits: 1 };
    const { verdict, why } = judge(risk, lane, farm);
    out.push({
      id: `vs-${cls}`,
      label: `Against ${CLASS_NAMES[cls]} in your lane`,
      games: here.length,
      verdict,
      kind: "hypothesis",
      detail: `Against ${CLASS_NAMES[cls]} (${here.length} games) ${why}`,
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
    label: "With a lead",
    games: ahead.length,
    verdict,
    kind: "hypothesis",
    detail:
      verdict === "insufficient"
        ? "When your team is ahead you die more after 15:00 than in even games; you may be taking too many risks with a lead."
        : "Your risk after 15:00 when ahead is similar to even games.",
    metrics: [{ label: "Deaths/min after 15:00", here: mean(ahead).toFixed(2), elsewhere: mean(even).toFixed(2) }],
  };
}
