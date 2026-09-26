import type { GoldDifference, Objectives } from "@coach/live";
import { decide, type CoachDecision } from "./decision.js";

/**
 * Strategy facts for the live window (D-12): what the scoreboard and the event
 * feed already show, summed up. They are facts, never orders or predictions:
 * the player decides what to do with them (D-02).
 */

/** Team item-gold gap worth mentioning. */
export const TEAM_GAP = 2000;
/** Matchup item-gold gap worth mentioning. */
export const LANE_GAP = 1000;

const k = (n: number) => `${(Math.abs(n) / 1000).toFixed(1)}k`;

export interface StrategyInput {
  gold: GoldDifference | null;
  objectives: Objectives | null;
  /** The player's own row in the gold difference is the one whose ally is "me". */
  myName: string | null;
}

export function strategyFacts(input: StrategyInput): CoachDecision[] {
  const out: CoachDecision[] = [];
  const g = input.gold;
  if (g) {
    const team = g.allyTotal - g.enemyTotal;
    if (Math.abs(team) >= TEAM_GAP) {
      out.push(decide({
        id: `strategy:team-gold:${team > 0 ? "ahead" : "behind"}`,
        kind: "strategy",
        basis: "fact",
        priority: "info",
        confidence: 0.9,
        headline: team > 0 ? `Your team is ${k(team)} item gold ahead` : `Your team is ${k(team)} item gold behind`,
        reasons: [team > 0
          ? "More item gold means stronger fights for your team right now."
          : "Less item gold means the enemy team is stronger in fights right now."],
        evidence: [{ label: "Item gold", value: `${g.allyTotal} vs ${g.enemyTotal}`, source: "this_game" }],
      }));
    }
    const mine = g.pairedBy === "position" ? g.rows.find((r) => r.ally.name === input.myName) : undefined;
    if (mine && Math.abs(mine.diff) >= LANE_GAP) {
      out.push(decide({
        id: `strategy:lane-gold:${mine.diff > 0 ? "ahead" : "behind"}`,
        kind: "strategy",
        basis: "fact",
        priority: "info",
        confidence: 0.9,
        headline: mine.diff > 0 ? `You are ${k(mine.diff)} item gold ahead of ${mine.enemy.champion}` : `${mine.enemy.champion} is ${k(mine.diff)} item gold ahead of you`,
        reasons: [mine.diff > 0 ? "Your items give you the edge in your matchup." : "Their items give them the edge in your matchup."],
        evidence: [{ label: "Item gold", value: `${mine.ally.itemGold} vs ${mine.enemy.itemGold}`, source: "this_game" }],
      }));
    }
  }
  const o = input.objectives;
  if (o && (o.ally.dragons.length || o.enemy.dragons.length)) {
    const list = (d: string[]) => (d.length ? `${d.length} (${d.join(", ")})` : "0");
    out.push(decide({
      id: `strategy:dragons:${o.ally.dragons.length}-${o.enemy.dragons.length}`,
      kind: "strategy",
      basis: "fact",
      priority: "info",
      confidence: 0.95,
      headline: `Dragons: your team ${o.ally.dragons.length} · enemy ${o.enemy.dragons.length}`,
      reasons: [`Your team: ${list(o.ally.dragons)}. Enemy team: ${list(o.enemy.dragons)}.`],
    }));
  }
  return out;
}
