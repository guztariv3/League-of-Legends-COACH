/**
 * The Coach's decision contract (D-10). Every engine (itemization, skills,
 * strategy, draft, review, insights) reports what it recommends in this one
 * shape, so the interface never decides anything and engines can change on
 * their own. A decision always says why: one with no reason is rejected.
 */

/** moment = a window the game just opened (an enemy died, a level edge) that closes by itself (phase 6). */
export type DecisionKind = "warning" | "moment" | "item" | "boots" | "skill" | "strategy" | "gameplan" | "review" | "focus";
/** fact = measured, observation = pattern in the data, hypothesis = an interpretation. */
export type Basis = "fact" | "observation" | "hypothesis";
export type DecisionPriority = "critical" | "important" | "info";
/** Where a piece of evidence comes from; global statistics are only ever supporting evidence. */
export type EvidenceSource = "this_game" | "your_games" | "game_data" | "global_stats";

export interface DecisionEvidence {
  label: string;
  value: string;
  source: EvidenceSource;
  /** Games behind the figure, when it is a statistic. */
  sampleSize?: number;
}

export interface DecisionOption {
  label: string;
  ref?: string;
  reason?: string;
}

export interface CoachDecision {
  /** Stable for the same recommendation (e.g. "item:3135"), so a change can be detected. */
  id: string;
  kind: DecisionKind;
  basis: Basis;
  priority: DecisionPriority;
  /** 0..1 */
  confidence: number;
  /** What to do, in a few words (e.g. "Next: Void Staff"). */
  headline: string;
  /** What the recommendation points at (item id, skill slot…), for images and links. */
  ref?: string;
  /** Why, most important first. Never empty. */
  reasons: string[];
  evidence: DecisionEvidence[];
  alternatives: DecisionOption[];
}

export type DecisionInput = Omit<CoachDecision, "confidence" | "evidence" | "alternatives"> &
  Partial<Pick<CoachDecision, "evidence" | "alternatives">> & { confidence: number };

/**
 * How sure a recommendation is, in words (never shown as a number): a strong recommendation, a
 * preferred option among viable ones, or an uncertain situation where the alternative matters.
 */
export type Certainty = "strong" | "preferred" | "uncertain";
export function certaintyOf(d: Pick<CoachDecision, "confidence">): Certainty {
  return d.confidence >= 0.8 ? "strong" : d.confidence >= 0.6 ? "preferred" : "uncertain";
}

/** Builds a decision, enforcing the contract: at least one reason and a confidence in 0..1. */
export function decide(input: DecisionInput): CoachDecision {
  const reasons = input.reasons.map((r) => r.trim()).filter(Boolean);
  if (!reasons.length) throw new Error(`Coach decision "${input.id}" has no reason`);
  if (!Number.isFinite(input.confidence)) throw new Error(`Coach decision "${input.id}" has no confidence`);
  return {
    ...input,
    reasons,
    confidence: Math.min(1, Math.max(0, input.confidence)),
    evidence: input.evidence ?? [],
    alternatives: input.alternatives ?? [],
  };
}

const PRIORITY_RANK: Record<DecisionPriority, number> = { critical: 0, important: 1, info: 2 };
/**
 * Within the same priority, what matters first: survival warnings, then the item and skill
 * decisions of this moment, then the short-term plan, then facts about the game, then the
 * long-term review and improvement focus.
 */
// Survival, then a window that closes by itself (objective / key moment), then item and skill, then the plan.
const KIND_RANK: Record<DecisionKind, number> = { warning: 0, moment: 1, item: 2, skill: 3, boots: 4, gameplan: 5, strategy: 6, review: 7, focus: 8 };

/** Most pressing first: priority, then what kind of decision it is, then confidence. Stable for ties. */
export function rankDecisions(decisions: CoachDecision[]): CoachDecision[] {
  return decisions
    .map((d, i) => ({ d, i }))
    .sort((a, b) =>
      PRIORITY_RANK[a.d.priority] - PRIORITY_RANK[b.d.priority] || KIND_RANK[a.d.kind] - KIND_RANK[b.d.kind] || b.d.confidence - a.d.confidence || a.i - b.i)
    .map(({ d }) => d);
}

/**
 * The one decision to show on the "Now" card. The previous one stays while it
 * is still offered at the same or higher priority, so the card doesn't flicker
 * between near-equal options.
 */
export function pickNow(decisions: CoachDecision[], previousId?: string | null): CoachDecision | null {
  const ranked = rankDecisions(decisions);
  const top = ranked[0];
  if (!top) return null;
  const kept = previousId ? ranked.find((d) => d.id === previousId) : undefined;
  return kept && PRIORITY_RANK[kept.priority] <= PRIORITY_RANK[top.priority] ? kept : top;
}

/** True when a recommendation of the same kind now points somewhere else: shown as a "Coach adjustment". */
export function isAdjustment(previous: CoachDecision | null | undefined, next: CoachDecision | null | undefined): boolean {
  return !!previous && !!next && previous.kind === next.kind && previous.id !== next.id;
}
