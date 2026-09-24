import type { RawMatch, RawTimeline } from "@coach/domain";
import { RiotClient } from "@coach/riot";
import { generateHistory, type SyntheticGame } from "@coach/synthetic";
import type { DataSource } from "./config.js";

export interface ResolvedAccount {
  puuid: string;
  gameName: string;
  tagLine: string;
}

/** Where match data comes from: the Riot API or the synthetic environment. */
export interface MatchSource {
  readonly kind: DataSource;
  resolveAccount(platform: string, gameName: string, tagLine: string): Promise<ResolvedAccount | null>;
  /** Newest-first match ids, paged by `start`. `startTime` is epoch seconds. */
  matchIds(platform: string, puuid: string, count: number, start: number, startTime?: number): Promise<string[]>;
  match(platform: string, matchId: string): Promise<RawMatch | null>;
  timeline(platform: string, matchId: string): Promise<RawTimeline | null>;
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
  };
}
