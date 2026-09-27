import type { Catalog, PurchasePlan } from "@coach/itemization";
import { laneOpponent, type GameState, type GoldDifference, type Objectives, type PlayerState } from "@coach/live";
import { decide, type CoachDecision } from "./decision.js";
import { LANE_GAP, TEAM_GAP } from "./strategy.js";

/**
 * The live game plan (phase 2): where you stand in your lane and as a team, your next power
 * spike and your lane opponent's, and what that means right now. It is recomputed from every
 * game snapshot, so the plan changes with the game instead of following the champion-select
 * script. Warnings (what to avoid) only appear when a measured fact calls for them.
 *
 * Everything here comes from the Live Client Data API (items, levels, deaths, events, your
 * health and resource) and the patch's item data; no timers or numbers are assumed from
 * outside the game.
 */

/** Level gap that counts as ahead / behind on its own (item-gold gaps: LANE_GAP, TEAM_GAP). */
export const LEVEL_GAP = 2;
/** Health share below which trading is a risk. */
export const LOW_HEALTH = 0.3;
/** Mana share below which an ability-based champion can't trade properly. */
export const LOW_MANA = 0.2;

export type Standing = "ahead" | "even" | "behind";

export interface Situation {
  /** "lane" until the first turret of the game falls (from the event feed). */
  phase: "lane" | "post-lane";
  lane: { opponent: PlayerState; goldDiff: number; levelDiff: number; myItems: number; theirItems: number; standing: Standing } | null;
  team: { goldDiff: number; alive: number; enemiesAlive: number; standing: Standing };
  /** Your next power spike: the next item of your plan and when it arrives at your pace. */
  mySpike: { item: string; at: number | null } | null;
  health: number | null;
  mana: number | null;
}

const completedCount = (items: number[], catalog: Catalog | null) =>
  catalog ? items.filter((id) => catalog.items.get(id)?.completed).length : 0;

const standingOf = (goldDiff: number, levelDiff: number, gap: number): Standing =>
  goldDiff >= gap || levelDiff >= LEVEL_GAP ? "ahead" : goldDiff <= -gap || levelDiff <= -LEVEL_GAP ? "behind" : "even";

export function readSituation(state: GameState, gold: GoldDifference | null, obj: Objectives | null, purchase: PurchasePlan | null, catalog: Catalog | null): Situation | null {
  const me = state.me;
  if (!me || !state.complete) return null;
  const opp = laneOpponent(state);
  let lane: Situation["lane"] = null;
  if (opp) {
    const goldDiff = me.itemGold - opp.itemGold, levelDiff = me.level - opp.level;
    lane = { opponent: opp, goldDiff, levelDiff, myItems: completedCount(me.items, catalog), theirItems: completedCount(opp.items, catalog), standing: standingOf(goldDiff, levelDiff, LANE_GAP) };
  }
  const teamGold = gold ? gold.allyTotal - gold.enemyTotal : 0;
  const alive = [me, ...state.allies].filter((p) => !p.isDead).length;
  const enemiesAlive = state.enemies.filter((p) => !p.isDead).length;
  const v = state.vitals;
  const next = purchase?.milestones[0];
  return {
    phase: obj && obj.ally.turrets + obj.enemy.turrets > 0 ? "post-lane" : "lane",
    lane,
    team: { goldDiff: teamGold, alive, enemiesAlive, standing: standingOf(teamGold, 0, TEAM_GAP) },
    mySpike: next ? { item: next.name, at: next.at } : null,
    health: v ? v.health / v.maxHealth : null,
    mana: v && v.resourceType === "MANA" && v.resource !== null && v.resourceMax ? v.resource / v.resourceMax : null,
  };
}

const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
const k = (n: number) => `${(Math.abs(n) / 1000).toFixed(1)}k`;
const pct = (x: number) => `${Math.round(x * 100)}%`;

/**
 * The plan and the warnings for this moment, as Coach decisions. Warnings rank above
 * everything else (survival first); the plan sits below the item and skill decisions.
 */
