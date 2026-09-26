import { quantile, type MatchAnalysis } from "@coach/analysis";
import type { NormalizedMatch, RawTimeline } from "@coach/domain";
import { GOAL_METRICS, type GoalMetric } from "@coach/insights";
import { suggestItems, type Catalog, type PlayerView } from "@coach/itemization";
import type { KeyMoment, MatchReview } from "@coach/review";
import { decide, type CoachDecision } from "./decision.js";
import { SLOT_KEY, usualMaxOrder, type Slot } from "./skills.js";

/**
 * Coach Review (F5): eight short sections after a game, each built only from this game's
 * data and the player's own history. A section with too little evidence says so instead
 * of filling the gap. Comparisons are with the player's own usual range, never with other
 * players, and a gap is never presented as the cause of the result.
 */
export type ReviewSectionId =
  | "went_well" | "hurt" | "biggest_mistake" | "missed_opportunity"
  | "build" | "skills" | "macro" | "focus";

export interface ReviewSection {
  id: ReviewSectionId;
  title: string;
  decisions: CoachDecision[];
  /** Why the section is empty, when it is. */
  empty: string | null;
}

export interface CoachReview {
  sections: ReviewSection[];
  /** The games this one is compared with. */
  baseline: { games: number; scope: string };
}

export interface CoachReviewInput {
  game: MatchAnalysis;
  /** The player's other analyzed games (this one is excluded here). */
  history: MatchAnalysis[];
  review: MatchReview | null;
  /** For the build section: the game, its timeline and Riot's item catalog. */
  match?: NormalizedMatch | null;
  timeline?: RawTimeline | null;
  catalog?: Catalog | null;
}

/** Games needed before "your usual" means anything. */
export const MIN_BASELINE = 5;

interface Metric {
  id: string;
  label: string;
  higherIsBetter: boolean;
  get: (a: MatchAnalysis) => number | null;
  fmt: (x: number) => string;
  /** Matching goal metric, so the focus can be saved. */
  goal?: GoalMetric;
}

const signed = (x: number) => `${x > 0 ? "+" : ""}${Math.round(x)}`;
const fixed = (d: number) => (x: number) => x.toFixed(d);
const pctFmt = (x: number) => `${Math.round(x * 100)}%`;

const METRICS: Metric[] = [
  { id: "csPerMin", label: "CS per minute", higherIsBetter: true, get: GOAL_METRICS.csPerMin.extract, fmt: fixed(1), goal: "csPerMin" },
  { id: "deathsPerMin", label: "Deaths per minute", higherIsBetter: false, get: (a) => a.deathsPerMin, fmt: fixed(2), goal: "deathsPerMin" },
  { id: "earlyDeaths", label: "Deaths before minute 14", higherIsBetter: false, get: (a) => a.earlyDeaths, fmt: fixed(0), goal: "earlyDeaths" },
  { id: "killParticipation", label: "Kill participation", higherIsBetter: true, get: (a) => a.killParticipation, fmt: pctFmt, goal: "killParticipation" },
  { id: "visionPerMin", label: "Vision per minute", higherIsBetter: true, get: (a) => a.visionPerMin, fmt: fixed(2), goal: "visionPerMin" },
  { id: "goldDiff10", label: "Gold vs lane opponent at 10:00", higherIsBetter: true, get: (a) => a.goldDiff10, fmt: signed, goal: "goldDiff10" },
  { id: "csDiff15", label: "CS vs lane opponent at 15:00", higherIsBetter: true, get: (a) => a.csDiff15, fmt: signed },
  { id: "damagePerMin", label: "Damage to champions per minute", higherIsBetter: true, get: (a) => a.damagePerMin, fmt: fixed(0) },
  { id: "damageShare", label: "Share of your team's damage", higherIsBetter: true, get: (a) => a.damageShare, fmt: pctFmt },
  { id: "soloDeaths", label: "Deaths with no enemy helping the killer", higherIsBetter: false, get: (a) => a.soloDeaths, fmt: fixed(0) },
];

