/**
 * Policy / Safety engine (brief §23, §91; decision D-02).
 *
 * Every live message belongs to a category. Only allow-listed categories can
 * reach the player; everything else is blocked and the reason is recorded
 * internally. The allow-list follows Riot's third-party policy: power-spike
 * notices about what is visible in game are allowed. The following are
 * prohibited and not implementable here: notifications that dictate actions
 * from the game state, enemy ultimate tracking, enemy summoner-spell
 * cooldowns, and predictions of enemy intent.
 */

export type LiveCategory =
  | "own_level_spike"
  | "own_item_spike"
  | "enemy_level_spike"
  | "enemy_item_spike"
  | "objective_taken"
  | "goal_progress";

/** Categories that must never exist in the live Coach. */
export const BLOCKED_CATEGORIES = [
  "directive", // "go gank top", "back now"… (Riot: apps must not dictate player decisions)
  "enemy_ultimate_timer", // banned by Riot since March 2025
  "enemy_summoner_timer", // conflicting sources → blocked (conservative)
  "enemy_intent_prediction", // intent is not observable (D-02)
  "objective_timer", // pending policy verification
  "memory_or_process_access", // never: Vanguard / game integrity
] as const;

export const ALLOWED_CATEGORIES: readonly LiveCategory[] = [
  "own_level_spike",
  "own_item_spike",
  "enemy_level_spike",
  "enemy_item_spike",
  "objective_taken",
  "goal_progress",
];

/**
 * Words that would turn a notice into an order. Templates are fixed, so this
 * is a last line of defence (tested) against a template that drifts into
 * dictating play.
 */
const DIRECTIVE_PATTERNS = [/\b(ve|vete|ataca|gankea|retirate|retírate|haz|usa|compra|pushea|rota|juega)\b/i, /\b(go|gank|back|push|attack|buy|rotate)\b/i];

export interface PolicyDecision {
  allowed: boolean;
  reason?: string;
}

export interface PolicyLog {
  at: number;
  category: string;
  reason: string;
}

export class PolicyEngine {
  readonly log: PolicyLog[] = [];

  check(category: string, text: string, now = Date.now()): PolicyDecision {
    let reason: string | undefined;
    if ((BLOCKED_CATEGORIES as readonly string[]).includes(category)) reason = "blocked_category";
    else if (!(ALLOWED_CATEGORIES as readonly string[]).includes(category)) reason = "unknown_category";
    else if (DIRECTIVE_PATTERNS.some((re) => re.test(text))) reason = "directive_language";
    if (reason) {
      this.log.push({ at: now, category, reason });
      if (this.log.length > 200) this.log.shift();
      return { allowed: false, reason };
    }
    return { allowed: true };
  }
}
