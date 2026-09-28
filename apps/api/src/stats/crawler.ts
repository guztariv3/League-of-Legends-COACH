import type { RawMatch, RawTimeline } from "@coach/domain";
import { patchFromVersion } from "@coach/domain";
import type { GameFacts } from "@coach/knowledge";
import { RiotApiError, type RiotApexLeague } from "@coach/riot";
import type { Db } from "../db/index.js";
import { SOLO_QUEUE, statRows } from "./aggregate.js";
import { previousPatch, recordGame, seen } from "./store.js";

/** What the crawler needs from the Riot API (the RiotClient, or a fake in tests). */
export interface StatsRiot {
  getApexLeague(platform: string, tier: "challenger" | "grandmaster" | "master"): Promise<RiotApexLeague | null>;
  getMatchIds(platform: string, puuid: string, q: { count?: number; startTime?: number; queue?: number }): Promise<string[]>;
  getMatch(platform: string, matchId: string): Promise<RawMatch | null>;
  getTimeline(platform: string, matchId: string): Promise<RawTimeline | null>;
}

/** The patch the game data is on ("16.19") and its finished items, from the daily game facts. */
export type PatchInfo = { patch: string; completed: Set<number> };

/** The patch of the game data ("16.19.1" → "16.19") and its finished items (Legendary, on the Rift, sold, not built further). */
export function patchInfoOf(facts: GameFacts): PatchInfo {
  const completed = new Set(facts.items
    .filter((i) => i.purchasable && i.rank.includes("LEGENDARY") && i.into.length === 0 && (!i.maps.length || i.maps.includes(11)))
    .map((i) => i.id));
  return { patch: patchFromVersion(facts.version), completed };
}

const TIERS = ["challenger", "grandmaster", "master"] as const;
/** How far back to look for a player's games. */
const LOOKBACK_DAYS = 14;
/** Refresh the list of Master+ players this often. */
const PLAYERS_TTL_MS = 6 * 3_600_000;

/**
 * Walks recent ranked solo games of Master+ players, one game per step, and adds each game of the
 * current or previous patch to the counters. It is slow on purpose (one step every few seconds)
 * so the Riot API budget stays available for the players' own syncs. Only counters are stored.
 */
export class StatsCrawler {
  private players: { platform: string; puuid: string }[] = [];
  private playersAt: number | null = null;
  private progress: Record<string, number> = {};
  private lastReportAt: number | null = null;
  private cursor = 0;
  private queue: { platform: string; matchId: string }[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private busy = false;

  constructor(private readonly deps: {
    db: Db;
    riot: StatsRiot;
    platforms: string[];
    patch: () => Promise<PatchInfo | null>;
    now?: () => number;
    /** Players looked at per league (the top of each league first). */
    perLeague?: number;
  }) {}

  start(intervalMs: number): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.step().then(result => this.report(result)).catch(err => this.report(err instanceof RiotApiError ? `failed-${err.kind}` : "failed"));
    }, intervalMs);
    this.timer.unref?.();
  }

  /** Aggregate process-local progress only; no keys, URLs, match ids or player identities. */
  private report(result: string): void {
    this.progress[result] = (this.progress[result] ?? 0) + 1;
    const now = (this.deps.now ?? Date.now)();
    if (this.lastReportAt === null || now - this.lastReportAt >= 60_000) {
      console.info("[stats] progress", JSON.stringify({ steps: this.progress, players: this.players.length, queued: this.queue.length }));
      this.lastReportAt = now;
    }
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Does one unit of work: refresh players, list a player's games, or count one game. */
  async step(): Promise<"busy" | "no-patch" | "players" | "listed" | "counted" | "skipped" | "idle" | "unavailable"> {
    if (this.busy) return "busy";
    this.busy = true;
    try {
      const info = await this.deps.patch();
      if (!info) return "no-patch";
      const now = (this.deps.now ?? Date.now)();

      if (this.playersAt === null || now - this.playersAt >= (this.players.length ? PLAYERS_TTL_MS : 60_000)) {
        const found: { platform: string; puuid: string }[] = [];
        for (const platform of this.deps.platforms) {
          for (const tier of TIERS) {
            const league = await this.deps.riot.getApexLeague(platform, tier);
            const entries = (league?.entries ?? []).filter((e) => e.puuid)
              .sort((a, b) => (b.leaguePoints ?? 0) - (a.leaguePoints ?? 0))
              .slice(0, this.deps.perLeague ?? 200);
            for (const e of entries) found.push({ platform, puuid: e.puuid! });
          }
        }
        this.players = found;
        this.playersAt = now;
        // Keep walking through the ladder across refreshes instead of restarting at its top.
        this.cursor = found.length ? this.cursor % found.length : 0;
        return "players";
      }

      const next = this.queue.shift();
      if (!next) {
        if (!this.players.length) return "idle";
        const p = this.players[this.cursor % this.players.length]!;
        this.cursor++;
        const ids = await this.deps.riot.getMatchIds(p.platform, p.puuid, { count: 20, queue: SOLO_QUEUE, startTime: Math.floor(now / 1000) - LOOKBACK_DAYS * 86_400 });
        const known = await seen(this.deps.db, ids);
        for (const id of ids) if (!known.has(id) && !this.queue.some((q) => q.matchId === id)) this.queue.push({ platform: p.platform, matchId: id });
        return "listed";
      }

      if ((await seen(this.deps.db, [next.matchId])).size) return "skipped";
      const match = await this.deps.riot.getMatch(next.platform, next.matchId);
      // Missing responses are not immutable evidence: a later listing may retry this match.
      if (!match) return "unavailable";
      const patchOf = statRows(match, null, new Set()).patch;
      const wanted = patchOf === info.patch || patchOf === previousPatch(info.patch);
      if (!wanted) { await recordGame(this.deps.db, { matchId: next.matchId, platform: next.platform, patch: patchOf, rows: [], counted: false }); return "skipped"; }
      const timeline = await this.deps.riot.getTimeline(next.platform, next.matchId);
      // Do not permanently claim a game without the timeline needed for purchase evidence.
      if (!timeline) return "unavailable";
      const { rows } = statRows(match, timeline, info.completed);
      await recordGame(this.deps.db, { matchId: next.matchId, platform: next.platform, patch: patchOf, rows, counted: rows.length > 0 });
      return rows.length ? "counted" : "skipped";
    } finally {
      this.busy = false;
    }
  }
}
