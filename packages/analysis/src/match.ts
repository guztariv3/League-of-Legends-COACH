import {
  findParticipant,
  goldDiffAt,
  laneOpponent,
  type AnalysisMode,
  type NormalizedMatch,
  type RawTimeline,
  type Role,
} from "@coach/domain";

/** Bump whenever per-match analysis output changes. Old rows keep their version (history is immutable). */
export const ANALYSIS_VERSION = 2;

const EARLY_GAME_MS = 14 * 60_000;
const MID_GAME_MS = 15 * 60_000;

export interface MatchAnalysis {
  analysisVersion: number;
  matchId: string;
  puuid: string;
  mode: AnalysisMode;
  queueId: number;
  /** false for remakes and unsupported modes; such games are shown but never aggregated. */
  analyzable: boolean;
  patch: string;
  startedAt: number;
  durationSec: number;
  win: boolean;
  championName: string;
  championId: number;
  role: Role;
  kills: number;
  deaths: number;
  assists: number;
  /** (k + a) / max(1, d). */
  kda: number;
  killParticipation: number | null;
  damageShare: number | null;
  deathsPerMin: number;
  /** Summoner's Rift only; null elsewhere. */
  csPerMin: number | null;
  visionPerMin: number | null;
  goldDiff10: number | null;
  goldDiff15: number | null;
  /** Deaths before 14:00; requires the timeline. */
  earlyDeaths: number | null;
  laneOpponentChampion: string | null;
  /** Team total gold minus enemy team total gold at 15:00 (game-state proxy). v2+ */
  teamGoldDiff15: number | null;
  /** Deaths from 15:00 onwards; requires the timeline and a game lasting past 15:00. v2+ */
  deathsAfter15: number | null;
  hasTimeline: boolean;
}

export function analyzeMatch(match: NormalizedMatch, timeline: RawTimeline | null, puuid: string): MatchAnalysis | null {
  const me = findParticipant(match, puuid);
  if (!me) return null;
  const minutes = Math.max(1, match.durationSec / 60);
  const team = match.participants.filter((p) => p.teamId === me.teamId);
  const teamKills = team.reduce((s, p) => s + p.kills, 0);
  const teamDamage = team.reduce((s, p) => s + p.damageToChampions, 0);
  const sr = match.mode === "summoners_rift";
  const opp = sr ? laneOpponent(match, me) : undefined;

  let earlyDeaths: number | null = null;
  if (timeline && sr) {
    earlyDeaths = timeline.info.frames
      .flatMap((f) => f.events)
      .filter((e) => e.type === "CHAMPION_KILL" && e["victimId"] === me.participantId && e.timestamp < EARLY_GAME_MS)
      .length;
  }

  let teamGoldDiff15: number | null = null;
  let deathsAfter15: number | null = null;
  if (timeline && sr && match.durationSec > MID_GAME_MS / 1000) {
    const frame = timeline.info.frames.find((f) => Math.round(f.timestamp / timeline.info.frameInterval) === 15);
    if (frame) {
      let diff = 0;
      for (const p of match.participants) {
        const g = frame.participantFrames[String(p.participantId)]?.totalGold;
        if (g === undefined) { diff = NaN; break; }
        diff += p.teamId === me.teamId ? g : -g;
      }
      teamGoldDiff15 = Number.isFinite(diff) ? diff : null;
    }
    deathsAfter15 = timeline.info.frames
      .flatMap((f) => f.events)
      .filter((e) => e.type === "CHAMPION_KILL" && e["victimId"] === me.participantId && e.timestamp >= MID_GAME_MS)
      .length;
  }

  const gd = (minute: number) =>
    timeline && opp && match.durationSec / 60 >= minute
      ? goldDiffAt(timeline, me.participantId, opp.participantId, minute) ?? null
      : null;

  return {
    analysisVersion: ANALYSIS_VERSION,
    matchId: match.matchId,
    puuid,
    mode: match.mode,
    queueId: match.queueId,
    analyzable: !match.remake && match.mode !== "unsupported",
    patch: match.patch,
    startedAt: match.startedAt,
    durationSec: match.durationSec,
    win: me.win,
    championName: me.championName,
    championId: me.championId,
    role: me.role,
    kills: me.kills,
    deaths: me.deaths,
    assists: me.assists,
    kda: (me.kills + me.assists) / Math.max(1, me.deaths),
    killParticipation: teamKills > 0 ? (me.kills + me.assists) / teamKills : null,
    damageShare: teamDamage > 0 ? me.damageToChampions / teamDamage : null,
    deathsPerMin: me.deaths / minutes,
    csPerMin: sr ? me.cs / minutes : null,
    visionPerMin: sr && me.visionScore !== null ? me.visionScore / minutes : null,
    goldDiff10: gd(10),
    goldDiff15: gd(15),
    earlyDeaths,
    laneOpponentChampion: opp?.championName ?? null,
    teamGoldDiff15,
    deathsAfter15,
    hasTimeline: timeline !== null,
  };
}