interface Standing { metric: Metric; value: number; median: number; low: number; high: number; n: number; distance: number }

/** Where this game's value sits against the player's own middle half (25th–75th percentile). */
function standings(game: MatchAnalysis, baseline: MatchAnalysis[]): Standing[] {
  const out: Standing[] = [];
  for (const metric of METRICS) {
    const value = metric.get(game);
    if (value === null) continue;
    const xs = baseline.map(metric.get).filter((x): x is number => x !== null);
    if (xs.length < MIN_BASELINE) continue;
    const low = quantile(xs, 0.25), median = quantile(xs, 0.5), high = quantile(xs, 0.75);
    const spread = Math.max(high - low, Math.abs(median) * 0.1, 1e-6);
    // Positive = better than usual, in units of the player's own spread.
    const distance = ((value - median) / spread) * (metric.higherIsBetter ? 1 : -1);
    out.push({ metric, value, median, low, high, n: xs.length, distance });
  }
  return out;
}

function standingDecision(s: Standing, good: boolean): CoachDecision {
  const { metric: m } = s;
  return decide({
    id: `review:${good ? "well" : "hurt"}:${m.id}`,
    kind: "review",
    basis: "observation",
    priority: good ? "info" : "important",
    confidence: Math.min(0.85, 0.45 + s.n / 60),
    headline: `${m.label}: ${m.fmt(s.value)} (you usually ${m.fmt(s.median)})`,
    ref: m.goal ?? m.id,
    reasons: [
      good
        ? `Better than three quarters of your comparable games.`
        : `Worse than three quarters of your comparable games.`,
      "This compares you with yourself; it does not say this alone decided the game.",
    ],
    evidence: [
      { label: "This game", value: m.fmt(s.value), source: "this_game" },
      { label: "Your usual range", value: `${m.fmt(s.low)} – ${m.fmt(s.high)}`, source: "your_games", sampleSize: s.n },
    ],
  });
}

const fmtTime = (ms: number) => `${Math.floor(ms / 60_000)}:${String(Math.floor((ms % 60_000) / 1000)).padStart(2, "0")}`;

function momentDecision(m: KeyMoment, kind: "mistake" | "opportunity"): CoachDecision {
  return decide({
    id: `review:${kind}:${m.id}`,
    kind: "review",
    basis: m.kind,
    priority: "important",
    confidence: m.confidence,
    headline: m.title,
    ref: m.id,
    reasons: [m.detail],
    evidence: [
      ...m.evidence.map((e) => ({ label: e.label, value: e.value, source: "this_game" as const })),
      ...(m.goldSwing ? [{ label: "Team gold swing around it", value: signed(m.goldSwing), source: "this_game" as const }] : []),
    ],
  });
}

/** Educational weight, as the review's own highlights use it. */
const weight = (m: KeyMoment) => (Math.abs(m.goldSwing) + 500) * m.confidence;

// ------------------------------------------------------------------ build

type Ev = RawTimeline["info"]["frames"][number]["events"][number];

/** Every participant's inventory just before `t`, from purchase, sale, destroy and undo events. */
function inventoriesBefore(events: Ev[], t: number): Map<number, number[]> {
  const inv = new Map<number, number[]>();
  const bag = (id: number) => { let b = inv.get(id); if (!b) { b = []; inv.set(id, b); } return b; };
  const drop = (b: number[], item: number) => { const i = b.lastIndexOf(item); if (i >= 0) b.splice(i, 1); };
  for (const e of events) {
    if (e.timestamp >= t) break;
    const pid = e["participantId"];
    if (typeof pid !== "number") continue;
    const b = bag(pid);
    const item = e["itemId"];
    if (e.type === "ITEM_PURCHASED" && typeof item === "number") b.push(item);
    else if ((e.type === "ITEM_SOLD" || e.type === "ITEM_DESTROYED") && typeof item === "number") drop(b, item);
    else if (e.type === "ITEM_UNDO") {
      if (typeof e["beforeId"] === "number" && e["beforeId"]) drop(b, e["beforeId"]);
      if (typeof e["afterId"] === "number" && e["afterId"]) b.push(e["afterId"]);
    }
  }
  return inv;
}

