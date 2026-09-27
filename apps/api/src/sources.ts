import type { RawMatch, RawTimeline } from "@coach/domain";
import { RiotClient, type RiotLeagueEntry, type RiotMastery } from "@coach/riot";
import { generateHistory, mulberry32, SYNTHETIC_CHAMPIONS, type SyntheticGame } from "@coach/synthetic";
import type { DataSource } from "./config.js";

export interface ResolvedAccount {
  puuid: string;
  gameName: string;
  tagLine: string;
}

/** A game in progress (from the loading screen on). */
export interface ActiveGame {
  gameMode: string;
  mapId: number;
  queueId: number | null;
  /** True when the game was simulated by the synthetic environment. */
  simulated: boolean;
  participants: { puuid: string | null; teamId: number; championId: number; riotId: string | null }[];
}

/** One step of a synthetic rank history. */
export interface RankTrailPoint { at: Date; queueType: "RANKED_SOLO_5x5"; tier: string; rank: string; lp: number; wins: number; losses: number }

const TRAIL_TIERS = ["IRON", "BRONZE", "SILVER", "GOLD", "PLATINUM", "EMERALD", "DIAMOND"];
const TRAIL_DIVISIONS = ["IV", "III", "II", "I"];

/**
 * Walks the fictional player's ranked games oldest-first on a 100-points-per-division
 * ladder: a deterministic start and deterministic gains and losses per game.
 */
export function syntheticTrail(games: SyntheticGame[], puuid: string, seed: number): RankTrailPoint[] {
  const rand = mulberry32(seed ^ 0x5eed);
  let points = 800 + Math.floor(rand() * 500); // somewhere in Silver–Gold
  let wins = 0, losses = 0;
  const trail: RankTrailPoint[] = [];
  const ranked = games.filter((g) => g.match.info.queueId === 420).sort((a, b) => a.match.info.gameCreation - b.match.info.gameCreation);
  for (const g of ranked) {
    const me = g.match.info.participants.find((p) => p.puuid === puuid);
    if (!me) continue;
    if (me.win) { wins++; points += 17 + Math.floor(rand() * 8); } else { losses++; points = Math.max(0, points - (15 + Math.floor(rand() * 8))); }
    points = Math.min(points, TRAIL_TIERS.length * 400 - 1);
    const t = Math.floor(points / 400), d = Math.floor((points % 400) / 100);
    trail.push({
      at: new Date((g.match.info.gameEndTimestamp ?? g.match.info.gameCreation + g.match.info.gameDuration * 1000) + 60_000),
      queueType: "RANKED_SOLO_5x5", tier: TRAIL_TIERS[t]!, rank: TRAIL_DIVISIONS[d]!, lp: points % 100, wins, losses,
    });
  }
  return trail;
}

/** Where match data comes from: the Riot API or the synthetic environment. */
export interface MatchSource {
  readonly kind: DataSource;
  resolveAccount(platform: string, gameName: string, tagLine: string): Promise<ResolvedAccount | null>;
  /** Newest-first match ids, paged by `start`. `startTime` is epoch seconds. */
  matchIds(platform: string, puuid: string, count: number, start: number, startTime?: number): Promise<string[]>;
  match(platform: string, matchId: string): Promise<RawMatch | null>;
  timeline(platform: string, matchId: string): Promise<RawTimeline | null>;
  /** Top champions by mastery; absent in the synthetic environment (scouting falls back to recent games). */
  topMasteries?(platform: string, puuid: string, count: number): Promise<RiotMastery[]>;
  /** Ranked entries; absent in the synthetic environment. May fail: callers treat failure as unavailable. */
  leagueEntries?(platform: string, puuid: string): Promise<RiotLeagueEntry[]>;
  /**
   * Synthetic environment only: the rank after each of the fictional ranked games, so the
   * demo can show an LP line. Riot has no such history; real accounts build theirs one sync
   * at a time.
   */
  rankTrail?(platform: string, puuid: string): Promise<RankTrailPoint[]>;
  /** Only returns data once the game has started (spectator-v5), never during champion select. */
  activeGame(platform: string, puuid: string): Promise<ActiveGame | null>;
}

