import type { LiveCategory } from "./policy.js";
import { laneOpponent, type GameState } from "./state.js";

/**
 * Event intelligence (brief §29): turns state changes into candidate signals.
 * Most changes produce no signal at all. Messages are informative templates
 * about what the player can already see in game; they never give orders.
 */

export interface LiveSignal {
  key: string;
  category: LiveCategory;
  /** "important" can interrupt discreetly; "info" never interrupts. */
  priority: "important" | "info";
  text: string;
  at: number;
}

export interface SignalConfig {
  /** Item price from which a purchase counts as a power spike (knowledge-dependent). */
  bigItemGold: number;
  /** Levels that unlock ultimate ranks. */
  spikeLevels: number[];
  /** Player's chosen focus metric (from Coach memory), e.g. "csPerMin". */
  focus?: string | null;
  /** Target for the focus metric, when a goal exists. */
  focusTarget?: number | null;
  itemPrices?: Map<number, number>;
  itemNames?: Map<number, string>;
}

export const DEFAULT_SIGNAL_CONFIG: SignalConfig = { bigItemGold: 2200, spikeLevels: [6, 11, 16] };

const OBJECTIVES: Record<string, string> = {
  DragonKill: "un dragón",
  BaronKill: "el Barón Nashor",
  HeraldKill: "el Heraldo",
  InhibKilled: "un inhibidor",
};

function bigItems(items: number[], cfg: SignalConfig): number[] {
  return items.filter((id) => (cfg.itemPrices?.get(id) ?? 0) >= cfg.bigItemGold);
}

export function detectSignals(prev: GameState, next: GameState, cfg: SignalConfig): LiveSignal[] {
  const out: LiveSignal[] = [];
  const at = next.time;
  const me = next.me;
  const before = prev.me;
  if (!me || !next.complete) return out;

  // Own power spikes
  if (before) {
    for (const lvl of cfg.spikeLevels) {
      if (before.level < lvl && me.level >= lvl) {
        out.push({ key: `own-level-${lvl}`, category: "own_level_spike", priority: lvl === 6 ? "important" : "info", text: `Has llegado a nivel ${lvl}: tu definitiva ${lvl === 6 ? "ya está disponible" : "sube de rango"}.`, at });
      }
    }
    const newBig = bigItems(me.items, cfg).filter((id) => !before.items.includes(id));
    for (const id of newBig) {
      out.push({ key: `own-item-${id}`, category: "own_item_spike", priority: "important", text: `Has completado ${cfg.itemNames?.get(id) ?? "un objeto importante"}: es un pico de poder.`, at });
    }
  }

  // Lane opponent power spikes (visible on the in-game scoreboard)
  const opp = laneOpponent(next);
  const oppBefore = opp ? prev.enemies.find((e) => e.name === opp.name && e.champion === opp.champion) : undefined;
  if (opp && oppBefore) {
    if (oppBefore.level < 6 && opp.level >= 6) {
      out.push({ key: `enemy-level-6-${opp.champion}`, category: "enemy_level_spike", priority: "important", text: `${opp.champion} ha llegado a nivel 6.`, at });
    }
    const newBig = bigItems(opp.items, cfg).filter((id) => !oppBefore.items.includes(id));
    for (const id of newBig) {
      out.push({ key: `enemy-item-${opp.champion}-${id}`, category: "enemy_item_spike", priority: "important", text: `${opp.champion} ha completado ${cfg.itemNames?.get(id) ?? "un objeto importante"}.`, at });
    }
  }

  // Objectives (informational)
  const fresh = next.events.filter((e) => e.EventID > prev.lastEventId);
  for (const e of fresh) {
    const what = OBJECTIVES[e.EventName];
    if (!what) continue;
    const killer = String((e as Record<string, unknown>)["KillerName"] ?? "");
    const allyNames = new Set([me.name, ...next.allies.map((a) => a.name)]);
    const side = killer ? (allyNames.has(killer) ? "Tu equipo" : "El equipo rival") : null;
    // Stamped with the event's own time, so objectives from before the Coach started are dropped as stale.
    out.push({ key: `obj-${e.EventID}`, category: "objective_taken", priority: "info", text: side ? `${side} ha conseguido ${what}.` : `Se ha conseguido ${what}.`, at: e.EventTime });
  }

  // Focus progress (the player's own goal), every 5 minutes from minute 10
  if (cfg.focus === "csPerMin" && next.time >= 600) {
    const mark = Math.floor(next.time / 300);
    if (mark !== Math.floor(prev.time / 300)) {
      const cspm = me.cs / (next.time / 60);
      out.push({
        key: `focus-cs-${mark}`,
        category: "goal_progress",
        priority: "info",
        text: `Tu CS por minuto: ${cspm.toFixed(1)}${cfg.focusTarget ? ` (tu objetivo: ${cfg.focusTarget})` : ""}.`,
        at,
      });
    }
  }
  return out;
}

/** High cognitive load: 2+ champion kills in the last 15 s of game time (a fight is likely happening). */
export function inFight(state: GameState): boolean {
  return state.events.filter((e) => e.EventName === "ChampionKill" && state.time - e.EventTime <= 15).length >= 2;
}