function scoreBefore(events: Ev[], t: number, pid: number) {
  let kills = 0, deaths = 0;
  for (const e of events) {
    if (e.timestamp >= t) break;
    if (e.type !== "CHAMPION_KILL") continue;
    if (e["killerId"] === pid) kills++;
    if (e["victimId"] === pid) deaths++;
  }
  return { kills, deaths };
}

/**
 * For the first completed items: what the Coach's item rules would have suggested at the
 * moment of each purchase, with the enemies' items and scores at that moment. A different
 * pick is an observation, not a mistake: the rules don't see everything the player saw.
 */
function buildDecisions(input: CoachReviewInput): CoachDecision[] | string {
  const { match, timeline, catalog, game } = input;
  if (!match || !timeline || !catalog) return "Item data for this patch isn't loaded, so we can't replay your purchases.";
  const me = match.participants.find((p) => p.puuid === game.puuid);
  if (!me) return "We couldn't find you in this game's data.";
  const events = timeline.info.frames.flatMap((f) => f.events).sort((a, b) => a.timestamp - b.timestamp);
  const interval = timeline.info.frameInterval || 60_000;
  const completed = (game.purchases ?? [])
    .filter((p) => { const i = catalog.items.get(p.itemId); return i?.completed && !i.boots; })
    .slice(0, 3);
  if (!completed.length) return "You didn't complete an item in this game, or the timeline doesn't show it.";

  const view = (pid: number, t: number, inv: Map<number, number[]>): PlayerView | null => {
    const p = match.participants.find((x) => x.participantId === pid);
    if (!p) return null;
    const frame = timeline.info.frames[Math.min(timeline.info.frames.length - 1, Math.floor(t / interval))];
    const level = frame?.participantFrames[String(pid)]?.level ?? 1;
    return { championId: p.championName, champion: p.championName, items: inv.get(pid) ?? [], level, ...scoreBefore(events, t, pid) };
  };

  const out: CoachDecision[] = [];
  for (const buy of completed) {
    const t = buy.atSec * 1000;
    const inv = inventoriesBefore(events, t);
    const mine = view(me.participantId, t, inv);
    if (!mine) continue;
    const enemies = match.participants.filter((p) => p.teamId !== me.teamId)
      .map((p) => view(p.participantId, t, inv)).filter((v): v is PlayerView => v !== null);
    const s = suggestItems({ catalog, map: 11, gold: null, me: mine, enemies });
    const bought = catalog.items.get(buy.itemId)!;
    const top = s.next?.item;
    const options = [s.next, ...s.alternatives].filter((x) => x !== null).map((x) => x.item.id);
    const same = top?.id === bought.id;
    const among = !same && options.includes(bought.id);
    const at = fmtTime(t);
    out.push(decide({
      id: `review:build:${bought.id}@${buy.atSec}`,
      kind: "review",
      basis: "observation",
      priority: same || among ? "info" : "important",
      confidence: 0.5,
      headline: same
        ? `${at} ${bought.name}: the same item the Coach would have picked`
        : among
          ? `${at} ${bought.name}: one of the Coach's options`
          : top
            ? `${at} ${bought.name}: the Coach would have looked at ${top.name}`
            : `${at} ${bought.name}`,
      ref: String(bought.id),
      reasons: [
        ...(top && !same ? (s.next?.reasons ?? []).slice(0, 2) : []),
        same || among
          ? "Your purchase fits what the enemy team had at that moment."
          : top
            ? "The rules only see items and scores, not the fights, your lane or your plan; treat this as a question to ask yourself, not a verdict."
            : "The rules had nothing clearly better to offer at that moment.",
      ],
      evidence: [
        { label: "Bought at", value: at, source: "this_game" },
        { label: "Enemy damage", value: `${Math.round(s.enemy.magicShare * 100)}% magic`, source: "this_game" },
        ...(s.enemy.healers.length ? [{ label: "Enemies with healing", value: s.enemy.healers.join(", "), source: "this_game" as const }] : []),
      ],
      alternatives: top && !same ? [{ label: top.name, ref: String(top.id) }] : [],
    }));
  }
  return out;
}