export function riotSource(client: RiotClient): MatchSource {
  return {
    kind: "riot",
    async resolveAccount(platform, gameName, tagLine) {
      const acc = await client.getAccountByRiotId(platform, gameName, tagLine);
      return acc ? { puuid: acc.puuid, gameName: acc.gameName ?? gameName, tagLine: acc.tagLine ?? tagLine } : null;
    },
    matchIds: (platform, puuid, count, start, startTime) => client.getMatchIds(platform, puuid, { count, start, startTime }),
    match: (platform, id) => client.getMatch(platform, id),
    timeline: (platform, id) => client.getTimeline(platform, id),
    topMasteries: (platform, puuid, count) => client.getTopMasteries(platform, puuid, count),
    leagueEntries: (platform, puuid) => client.getLeagueEntries(platform, puuid),
    async activeGame(platform, puuid) {
      const g = await client.getActiveGame(platform, puuid);
      if (!g) return null;
      return {
        gameMode: g.gameMode,
        mapId: g.mapId,
        queueId: g.gameQueueConfigId ?? null,
        simulated: false,
        participants: g.participants.map((p) => ({ puuid: p.puuid ?? null, teamId: p.teamId, championId: p.championId, riotId: p.riotId ?? null })),
      };
    },
  };
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Synthetic source: any Riot ID resolves to a deterministic fictional player
 * with a 60-game history. Clearly marked as synthetic everywhere it's shown.
 */
export function syntheticSource(now: () => number = Date.now): MatchSource {
  const histories = new Map<string, SyntheticGame[]>();
  const byMatch = new Map<string, SyntheticGame>();

  const history = (platform: string, puuid: string, gameName = "Player", tagLine = "SYN") => {
    const key = `${platform}:${puuid}`;
    let h = histories.get(key);
    if (!h) {
      const seed = hash(key);
      h = generateHistory({
        seed,
        puuid,
        gameName,
        tagLine,
        platform,
        count: 60,
        now: now(),
        traits: { earlyDeathRisk: (seed % 100) / 100, csPerMin: 5.5 + (seed % 25) / 10 },
      });
      histories.set(key, h);
      for (const g of h) byMatch.set(g.match.metadata.matchId, g);
    }
    return h;
  };

  return {
    kind: "synthetic",
    async resolveAccount(platform, gameName, tagLine) {
      const puuid = `synthetic-${hash(`${gameName.toLowerCase()}#${tagLine.toLowerCase()}`).toString(16)}`;
      history(platform, puuid, gameName, tagLine);
      return { puuid, gameName, tagLine };
    },
    async matchIds(platform, puuid, count, start, startTime) {
      return history(platform, puuid)
        .filter((g) => startTime === undefined || g.match.info.gameCreation >= startTime * 1000)
        .slice(start, start + count)
        .map((g) => g.match.metadata.matchId);
    },
    async match(_platform, id) {
      return byMatch.get(id)?.match ?? null;
    },
    async timeline(_platform, id) {
      return byMatch.get(id)?.timeline ?? null;
    },
    async rankTrail(platform, puuid) {
      return syntheticTrail(history(platform, puuid), puuid, hash(`${platform}:${puuid}`));
    },
    /** Simulated game in progress, stable for an hour, so scouting can be developed without Riot. */
    async activeGame(platform, puuid) {
      const rand = mulberry32(hash(`${puuid}:${Math.floor(now() / 3_600_000)}`));
      const pool = [...SYNTHETIC_CHAMPIONS];
      const pick = () => pool.splice(Math.floor(rand() * pool.length), 1)[0]!;
      const participants: ActiveGame["participants"] = [];
      for (let i = 0; i < 10; i++) {
        const teamId = i < 5 ? 100 : 200;
        const isMe = i === 0;
        const other = `synthetic-scout-${hash(`${puuid}:${i}`).toString(16)}`;
        const champ = pick();
        if (!isMe) history(platform, other, `Rival ${i}`, "SYN");
        participants.push({ puuid: isMe ? puuid : other, teamId, championId: champ.key, riotId: isMe ? null : `${teamId === 100 ? "Ally" : "Enemy"} ${i}#SYN` });
      }
      return { gameMode: "CLASSIC", mapId: 11, queueId: 420, simulated: true, participants };
    },
  };
}
