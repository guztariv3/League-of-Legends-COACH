import type { GameState, PlayerState } from "./state.js";

/**
 * Scoreboard summaries built only from what every player can already see in
 * the game (TAB screen and kill feed). Nothing here is hidden information.
 */

export interface GoldRow {
  ally: PlayerState;
  enemy: PlayerState;
  /** ally − enemy item gold. */
  diff: number;
}

export interface GoldDifference {
  /** Enemy gold isn't exposed by the game, so both sides are compared by the value of their items. */
  basis: "item_gold";
  /** "position" on Summoner's Rift; "order" where the game reports no lanes (ARAM and similar). */
  pairedBy: "position" | "order";
  rows: GoldRow[];
  allyTotal: number;
  enemyTotal: number;
}

const LANE_ORDER = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];

/** Item-gold difference of each matchup and of the whole team, like the scoreboard shows. */
export function goldDifference(state: GameState): GoldDifference | null {
  if (!state.complete || !state.me) return null;
  const allies = [state.me, ...state.allies];
  const enemies = state.enemies;
  const total = (ps: PlayerState[]) => ps.reduce((s, p) => s + p.itemGold, 0);
  const byPosition = allies.every((p) => p.position) && enemies.every((p) => p.position);
  const rows: GoldRow[] = [];
  if (byPosition) {
    for (const pos of LANE_ORDER) {
      const ally = allies.find((p) => p.position === pos);
      const enemy = enemies.find((p) => p.position === pos);
      if (ally && enemy) rows.push({ ally, enemy, diff: ally.itemGold - enemy.itemGold });
    }
  } else {
    // Without lanes there is no real opponent: pair by the order the game lists players, the player first.
    allies.forEach((ally, i) => {
      const enemy = enemies[i];
      if (enemy) rows.push({ ally, enemy, diff: ally.itemGold - enemy.itemGold });
    });
  }
  return { basis: "item_gold", pairedBy: byPosition ? "position" : "order", rows, allyTotal: total(allies), enemyTotal: total(enemies) };
}

export interface TeamObjectives {
  dragons: string[];
  heralds: number;
  barons: number;
  turrets: number;
  inhibitors: number;
}

export interface Objectives {
  ally: TeamObjectives;
  enemy: TeamObjectives;
}

const empty = (): TeamObjectives => ({ dragons: [], heralds: 0, barons: 0, turrets: 0, inhibitors: 0 });

/**
 * Objectives each team has taken, from the game's event feed. Turrets and
 * inhibitors are credited from the structure's owner in its name (T1 = ORDER,
 * T2 = CHAOS), so executes and minion kills still count; monsters are credited
 * to the killer's team when the killer is a player.
 */
export function objectives(state: GameState): Objectives | null {
  if (!state.complete || !state.me) return null;
  const myTeam = state.me.team;
  const allyNames = new Set([state.me.name, ...state.allies.map((a) => a.name)].filter(Boolean));
  const enemyNames = new Set(state.enemies.map((e) => e.name).filter(Boolean));
  const out: Objectives = { ally: empty(), enemy: empty() };
  const byKiller = (e: Record<string, unknown>): TeamObjectives | null => {
    const killer = String(e["KillerName"] ?? "");
    return allyNames.has(killer) ? out.ally : enemyNames.has(killer) ? out.enemy : null;
  };
  const byOwner = (structure: unknown): TeamObjectives | null => {
    const owner = /_T1_/.test(String(structure)) ? "ORDER" : /_T2_/.test(String(structure)) ? "CHAOS" : null;
    if (!owner) return null;
    return owner === myTeam ? out.enemy : out.ally; // a destroyed structure counts for the other team
  };
  for (const e of state.events as Record<string, unknown>[]) {
    switch (e["EventName"]) {
      case "DragonKill": { const t = byKiller(e); if (t) t.dragons.push(String(e["DragonType"] ?? "Dragon")); break; }
      case "HeraldKill": { const t = byKiller(e); if (t) t.heralds++; break; }
      case "BaronKill": { const t = byKiller(e); if (t) t.barons++; break; }
      case "TurretKilled": { const t = byOwner(e["TurretKilled"]); if (t) t.turrets++; break; }
      case "InhibKilled": { const t = byOwner(e["InhibKilled"]); if (t) t.inhibitors++; break; }
    }
  }
  return out;
}
