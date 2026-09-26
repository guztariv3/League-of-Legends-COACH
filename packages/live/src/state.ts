import type { AllGameData, LiveEvent, LivePlayer } from "./schema.js";

/**
 * Central live Game State (brief §28), built only from what the Live Client
 * Data API exposes, which is information the player can see in the game. Things
 * that are not observable (enemy cooldowns, positions, intentions) are not
 * modelled at all.
 */

export interface PlayerState {
  name: string;
  champion: string;
  /** Data Dragon id (for art and for matching the player's history), e.g. "MissFortune". */
  championId: string;
  team: "ORDER" | "CHAOS";
  position: string | null;
  level: number;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  isDead: boolean;
  /** Item ids currently held. */
  items: number[];
  /** Sum of item prices (from the snapshot or the knowledge bundle). */
  itemGold: number;
}

export interface GameState {
  time: number;
  mode: string | null;
  /** Map id as reported by the game (11 = Summoner's Rift, 12 = Howling Abyss). */
  map: number | null;
  me: PlayerState | null;
  /** The player's unspent gold (the game reports it only for the active player). */
  gold: number | null;
  /** The player's ability ranks; null when the game doesn't report them. */
  abilities: AbilityRanks | null;
  /** Levels not yet spent on an ability (level − ranks); null without ability data. */
  skillPoints: number | null;
  allies: PlayerState[];
  enemies: PlayerState[];
  /** Events seen so far (deduplicated by EventID). */
  events: LiveEvent[];
  lastEventId: number;
  /** Data quality: false when the snapshot lacked the active player or teams. */
  complete: boolean;
}

export interface AbilityRanks { q: number; w: number; e: number; r: number }

export interface StateContext {
  /** Item id → price, from the active knowledge bundle (fallback when the snapshot has none). */
  itemPrices?: Map<number, number>;
}

function playerName(p: { riotId?: string | undefined; summonerName?: string | undefined }): string {
  return p.riotId ?? p.summonerName ?? "";
}

const RAW_PREFIX = "game_character_displayname_";

/** Data Dragon id from the live data; without the raw name, the display name minus spaces and symbols. */
export function championIdOf(p: { championName: string; rawChampionName?: string | undefined }): string {
  if (p.rawChampionName?.startsWith(RAW_PREFIX)) return p.rawChampionName.slice(RAW_PREFIX.length);
  return p.championName.replace(/[^A-Za-z0-9]/g, "");
}

function toPlayer(p: LivePlayer, ctx: StateContext): PlayerState {
  const items = p.items.map((i) => i.itemID);
  const itemGold = p.items.reduce((s, i) => s + (i.price ?? ctx.itemPrices?.get(i.itemID) ?? 0) * (i.count ?? 1), 0);
  return {
    name: playerName(p),
    champion: p.championName,
    championId: championIdOf(p),
    team: p.team === "CHAOS" ? "CHAOS" : "ORDER",
    position: p.position && p.position !== "NONE" ? p.position : null,
    level: p.level,
    kills: p.scores?.kills ?? 0,
    deaths: p.scores?.deaths ?? 0,
    assists: p.scores?.assists ?? 0,
    cs: p.scores?.creepScore ?? 0,
    isDead: p.isDead ?? false,
    items,
    itemGold,
  };
}

export function emptyState(): GameState {
  return { time: 0, mode: null, map: null, me: null, gold: null, abilities: null, skillPoints: null, allies: [], enemies: [], events: [], lastEventId: -1, complete: false };
}

export function reduceState(prev: GameState, data: AllGameData, ctx: StateContext = {}): GameState {
  const myName = playerName(data.activePlayer);
  const players = data.allPlayers.map((p) => toPlayer(p, ctx));
  const me = players.find((p) => p.name && p.name === myName) ?? null;
  const myTeam = me?.team ?? null;
  const newEvents = data.events.Events.filter((e) => e.EventID > prev.lastEventId);
  const a = data.activePlayer.abilities;
  const abilities: AbilityRanks | null = a && (a.Q || a.W || a.E || a.R)
    ? { q: a.Q?.abilityLevel ?? 0, w: a.W?.abilityLevel ?? 0, e: a.E?.abilityLevel ?? 0, r: a.R?.abilityLevel ?? 0 }
    : null;
  const level = data.activePlayer.level ?? me?.level ?? null;
  return {
    time: data.gameData.gameTime,
    mode: data.gameData.gameMode ?? null,
    map: data.gameData.mapNumber ?? null,
    me,
    gold: data.activePlayer.currentGold ?? null,
    abilities,
    // Some champions get free ranks (Udyr, Aphelios…); never report a negative count.
    skillPoints: abilities && level !== null ? Math.max(0, level - (abilities.q + abilities.w + abilities.e + abilities.r)) : null,
    allies: myTeam ? players.filter((p) => p.team === myTeam && p !== me) : [],
    enemies: myTeam ? players.filter((p) => p.team !== myTeam) : [],
    events: [...prev.events, ...newEvents],
    lastEventId: newEvents.reduce((m, e) => Math.max(m, e.EventID), prev.lastEventId),
    complete: me !== null && players.length > 0,
  };
}

/** The enemy in the player's lane, when the API reports positions (Summoner's Rift). */
export function laneOpponent(state: GameState): PlayerState | null {
  const pos = state.me?.position;
  if (!pos) return null;
  const same = state.enemies.filter((e) => e.position === pos);
  return same.length === 1 ? same[0]! : null;
}

const MAP_NAMES: Record<number, string> = { 11: "Summoner's Rift", 12: "Howling Abyss" };
const MODE_NAMES: Record<string, string> = { CLASSIC: "", PRACTICETOOL: "Practice Tool", ARAM: "ARAM" };

export interface ModeInfo {
  /** What the window shows, e.g. "ARAM · Howling Abyss". */
  label: string;
  /** Whether the game reports lane positions (Summoner's Rift): lane-opponent notices need them. */
  lanes: boolean;
}

/**
 * The mode as the game reports it. Modes without a known name (new or rotating ones)
 * are shown by the game's own code rather than a guessed name.
 */
export function modeInfo(state: GameState): ModeInfo | null {
  if (!state.complete) return null;
  const code = state.mode ?? "";
  const mode = code in MODE_NAMES ? MODE_NAMES[code] : code;
  const map = state.map !== null ? MAP_NAMES[state.map] : undefined;
  return { label: [mode, map].filter(Boolean).join(" · ") || "Unknown mode", lanes: state.me?.position != null };
}
