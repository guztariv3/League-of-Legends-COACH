import { PolicyEngine } from "./policy.js";
import { inFight, type LiveSignal } from "./signals.js";
import type { GameState } from "./state.js";

/**
 * Decides whether and when a signal reaches the player (brief §26–27, §35).
 * Order: policy → user controls → anti-spam → cognitive load (Focus Mode).
 * Most of the time the right answer is to do nothing.
 */

export type Intensity = "low" | "normal" | "high";

export interface LiveControls {
  paused: boolean;
  muted: boolean;
  /** Manual Focus Mode: only important messages, no animation. */
  focus: boolean;
  intensity: Intensity;
  /** Categories the player allowed to interrupt. */
  categories: Record<string, boolean>;
}

export const DEFAULT_CONTROLS: LiveControls = {
  paused: false,
  muted: false,
  focus: false,
  intensity: "normal",
  categories: {
    own_level_spike: true,
    own_item_spike: true,
    enemy_level_spike: true,
    enemy_item_spike: true,
    objective_taken: false,
    goal_progress: true,
  },
};

/** Minimum game seconds between shown messages, per intensity. */
const GAP: Record<Intensity, { important: number; info: number }> = {
  low: { important: 90, info: Infinity },
  normal: { important: 40, info: 120 },
  high: { important: 20, info: 45 },
};

export interface Delivery {
  signal: LiveSignal;
  /** Automatic Focus Mode was active (fight detected), so the message is shown compactly. */
  compact: boolean;
}

export class Notifier {
  private lastShown = -Infinity;
  private lastInfo = -Infinity;
  private readonly seen = new Set<string>();
  /** Important signals held back during a fight; re-evaluated afterwards. */
  private held: LiveSignal[] = [];
  readonly policy = new PolicyEngine();

  process(signals: LiveSignal[], state: GameState, controls: LiveControls, safeMode: boolean): Delivery[] {
    if (controls.paused) return [];
    const now = state.time;
    const candidates = [...this.held, ...signals].filter((s) => {
      if (this.seen.has(s.key)) return false;
      if (!this.policy.check(s.category, s.text).allowed) { this.seen.add(s.key); return false; }
      if (!controls.categories[s.category]) { this.seen.add(s.key); return false; }
      return true;
    });
    this.held = [];
    if (controls.muted) { candidates.forEach((s) => this.seen.add(s.key)); return []; }

    const fight = inFight(state);
    const focusOnly = controls.focus || safeMode || fight;
    const out: Delivery[] = [];
    for (const s of candidates.sort((a, b) => (a.priority === b.priority ? 0 : a.priority === "important" ? -1 : 1))) {
      // Signals older than 60 s of game time are stale: drop them rather than show late.
      if (now - s.at > 60) { this.seen.add(s.key); continue; }
      if (s.priority === "info") {
        if (focusOnly || now - this.lastInfo < GAP[controls.intensity].info || now - this.lastShown < GAP[controls.intensity].important) {
          this.seen.add(s.key); // info is never queued
          continue;
        }
        this.lastInfo = now;
      } else {
        if (fight) { this.held.push(s); continue; } // wait until the fight is over
        if (now - this.lastShown < GAP[controls.intensity].important) { this.held.push(s); continue; }
      }
      this.seen.add(s.key);
      this.lastShown = now;
      out.push({ signal: s, compact: focusOnly });
      break; // at most one message per update
    }
    return out;
  }
}
