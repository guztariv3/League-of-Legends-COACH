import { decide, type CoachDecision } from "./decision.js";

/**
 * Skill advisor. It recommends the ultimate when a rank opens up (a rule of the
 * game) and otherwise follows the player's own levelling order with this
 * champion, taken from their timelines. Without enough of their own games it
 * stays silent about basic abilities instead of guessing a universal order.
 */

export type Slot = 1 | 2 | 3 | 4;
export const SLOT_KEY: Record<Slot, "Q" | "W" | "E" | "R"> = { 1: "Q", 2: "W", 3: "E", 4: "R" };

export interface AbilityRanks { q: number; w: number; e: number; r: number }

export interface SkillAdviceInput {
  champion: string;
  level: number;
  ranks: AbilityRanks;
  /** Levels not spent yet. */
  skillPoints: number;
  /** The player's past levelling orders with this champion (newest first). */
  history: Slot[][];
}

/** Games of the player's own needed before their order is suggested. */
export const MIN_HISTORY = 3;

const rankOf = (r: AbilityRanks, s: Slot) => (s === 1 ? r.q : s === 2 ? r.w : s === 3 ? r.e : r.r);

/** Standard caps: basic abilities up to 5 and at most half your level (rounded up); R at 6, 11 and 16. */
export function maxRank(slot: Slot, level: number): number {
  if (slot === 4) return level >= 16 ? 3 : level >= 11 ? 2 : level >= 6 ? 1 : 0;
  return Math.min(5, Math.ceil(level / 2));
}

/** Champions with their own ability rules (extra ranks, R from level 1…) break the standard caps. */
function standardRules(level: number, r: AbilityRanks): boolean {
  return ([1, 2, 3, 4] as Slot[]).every((s) => rankOf(r, s) <= maxRank(s, level));
}

/** Which basic ability the player maxed first, then second, most often. */
export function usualMaxOrder(history: Slot[][]): Slot[] | null {
  const counts = new Map<string, number>();
  for (const order of history) {
    const reached: Slot[] = [];
    const n: Record<number, number> = { 1: 0, 2: 0, 3: 0 };
    for (const s of order) {
      if (s === 4) continue;
      n[s] = (n[s] ?? 0) + 1;
      if (n[s] === 5) reached.push(s);
    }
    if (reached.length < 2) continue;
    const key = reached.slice(0, 2).join(",");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const best = [...counts].sort((a, b) => b[1] - a[1])[0];
  if (!best) return null;
  const [a, b] = best[0].split(",").map(Number) as [Slot, Slot];
  const third = ([1, 2, 3] as Slot[]).find((s) => s !== a && s !== b)!;
  return [a, b, third];
}

export function adviseSkill(input: SkillAdviceInput): CoachDecision | null {
  const { level, ranks, skillPoints, history, champion } = input;
  if (skillPoints <= 0 || !standardRules(level, ranks)) return null;
  const can = (s: Slot) => rankOf(ranks, s) < maxRank(s, level);

  if (can(4)) {
    return decide({
      id: `skill:R:${level}`,
      kind: "skill",
      basis: "fact",
      priority: "important",
      confidence: 0.95,
      headline: "Level up: R",
      ref: "R",
      reasons: [`Level ${level}: your ultimate can take a new rank.`],
    });
  }

  if (history.length < MIN_HISTORY) return null;
  const spent = ranks.q + ranks.w + ranks.e + ranks.r;
  const tally = new Map<Slot, number>();
  let games = 0;
  for (const order of history) {
    const s = order[spent];
    if (s === undefined) continue;
    games++;
    if (s !== 4 && can(s)) tally.set(s, (tally.get(s) ?? 0) + 1);
  }
  const [slot, count] = [...tally].sort((a, b) => b[1] - a[1])[0] ?? [];
  if (!slot || !count || games < MIN_HISTORY) return null;

  const max = usualMaxOrder(history);
  const key = SLOT_KEY[slot];
  return decide({
    id: `skill:${key}:${level}`,
    kind: "skill",
    basis: "observation",
    priority: "important",
    // How consistent the player is at this level, capped: it is their habit, not a rule.
    confidence: Math.min(0.85, count / games),
    headline: `Level up: ${key}`,
    ref: key,
    reasons: [`In ${count} of your last ${games} games with ${champion} you took ${key} at this point.`],
    evidence: [
      { label: "Your games with this champion", value: String(history.length), source: "your_games", sampleSize: history.length },
      ...(max ? [{ label: "You usually max", value: max.map((s) => SLOT_KEY[s]).join(" → "), source: "your_games" as const, sampleSize: history.length }] : []),
    ],
  });
}
