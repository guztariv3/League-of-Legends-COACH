import type { PurchasePlan } from "@coach/itemization";
import { laneOpponent, type GameState } from "@coach/live";
import { decide, type CoachDecision } from "./decision.js";

/**
 * GAMEPLAY BY PHASE (phase 6): the moments a coach points out while playing, read only from what
 * the game reports live: who is dead and for how long (the scoreboard's respawn timers), levels
 * (and your own ultimate rank), the turrets that fell and the clock. The Live Client Data API does
 * not report minion waves, positions or cooldowns, so nothing here pretends to know them: a wave
 * tip is tied to a moment the game does report (your opponent died), never to a guess about the
 * wave. Enemy cooldowns and ultimate timers are never tracked (a rule of this product).
 */

/** A window shorter than this isn't worth pointing out (seconds). */
export const MIN_WINDOW = 8;
/** Turret plates fall at 14:00. */
export const PLATES_UNTIL = 14 * 60;
/** Respawn timers from this long mean one death can decide an objective (seconds). */
export const LONG_RESPAWN = 40;

export interface PhaseInput {
  state: GameState;
  /** Turrets destroyed so far (both teams), from the event feed. */
  turretsDown: number;
  purchase: PurchasePlan | null;
}

const secs = (n: number) => `${Math.floor(n)}s`;

export function phaseDecisions({ state, turretsDown, purchase }: PhaseInput): CoachDecision[] {
  const me = state.me;
  if (!me || !state.complete || me.isDead) return [];
  const out: CoachDecision[] = [];
  const lane = turretsDown === 0;
  const opp = laneOpponent(state);
  const recallBuys = purchase?.now && purchase.now.spent >= 300 ? purchase.now.buys.map((b) => b.name).join(" + ") : null;
  const plates = state.time < PLATES_UNTIL;

  // ---- Lane: your opponent is dead.
  if (lane && opp?.isDead && (opp.respawn ?? 0) >= MIN_WINDOW) {
    out.push(decide({
      id: `phase:opp-dead:${opp.deaths}`, kind: "moment", basis: "fact", priority: "important", confidence: 0.8,
      headline: `${opp.champion} is dead for ${secs(opp.respawn!)}: push your wave, then ${recallBuys ? "recall" : plates ? "hit the turret" : "reset"}`,
      reasons: [
        `Nobody can contest your lane for ${secs(opp.respawn!)}. A wave pushed into their turret makes them lose gold and experience when they come back.`,
        recallBuys
          ? `Recalling after the push buys ${recallBuys} without losing a wave.`
          : plates ? "Before 14:00 each turret plate gives gold." : "Then back or join your team with the time you saved.",
      ],
      evidence: [{ label: `${opp.champion} respawns in`, value: secs(opp.respawn!), source: "this_game" }],
    }));
  }

  // ---- Lane: their jungler is dead, so no gank can come.
  const jungler = state.enemies.find((e) => e.position === "JUNGLE");
  if (lane && jungler?.isDead && (jungler.respawn ?? 0) >= MIN_WINDOW && jungler !== opp && !opp?.isDead) {
    out.push(decide({
      id: `phase:jungler-dead:${jungler.deaths}`, kind: "moment", basis: "fact", priority: "info", confidence: 0.7,
      headline: `Their jungler (${jungler.champion}) is dead for ${secs(jungler.respawn!)}: safer to trade and push`,
      reasons: ["No gank can come while their jungler is dead, so pushing your lane or trading costs less risk than usual."],
      evidence: [{ label: `${jungler.champion} respawns in`, value: secs(jungler.respawn!), source: "this_game" }],
    }));
  }

  // ---- Lane: level windows (levels are public; your ultimate rank is your own).
  if (lane && opp && !opp.isDead) {
    const myR = state.abilities?.r ?? (me.level >= 6 ? 1 : 0);
    if (me.level >= 6 && opp.level < 6 && myR >= 1) {
      out.push(decide({
        id: `phase:level6-first`, kind: "moment", basis: "fact", priority: "info", confidence: 0.7,
        headline: `You have your ultimate and ${opp.champion} doesn't yet: a window to trade`,
        reasons: [`You are level ${me.level}, ${opp.champion} is ${opp.level}. The window closes when they reach 6.`],
        evidence: [{ label: "Levels", value: `${me.level} vs ${opp.level}`, source: "this_game" }],
      }));
    } else if (opp.level >= 6 && me.level < 6) {
      out.push(decide({
        id: `warning:level6-behind`, kind: "warning", basis: "fact", priority: "important", confidence: 0.75,
        headline: `${opp.champion} reached level 6 before you: respect an all-in until you do`,
        reasons: [`${opp.champion} is level ${opp.level}, you are ${me.level}: their ultimate is available and yours isn't.`],
        evidence: [{ label: "Levels", value: `${me.level} vs ${opp.level}`, source: "this_game" }],
      }));
    } else if (state.time < 4 * 60 && me.level === 2 && opp.level === 1) {
      out.push(decide({
        id: `phase:level2-first`, kind: "moment", basis: "fact", priority: "info", confidence: 0.65,
        headline: `You hit level 2 first: a short window to trade`,
        reasons: [`A second ability against their one, until ${opp.champion} reaches level 2.`],
      }));
    }
  }

  // ---- Any time: more enemies dead than allies.
  const deadEnemies = state.enemies.filter((e) => e.isDead && (e.respawn ?? 0) >= MIN_WINDOW);
  const deadAllies = state.allies.filter((a) => a.isDead).length;
  if (deadEnemies.length - deadAllies >= 2) {
    const shortest = Math.min(...deadEnemies.map((e) => e.respawn!));
    out.push(decide({
      id: `phase:numbers:${deadEnemies.map((e) => `${e.champion}${e.deaths}`).join(",")}`, kind: "moment", basis: "fact", priority: "important", confidence: 0.8,
      headline: `${deadEnemies.length} enemies are dead for at least ${secs(shortest)}: take a turret or an objective with your team`,
      reasons: [
        "Kills are worth most when they become turrets, dragons or Baron before the enemies respawn.",
        "Pick what your team can reach in time; chasing the rest gives them the time back.",
      ],
      evidence: [{ label: "Dead enemies", value: deadEnemies.map((e) => `${e.champion} (${secs(e.respawn!)})`).join(", "), source: "this_game" }],
    }));
  }

  // ---- Later: death timers are long.
  const longest = Math.max(0, ...[...state.allies, ...state.enemies].map((p) => p.respawn ?? 0));
  if (!lane && longest >= LONG_RESPAWN && deadEnemies.length - deadAllies < 2) {
    out.push(decide({
      id: "phase:long-timers", kind: "gameplan", basis: "fact", priority: "info", confidence: 0.7,
      headline: "Death timers are long now: stay with your team",
      reasons: [
        `A death now costs up to ${secs(longest)}, time enough for the other team to take an objective.`,
        "Walking alone into areas your team can't see is where games are thrown.",
      ],
      evidence: [{ label: "Longest respawn right now", value: secs(longest), source: "this_game" }],
    }));
  }
  return out;
}