export function situationDecisions(s: Situation, input: { time: number; isDead: boolean; purchase: PurchasePlan | null }): CoachDecision[] {
  const out: CoachDecision[] = [];
  const spike = s.mySpike ? `${s.mySpike.item}${s.mySpike.at !== null && s.mySpike.at > input.time + 1 ? ` around ${clock(s.mySpike.at)}` : ""}` : null;
  const recallBuys = input.purchase?.now && input.purchase.now.spent >= 300 ? input.purchase.now.buys.map((b) => b.name).join(" + ") : null;

  // ---- 1. Survival and numbers (only while you are alive to act on them).
  if (!input.isDead) {
    const down = s.team.enemiesAlive - s.team.alive;
    if (down >= 2) {
      out.push(decide({
        id: `warning:numbers:${down}`, kind: "warning", basis: "fact", priority: "critical", confidence: 0.9,
        headline: `Your team is down ${s.team.alive} v ${s.team.enemiesAlive}: avoid fights and objectives`,
        reasons: [`${s.team.enemiesAlive - s.team.alive} more enemies are alive than allies. Wait for your team to respawn before you start anything.`],
        evidence: [{ label: "Alive", value: `${s.team.alive} allies vs ${s.team.enemiesAlive} enemies`, source: "this_game" }],
      }));
    }
    if (s.health !== null && s.health < LOW_HEALTH) {
      out.push(decide({
        id: "warning:health", kind: "warning", basis: "fact", priority: "critical", confidence: 0.85,
        headline: `Low health (${pct(s.health)}): don't take the next trade`,
        reasons: [
          "Any trade now risks your life and the gold and experience of the waves you'd miss.",
          ...(recallBuys ? [`Recalling now also buys ${recallBuys}.`] : []),
        ],
        evidence: [{ label: "Health", value: pct(s.health), source: "this_game" }],
      }));
    } else if (s.mana !== null && s.mana < LOW_MANA) {
      out.push(decide({
        id: "warning:mana", kind: "warning", basis: "fact", priority: "important", confidence: 0.8,
        headline: `Low mana (${pct(s.mana)}): avoid trades that need your abilities`,
        reasons: [
          "Without mana your abilities, and the damage they carry, aren't available.",
          ...(recallBuys ? [`A recall now buys ${recallBuys}.`] : []),
        ],
        evidence: [{ label: "Mana", value: pct(s.mana), source: "this_game" }],
      }));
    }
  }

  // ---- 2. The lane: your opponent's spike vs yours.
  const l = s.lane;
  if (s.phase === "lane" && l && l.theirItems > l.myItems) {
    out.push(decide({
      id: `warning:spike:${l.opponent.champion}:${l.theirItems}`, kind: "warning", basis: "fact", priority: "important", confidence: 0.75,
      headline: `${l.opponent.champion} has ${l.theirItems} completed item${l.theirItems > 1 ? "s" : ""}, you have ${l.myItems}: avoid extended trades`,
      reasons: [
        `Their finished item${l.theirItems > 1 ? "s give" : " gives"} them the stronger trades until you complete yours.`,
        ...(spike ? [`Your next spike: ${spike}.`] : []),
      ],
      evidence: [{ label: "Completed items", value: `${l.myItems} vs ${l.theirItems}`, source: "this_game" }],
    }));
  }

  // ---- 3. The plan for this moment.
  const detail = (x: NonNullable<Situation["lane"]>) => [
    x.goldDiff !== 0 ? `${k(x.goldDiff)} item gold ${x.goldDiff > 0 ? "ahead of" : "behind"} ${x.opponent.champion}` : null,
    x.levelDiff !== 0 ? `${Math.abs(x.levelDiff)} level${Math.abs(x.levelDiff) > 1 ? "s" : ""} ${x.levelDiff > 0 ? "up" : "down"}` : null,
  ].filter(Boolean).join(", ");
  if (s.phase === "lane" && l) {
    if (l.standing === "behind") {
      out.push(decide({
        id: "plan:lane-behind", kind: "gameplan", basis: "hypothesis", priority: "important", confidence: 0.7,
        headline: "Play for farm and safe experience; skip unnecessary fights",
        reasons: [
          `You are ${detail(l)}: fights now favour them.`,
          spike ? `Recover by farming to your next spike: ${spike}.` : "Recover by farming to your next item.",
        ],
        evidence: laneEvidence(l),
      }));
    } else if (l.standing === "ahead") {
      out.push(decide({
        id: "plan:lane-ahead", kind: "gameplan", basis: "hypothesis", priority: "info", confidence: 0.7,
        headline: "Use your lead on objectives, not extra fights",
        reasons: [
          `You are ${detail(l)}.`,
          "A lead is worth most when it becomes turrets, plates or dragons; a lost fight gives it back.",
        ],
        evidence: laneEvidence(l),
      }));
    } else if (spike) {
      out.push(decide({
        id: "plan:lane-even", kind: "gameplan", basis: "hypothesis", priority: "info", confidence: 0.65,
        headline: `Even lane: farm to your next spike (${spike})`,
        reasons: ["Neither side has a clear edge yet; your next item is what changes the lane."],
      }));
    }
  } else if (s.phase === "post-lane") {
    const t = s.team;
    if (t.standing === "ahead") {
      out.push(decide({
        id: "plan:team-ahead", kind: "gameplan", basis: "hypothesis", priority: "info", confidence: 0.7,
        headline: "Your team is ahead: group and take objectives",
        reasons: [`Your team has ${k(t.goldDiff)} more item gold; together you are stronger right now.`, "Fighting apart lets them pick you off one by one."],
        evidence: [{ label: "Team item gold", value: `+${Math.round(t.goldDiff)}`, source: "this_game" }],
      }));
    } else if (t.standing === "behind") {
      out.push(decide({
        id: "plan:team-behind", kind: "gameplan", basis: "hypothesis", priority: "important", confidence: 0.7,
        headline: "Your team is behind: avoid even fights, farm safely and defend",
        reasons: [`The enemy team has ${k(t.goldDiff)} more item gold, so an even fight favours them.`, spike ? `Your next spike: ${spike}.` : "Each item you finish closes the gap."],
        evidence: [{ label: "Team item gold", value: `${Math.round(t.goldDiff)}`, source: "this_game" }],
      }));
    }
  }
  return out;
}

const laneEvidence = (l: NonNullable<Situation["lane"]>) => [
  { label: `Item gold vs ${l.opponent.champion}`, value: `${l.goldDiff >= 0 ? "+" : ""}${Math.round(l.goldDiff)}`, source: "this_game" as const },
  { label: "Levels", value: `${l.levelDiff >= 0 ? "+" : ""}${l.levelDiff}`, source: "this_game" as const },
];
