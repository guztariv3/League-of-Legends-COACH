import { quantile, type MatchAnalysis } from "@coach/analysis";
import { describeTarget, GOAL_METRICS, goalMet, successRate, type GoalMetric, type GoalSpec } from "./goals.js";

/**
 * Challenges (F6): short, concrete tries on one measurable habit, such as "at most 1 death
 * before minute 14 in 3 of your next 5 games" or "3 times this week". The target comes
 * from the player's recent games (a little better than usual), never from other players.
 * Only games played after accepting count, and a game without the metric doesn't count
 * either way.
 */
export type ChallengeKind = "next5" | "week";

export interface ChallengeSpec extends GoalSpec {
  kind: ChallengeKind;
}

export const CHALLENGE_NEED = 3;
export const CHALLENGE_OF = 5;
export const CHALLENGE_DAYS = 7;
export const MAX_ACTIVE_CHALLENGES = 3;
/** Recent games the target is taken from. */
export const CHALLENGE_RECENT = 20;

export type ChallengeStatus = "in_progress" | "completed" | "failed";

export interface ChallengeProgress {
  status: ChallengeStatus;
  met: number;
  /** Games that counted (had the metric). */
  played: number;
  /** One entry per counted game, oldest first. */
  results: boolean[];
  /** Deadline for weekly challenges (epoch ms). */
  endsAt: number | null;
  summary: string;
}

export function challengeTitle(spec: ChallengeSpec): string {
  const when = spec.kind === "next5" ? `in ${CHALLENGE_NEED} of your next ${CHALLENGE_OF} games` : `in ${CHALLENGE_NEED} games within ${CHALLENGE_DAYS} days`;
  return `${describeTarget(spec)}, ${when}`;
}

export function evaluateChallenge(spec: ChallengeSpec, games: MatchAnalysis[], startedAt: number, now: number): ChallengeProgress {
  const endsAt = spec.kind === "week" ? startedAt + CHALLENGE_DAYS * 86_400_000 : null;
  const counted = games
    .filter((g) => g.startedAt >= startedAt && (endsAt === null || g.startedAt < endsAt))
    .sort((a, b) => a.startedAt - b.startedAt)
    .map((g) => goalMet(spec, g))
    .filter((x): x is boolean => x !== null);
  const results = spec.kind === "next5" ? counted.slice(0, CHALLENGE_OF) : counted;
  const met = results.filter(Boolean).length;
  const played = results.length;

  let status: ChallengeStatus = "in_progress";
  if (met >= CHALLENGE_NEED) status = "completed";
  else if (spec.kind === "next5" && met + (CHALLENGE_OF - played) < CHALLENGE_NEED) status = "failed";
  else if (endsAt !== null && now >= endsAt) status = "failed";

  const summary =
    status === "completed" ? `Done: ${met} of ${played} ${played === 1 ? "game" : "games"}.`
      : status === "failed" ? (spec.kind === "next5" ? `Not this time: ${met} of ${played}. Try again when you're ready.` : `The week ended with ${met} of ${CHALLENGE_NEED}. Try again when you're ready.`)
        : played === 0 ? "No games yet since you accepted it."
          : spec.kind === "next5" ? `${met} of ${CHALLENGE_NEED} so far, ${CHALLENGE_OF - played} ${CHALLENGE_OF - played === 1 ? "game" : "games"} left.`
            : `${met} of ${CHALLENGE_NEED} so far.`;
  return { status, met, played, results, endsAt, summary };
}

export interface ChallengeSuggestion {
  metric: GoalMetric;
  target: number;
  title: string;
  /** How often the target was met in the recent games it comes from. */
  recent: { met: number; n: number };
}

/**
 * Targets slightly better than the player's recent level (60th percentile in the good
 * direction of the last 20 games with the metric), so 3 of 5 is a real but reachable try.
 * The focus metric goes first; metrics that already have an active challenge are skipped.
 */
export function suggestChallenges(games: MatchAnalysis[], opts: { focus?: string | null; exclude?: string[]; max?: number } = {}): ChallengeSuggestion[] {
  const order = (Object.keys(GOAL_METRICS) as GoalMetric[]).sort((a, b) => Number(b === opts.focus) - Number(a === opts.focus));
  const out: ChallengeSuggestion[] = [];
  for (const metric of order) {
    if (opts.exclude?.includes(metric)) continue;
    const def = GOAL_METRICS[metric];
    const recent = games
      .filter((g) => g.analyzable && def.modes.includes(g.mode) && def.extract(g) !== null)
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, CHALLENGE_RECENT);
    if (recent.length < 10) continue;
    const values = recent.map((g) => def.extract(g)!);
    const raw = quantile(values, def.higherIsBetter ? 0.6 : 0.4);
    const target = Math.round(raw / def.step) * def.step;
    const spec = { metric, target };
    const { met, n } = successRate(spec, recent);
    // Skip targets that are already routine or rarely reached: the try should be real.
    if (n === 0 || met / n > 0.75 || met / n < 0.2) continue;
    out.push({ metric, target, title: describeTarget(spec), recent: { met, n } });
    if (out.length >= (opts.max ?? 3)) break;
  }
  return out;
}
