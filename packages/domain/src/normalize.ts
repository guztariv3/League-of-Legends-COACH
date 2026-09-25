import { classifyMode, type AnalysisMode } from "./modes.js";
import { platformFromMatchId } from "./regions.js";
import type { RawMatch, RawParticipant, RawTimeline } from "./raw.js";

/** Bump when normalization output changes; stored alongside derived rows. */
export const NORMALIZATION_VERSION = 1;

export type Role = "TOP" | "JUNGLE" | "MIDDLE" | "BOTTOM" | "UTILITY" | "NONE";

export interface NormalizedParticipant {
  participantId: number;
  puuid: string;
  riotId: string | null;
  teamId: number;
  championId: number;
  championName: string;
  role: Role;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  gold: number;
  damageToChampions: number;
  visionScore: number | null;
  level: number;
  items: number[];
  /** Summoner spell keys (summoner1Id, summoner2Id). */
  spells: number[];
  /** Keystone and rune paths; null when the payload has no runes (e.g. some special modes). */
  runes: { keystone: number | null; primary: number | null; secondary: number | null };
}

export interface NormalizedMatch {
  matchId: string;
  platform: string;
  queueId: number;
  mode: AnalysisMode;
  /** "major.minor" taken from gameVersion. */
  patch: string;
  startedAt: number;
  durationSec: number;
  /** Games that ended by early surrender (remakes) are excluded from analysis. */
  remake: boolean;
  participants: NormalizedParticipant[];
}

const ROLES: readonly Role[] = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];

function toRole(p: RawParticipant): Role {
  const r = p.teamPosition || p.individualPosition || "";
  return (ROLES as readonly string[]).includes(r) ? (r as Role) : "NONE";
}

export function patchFromVersion(gameVersion: string): string {
  const [major, minor] = gameVersion.split(".");
  return major && minor ? `${major}.${minor}` : "unknown";
}

/**
 * gameDuration is in seconds when gameEndTimestamp is present and in
 * milliseconds for older payloads (Riot changed this in match-v5).
 */
export function durationSeconds(info: RawMatch["info"]): number {
  return info.gameEndTimestamp !== undefined ? info.gameDuration : Math.round(info.gameDuration / 1000);
}

export function normalizeMatch(raw: RawMatch): NormalizedMatch {
  const { info, metadata } = raw;
  const platform = platformFromMatchId(metadata.matchId)?.id ?? info.platformId.toLowerCase();
  return {
    matchId: metadata.matchId,
    platform,
    queueId: info.queueId,
    mode: classifyMode(info.gameMode, info.mapId),
    patch: patchFromVersion(info.gameVersion),
    startedAt: info.gameCreation,
    durationSec: durationSeconds(info),
    remake: info.participants.some((p) => p.gameEndedInEarlySurrender === true),
    participants: info.participants.map((p) => ({
      participantId: p.participantId,
      puuid: p.puuid,
      riotId: p.riotIdGameName ? `${p.riotIdGameName}#${p.riotIdTagline ?? ""}` : null,
      teamId: p.teamId,
      championId: p.championId,
      championName: p.championName,
      role: toRole(p),
      win: p.win,
      kills: p.kills,
      deaths: p.deaths,
      assists: p.assists,
      cs: p.totalMinionsKilled + p.neutralMinionsKilled,
      gold: p.goldEarned,
      damageToChampions: p.totalDamageDealtToChampions,
      visionScore: p.visionScore ?? null,
      level: p.champLevel,
      items: [p.item0, p.item1, p.item2, p.item3, p.item4, p.item5, p.item6].filter((i) => i > 0),
      spells: [p.summoner1Id, p.summoner2Id].filter((i) => i > 0),
      runes: {
        keystone: p.perks?.styles[0]?.selections[0]?.perk ?? null,
        primary: p.perks?.styles[0]?.style ?? null,
        secondary: p.perks?.styles[1]?.style ?? null,
      },
    })),
  };
}

export function findParticipant(match: NormalizedMatch, puuid: string): NormalizedParticipant | undefined {
  return match.participants.find((p) => p.puuid === puuid);
}

/** Direct lane opponent on Summoner's Rift (same role, other team), if unambiguous. */
export function laneOpponent(match: NormalizedMatch, me: NormalizedParticipant): NormalizedParticipant | undefined {
  if (match.mode !== "summoners_rift" || me.role === "NONE") return undefined;
  const candidates = match.participants.filter((p) => p.teamId !== me.teamId && p.role === me.role);
  return candidates.length === 1 ? candidates[0] : undefined;
}

/** Total-gold difference (me − opponent) at a given minute, from the timeline. */
export function goldDiffAt(
  timeline: RawTimeline,
  meId: number,
  oppId: number,
  minute: number,
): number | undefined {
  const frame = timeline.info.frames.find(
    (f) => Math.round(f.timestamp / timeline.info.frameInterval) === minute,
  );
  if (!frame) return undefined;
  const a = frame.participantFrames[String(meId)];
  const b = frame.participantFrames[String(oppId)];
  return a && b ? a.totalGold - b.totalGold : undefined;
}