// ------------------------------------------------------------------ skills

/** Levels at which each rank of R was learned (1-based). */
function ultLevels(order: Slot[]): number[] {
  return order.flatMap((s, i) => (s === 4 ? [i + 1] : []));
}

function skillDecisions(game: MatchAnalysis, baseline: MatchAnalysis[]): CoachDecision[] | string {
  const order = game.skillOrder as Slot[] | null;
  if (!order || order.length < 9) return "The timeline doesn't show enough of your level-ups to review your skills.";
  const out: CoachDecision[] = [];
  const maxThis = usualMaxOrder([order]);
  const histOrders = baseline.filter((a) => a.championName === game.championName && a.skillOrder && a.skillOrder.length >= 9)
    .map((a) => ({ order: a.skillOrder as Slot[], win: a.win }));
  const usual = usualMaxOrder(histOrders.map((h) => h.order));
  const keys = (o: Slot[] | null) => (o ? o.map((s) => SLOT_KEY[s]).join(" → ") : "—");

  if (maxThis) {
    const same = usual && usual.join() === maxThis.join();
    const withOrder = usual ? histOrders.filter((h) => usualMaxOrder([h.order])?.join() === maxThis.join()) : [];
    out.push(decide({
      id: `review:skills:max:${maxThis.join("")}`,
      kind: "review",
      basis: usual ? "observation" : "fact",
      priority: usual && !same ? "important" : "info",
      confidence: usual ? Math.min(0.8, 0.4 + histOrders.length / 30) : 0.9,
      headline: `Max order: ${keys(maxThis)}${usual ? (same ? " (your usual)" : ` (you usually go ${keys(usual)})`) : ""}`,
      reasons: [
        !usual
          ? `Not enough of your ${game.championName} games with a full timeline to compare with (need 3).`
          : same
            ? "Same order as most of your games on this champion."
            : "Different from your usual order. That can be right for the matchup; check whether it was on purpose.",
      ],
      evidence: usual
        ? [
          { label: `Your ${game.championName} games`, value: String(histOrders.length), source: "your_games", sampleSize: histOrders.length },
          ...(withOrder.length ? [{ label: "Wins with this order", value: `${withOrder.filter((h) => h.win).length}/${withOrder.length}`, source: "your_games" as const, sampleSize: withOrder.length }] : []),
        ]
        : [],
    }));
  }

  const ult = ultLevels(order);
  const expected = [6, 11, 16].filter((l) => l <= order.length);
  const late = expected.map((l, i) => ({ l, got: ult[i] })).filter((x) => x.got === undefined || x.got > x.l);
  if (expected.length) {
    out.push(decide({
      id: `review:skills:ult:${ult.join("-")}`,
      kind: "review",
      basis: "fact",
      priority: late.length ? "important" : "info",
      confidence: 0.95,
      headline: late.length
        ? `R learned late: ${late.map((x) => (x.got ? `level ${x.got} instead of ${x.l}` : `not at level ${x.l}`)).join(", ")}`
        : `R learned on time (levels ${ult.join(", ")})`,
      reasons: [late.length
        ? "Most champions put a point in R as soon as it unlocks (6, 11, 16). A few are exceptions; check yours."
        : "Every rank of R as soon as it unlocked."],
      evidence: [{ label: "Level-up order", value: order.map((s) => SLOT_KEY[s]).join(" "), source: "this_game" }],
    }));
  }
  return out;
}

// ------------------------------------------------------------------ macro

