import { getPlatform, RawMatch, RawTimeline, type PlatformInfo } from "@coach/domain";
import { z } from "zod";
import { parseLimitHeader, RateLimiter } from "./rate-limiter.js";

export class RiotApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly kind: "auth" | "not_found" | "rate_limited" | "server" | "schema" | "bad_request",
  ) {
    super(message);
    this.name = "RiotApiError";
  }
}

export const RiotAccount = z.object({
  puuid: z.string(),
  gameName: z.string().optional(),
  tagLine: z.string().optional(),
});
export type RiotAccount = z.infer<typeof RiotAccount>;

/**
 * spectator-v5 CurrentGameInfo (subset). Only available once the game has
 * started (loading screen), so it never exposes champion-select data.
 * Fields vary (bots, privacy settings), so most are optional.
 */
export const RiotActiveGame = z.looseObject({
  gameId: z.number(),
  gameMode: z.string(),
  mapId: z.number(),
  gameQueueConfigId: z.number().optional(),
  gameStartTime: z.number().optional(),
  participants: z.array(
    z.looseObject({
      puuid: z.string().nullish(),
      teamId: z.number(),
      championId: z.number(),
      riotId: z.string().nullish(),
      bot: z.boolean().optional(),
    }),
  ),
});
export type RiotActiveGame = z.infer<typeof RiotActiveGame>;

export interface RiotClientOptions {
  apiKey: string;
  fetch?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  maxRetries?: number;
  limiter?: RateLimiter;
}

export interface MatchIdQuery {
  start?: number;
  count?: number;
  /** Epoch seconds. */
  startTime?: number;
}

/**
 * Minimal Riot API client. It only calls endpoints that are documented on the
 * Riot Developer Portal (see docs/01-investigacion.md), validates every
 * response with zod, and never returns unvalidated data.
 */
export class RiotClient {
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly limiter: RateLimiter;
  private readonly maxRetries: number;

  constructor(private readonly opts: RiotClientOptions) {
    if (!opts.apiKey) throw new Error("RiotClient requires an API key");
    this.fetchImpl = opts.fetch ?? fetch;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.limiter = opts.limiter ?? new RateLimiter(opts.now);
    this.maxRetries = opts.maxRetries ?? 3;
  }

  private platform(id: string): PlatformInfo {
    const p = getPlatform(id);
    if (!p || !p.enabled) throw new RiotApiError(`Unsupported platform: ${id}`, 400, "bad_request");
    return p;
  }

  async getAccountByRiotId(platform: string, gameName: string, tagLine: string): Promise<RiotAccount | null> {
    const route = this.platform(platform).accountRoute;
    const path = `/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
    return this.get(route, "account.by-riot-id", path, RiotAccount, { nullOn404: true });
  }

  async getAccountByPuuid(platform: string, puuid: string): Promise<RiotAccount | null> {
    const route = this.platform(platform).accountRoute;
    return this.get(route, "account.by-puuid", `/riot/account/v1/accounts/by-puuid/${encodeURIComponent(puuid)}`, RiotAccount, { nullOn404: true });
  }

  async getMatchIds(platform: string, puuid: string, q: MatchIdQuery = {}): Promise<string[]> {
    const route = this.platform(platform).matchRoute;
    const params = new URLSearchParams();
    params.set("start", String(q.start ?? 0));
    params.set("count", String(Math.min(100, q.count ?? 20)));
    if (q.startTime !== undefined) params.set("startTime", String(q.startTime));
    const path = `/lol/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids?${params}`;
    return (await this.get(route, "match.ids", path, z.array(z.string()))) ?? [];
  }

  async getMatch(platform: string, matchId: string): Promise<RawMatch | null> {
    const route = this.platform(platform).matchRoute;
    return this.get(route, "match.by-id", `/lol/match/v5/matches/${encodeURIComponent(matchId)}`, RawMatch, { nullOn404: true });
  }

  async getTimeline(platform: string, matchId: string): Promise<RawTimeline | null> {
    const route = this.platform(platform).matchRoute;
    return this.get(route, "match.timeline", `/lol/match/v5/matches/${encodeURIComponent(matchId)}/timeline`, RawTimeline, { nullOn404: true });
  }

  /** Current game for a player; null when they are not in a game. */
  async getActiveGame(platform: string, puuid: string): Promise<RiotActiveGame | null> {
    const route = this.platform(platform).id;
    return this.get(route, "spectator.active-game", `/lol/spectator/v5/active-games/by-summoner/${encodeURIComponent(puuid)}`, RiotActiveGame, { nullOn404: true });
  }

  private async get<T>(
    route: string,
    method: string,
    path: string,
    schema: z.ZodType<T>,
    { nullOn404 = false } = {},
  ): Promise<T | null> {
    const appKey = `app:${route}`;
    const methodKey = `method:${route}:${method}`;
    const url = `https://${route}.api.riotgames.com${path}`;

    for (let attempt = 0; ; attempt++) {
      let wait: number;
      while ((wait = this.limiter.delayFor([{ key: appKey }, { key: methodKey }])) > 0) {
        await this.sleep(wait);
      }
      this.limiter.record([appKey, methodKey]);

      let res: Response;
      try {
        res = await this.fetchImpl(url, { headers: { "X-Riot-Token": this.opts.apiKey } });
      } catch (err) {
        if (attempt >= this.maxRetries) throw new RiotApiError(`Network error: ${String(err)}`, 0, "server");
        await this.sleep(500 * 2 ** attempt);
        continue;
      }

      this.limiter.updateLimits(appKey, parseLimitHeader(res.headers.get("X-App-Rate-Limit")));
      this.limiter.updateLimits(methodKey, parseLimitHeader(res.headers.get("X-Method-Rate-Limit")));

      if (res.ok) {
        const parsed = schema.safeParse(await res.json());
        if (!parsed.success) throw new RiotApiError(`Unexpected response shape for ${method}`, res.status, "schema");
        return parsed.data;
      }
      if (res.status === 404 && nullOn404) return null;
      if (res.status === 401 || res.status === 403) {
        throw new RiotApiError("Riot API key rejected (missing, invalid or expired)", res.status, "auth");
      }
      if (res.status === 429) {
        const retryAfter = Number(res.headers.get("Retry-After") ?? "1");
        const ms = (Number.isFinite(retryAfter) ? retryAfter : 1) * 1000;
        const scope = res.headers.get("X-Rate-Limit-Type") === "method" ? methodKey : appKey;
        this.limiter.block(scope, ms);
        if (attempt >= this.maxRetries) throw new RiotApiError("Rate limited by Riot API", 429, "rate_limited");
        continue;
      }
      if (res.status >= 500 && attempt < this.maxRetries) {
        await this.sleep(500 * 2 ** attempt);
        continue;
      }
      throw new RiotApiError(`Riot API ${res.status} on ${method}`, res.status, res.status >= 500 ? "server" : "bad_request");
    }
  }
}