function macroDecisions(review: MatchReview | null): CoachDecision[] | string {
  if (!review) return "Without this game's timeline we can't see objectives.";
  const objectives = review.events.filter((e) => e.type === "objective");
  const structures = review.events.filter((e) => e.type === "structure");
  const count = (xs: typeof objectives, side: "ally" | "enemy") => xs.filter((e) => e.side === side).length;
  const out: CoachDecision[] = [];
  const oa = count(objectives, "ally"), oe = count(objectives, "enemy");
  const sa = count(structures, "ally"), se = count(structures, "enemy");
  out.push(decide({
    id: "review:macro:objectives",
    kind: "review",
    basis: "fact",
    priority: oa < oe ? "important" : "info",
    confidence: 1,
    headline: `Epic monsters: your team ${oa}, enemy ${oe} · Structures: ${sa} – ${se}`,
    reasons: ["Dragons, Voidgrubs, Rift Herald, Baron and Atakhan, plus towers and inhibitors, from the timeline."],
    evidence: [
      { label: "Epic monsters (you – enemy)", value: `${oa} – ${oe}`, source: "this_game" },
      { label: "Structures (you – enemy)", value: `${sa} – ${se}`, source: "this_game" },
    ],
  }));
  const costly = review.moments.filter((m) => m.id.startsWith("death-") && m.category === "error" && m.evidence.some((e) => e.label === "After"));
  if (costly.length) {
    out.push(decide({
      id: "review:macro:deaths-before-objectives",
      kind: "review",
      basis: "observation",
      priority: "important",
      confidence: 0.6,
      headline: `${costly.length} of your deaths ${costly.length === 1 ? "was" : "were"} followed by an enemy objective within 90 s`,
      reasons: ["Dying shortly before an objective often lets the enemy take it. The timing is a fact; whether your death caused it isn't known."],
      evidence: costly.slice(0, 3).map((m) => ({ label: fmtTime(m.t), value: m.evidence.filter((e) => e.label === "After").map((e) => e.value).join("; "), source: "this_game" as const })),
    }));
  }
  const unconverted = review.moments.filter((m) => m.category === "opportunity");
  if (unconverted.length) {
    out.push(decide({
      id: "review:macro:unconverted",
      kind: "review",
      basis: "hypothesis",
      priority: "info",
      confidence: 0.5,
      headline: `${unconverted.length} won ${unconverted.length === 1 ? "fight" : "fights"} with no objective after`,
      reasons: ["There may have been nothing available to take; worth a look in the map review."],
      evidence: unconverted.slice(0, 3).map((m) => ({ label: fmtTime(m.t), value: m.evidence.map((e) => `${e.label} ${e.value}`).join(", "), source: "this_game" as const })),
    }));
  }
  return out;
}

// ------------------------------------------------------------------ review

const TITLES: Record<ReviewSectionId, string> = {
  went_well: "What went well",
  hurt: "What hurt your game",
  biggest_mistake: "Biggest mistake",
  missed_opportunity: "Missed opportunity",
  build: "Build decision",
  skills: "Skill decision",
  macro: "Macro decision",
  focus: "Next-game focus",
};

function section(id: ReviewSectionId, result: CoachDecision[] | string, whenEmpty: string): ReviewSection {
  if (typeof result === "string") return { id, title: TITLES[id], decisions: [], empty: result };
  return { id, title: TITLES[id], decisions: result, empty: result.length ? null : whenEmpty };
}

export function coachReview(input: CoachReviewInput): CoachReview {
  const { game, review } = input;
  const others = input.history.filter((a) => a.analyzable && a.mode === game.mode && a.matchId !== game.matchId);
  const sameRole = others.filter((a) => a.role === game.role);
  const baseline = sameRole.length >= MIN_BASELINE ? sameRole : others;
  const scope = baseline === sameRole ? "your games in the same role" : "your games in this mode";

  const st = standings(game, baseline);
  const well = st.filter((s) => s.value > s.high || s.value < s.low).filter((s) => s.distance > 0).sort((a, b) => b.distance - a.distance).slice(0, 2);
  const hurt = st.filter((s) => s.value > s.high || s.value < s.low).filter((s) => s.distance < 0).sort((a, b) => a.distance - b.distance).slice(0, 2);
  const goodMoments = (review?.moments ?? []).filter((m) => m.category === "good").sort((a, b) => weight(b) - weight(a)).slice(0, 1);
  const noBaseline = baseline.length < MIN_BASELINE ? `We need at least ${MIN_BASELINE} comparable games to say what's usual for you.` : null;

  const mistakes = (review?.moments ?? []).filter((m) => m.category === "error").sort((a, b) => weight(b) - weight(a));
  const missed = (review?.moments ?? []).filter((m) => m.category === "opportunity").sort((a, b) => weight(b) - weight(a));

  const wellDecisions = [...well.map((s) => standingDecision(s, true)), ...goodMoments.map((m) => decide({
    id: `review:good:${m.id}`, kind: "review", basis: m.kind, priority: "info", confidence: m.confidence,
    headline: m.title, ref: m.id, reasons: [m.detail],
    evidence: m.evidence.map((e) => ({ label: e.label, value: e.value, source: "this_game" as const })),
  }))];

  // One thing for next game: the biggest gap against your own usual, else the pattern behind the biggest mistake.
  const focusFrom = hurt.find((s) => s.metric.goal);
  const focus: CoachDecision[] = focusFrom
    ? [decide({
      id: `review:focus:${focusFrom.metric.goal}`,
      kind: "focus",
      basis: "observation",
      priority: "important",
      confidence: Math.min(0.8, 0.4 + focusFrom.n / 60),
      headline: `Next game: ${focusFrom.metric.label.toLowerCase()} back to your usual (${focusFrom.metric.fmt(focusFrom.median)})`,
      ref: focusFrom.metric.goal,
      reasons: ["It was the furthest from your usual level in this game, and it's something you can measure next game."],
      evidence: [
        { label: "This game", value: focusFrom.metric.fmt(focusFrom.value), source: "this_game" },
        { label: "Your usual", value: focusFrom.metric.fmt(focusFrom.median), source: "your_games", sampleSize: focusFrom.n },
      ],
    })]
    : mistakes[0]
      ? [decide({
        id: "review:focus:deaths",
        kind: "focus",
        basis: "hypothesis",
        priority: "important",
        confidence: 0.5,
        headline: "Next game: before each fight or objective, check where your team is",
        ref: "deathsPerMin",
        reasons: ["Your most costly moment this game was a death away from your team or just before an enemy objective."],
        evidence: [{ label: "Moment", value: mistakes[0].title, source: "this_game" }],
      })]
      : [];

  return {
    baseline: { games: baseline.length, scope },
    sections: [
      section("went_well", noBaseline && !goodMoments.length ? noBaseline : wellDecisions, "Nothing stood out above your usual level; a steady game."),
      section("hurt", noBaseline ?? hurt.map((s) => standingDecision(s, false)), "Nothing fell below your usual range."),
      section("biggest_mistake", review ? mistakes.slice(0, 1).map((m) => momentDecision(m, "mistake")) : "Without this game's timeline we can't reconstruct the key moments.",
        "No death fits the patterns we look for (far from your team, or followed by an enemy objective)."),
      section("missed_opportunity", review ? missed.slice(0, 1).map((m) => momentDecision(m, "opportunity")) : "Without this game's timeline we can't reconstruct the key moments.",
        "No won fight was left without an objective after it."),
      section("build", buildDecisions(input), "Nothing to review."),
      section("skills", skillDecisions(game, others), "Nothing to review."),
      section("macro", macroDecisions(review), "Nothing to review."),
      section("focus", noBaseline && !focus.length ? noBaseline : focus, "Nothing clearly stood out; keep the focus you already have."),
    ],
  };
}
