import { analyzeMatch, ANALYSIS_VERSION } from "@coach/analysis";
import { normalizeMatch } from "@coach/domain";
import { and, eq, inArray } from "drizzle-orm";
import { schema, type Db } from "./db/index.js";
import type { MatchSource } from "./sources.js";

/** First sync pulls the last 50 games (brief §14); later syncs page back until they reach known games. */
export const INITIAL_SYNC_COUNT = 50;
export const PAGE_SIZE = 100;
/** Safety cap for one incremental sync; anything older is picked up by the next one. */
export const MAX_INCREMENTAL = 300;

export interface SyncProgress {
  done: number;
  total: number;
}

/**
 * In-process sync runner with one job per account at a time. The rate limiter
 * inside the Riot client paces requests. Matches are immutable, so anything
 * already stored is never fetched again (the DB acts as the cache).
 */
export class SyncService {
  private readonly running = new Map<string, Promise<void>>();
  private readonly progress = new Map<string, SyncProgress>();

  constructor(private readonly db: Db, private readonly source: MatchSource) {}

  status(accountId: string): SyncProgress | undefined {
    return this.progress.get(accountId);
  }

  isRunning(accountId: string): boolean {
    return this.running.has(accountId);
  }

  /**
   * Marks accounts as syncing before a request returns, so clients that read the
   * status right after the call see "syncing" and start polling.
   */
  async markSyncing(accountIds: string[]): Promise<void> {
    if (!accountIds.length) return;
    await this.db.update(schema.riotAccounts)
      .set({ syncStatus: "syncing", syncError: null })
      .where(inArray(schema.riotAccounts.id, accountIds));
  }

  /** Starts a sync unless one is already running. The returned promise never rejects. */
  start(accountId: string): Promise<void> {
    const existing = this.running.get(accountId);
    if (existing) return existing;
    const job = this.run(accountId)
      .catch((err) => console.error(`[sync] ${accountId} failed:`, err))
      .finally(() => {
        this.running.delete(accountId);
        this.progress.delete(accountId);
      });
    this.running.set(accountId, job);
    return job;
  }

  private async setError(accountId: string, err: unknown): Promise<void> {
    try {
      await this.db.update(schema.riotAccounts)
        .set({ syncStatus: "error", syncError: err instanceof Error ? err.message : String(err) })
        .where(eq(schema.riotAccounts.id, accountId));
    } catch (dbErr) {
      console.error(`[sync] could not record error for ${accountId}:`, dbErr);
    }
  }

  private async run(accountId: string): Promise<void> {
    try {
      const [account] = await this.db.select().from(schema.riotAccounts).where(eq(schema.riotAccounts.id, accountId));
      if (!account) return;
      await this.markSyncing([accountId]);

      const todo = account.lastSyncedAt === null
        ? await this.source.matchIds(account.platform, account.puuid, INITIAL_SYNC_COUNT, 0)
        : await this.newMatchIds(account);
      this.progress.set(accountId, { done: 0, total: todo.length });

      for (const matchId of todo) {
        await this.ingest(account, matchId);
        this.progress.get(accountId)!.done++;
      }

      await this.db.update(schema.riotAccounts)
        .set({ syncStatus: "ok", lastSyncedAt: new Date() })
        .where(eq(schema.riotAccounts.id, accountId));
    } catch (err) {
      await this.setError(accountId, err);
    }
  }

  /** Pages back from the newest game until it reaches games already linked (or the cap). */
  private async newMatchIds(account: typeof schema.riotAccounts.$inferSelect): Promise<string[]> {
    const startTime = Math.floor(account.lastSyncedAt!.getTime() / 1000) - 3600;
    const fresh: string[] = [];
    for (let start = 0; fresh.length < MAX_INCREMENTAL; start += PAGE_SIZE) {
      const page = await this.source.matchIds(account.platform, account.puuid, PAGE_SIZE, start, startTime);
      if (!page.length) break;
      const linked = new Set(
        (await this.db.select({ id: schema.accountMatches.matchId }).from(schema.accountMatches)
          .where(and(eq(schema.accountMatches.accountId, account.id), inArray(schema.accountMatches.matchId, page))))
          .map((r) => r.id),
      );
      fresh.push(...page.filter((id) => !linked.has(id)));
      if (linked.size > 0 || page.length < PAGE_SIZE) break;
    }
    return fresh.slice(0, MAX_INCREMENTAL);
  }

  private async ingest(account: typeof schema.riotAccounts.$inferSelect, matchId: string): Promise<void> {
    const [stored] = await this.db.select().from(schema.rawMatches).where(eq(schema.rawMatches.matchId, matchId));
    let raw = stored?.payload as Parameters<typeof normalizeMatch>[0] | undefined;
    if (!raw) {
      const fetched = await this.source.match(account.platform, matchId);
      if (!fetched) return; // match vanished upstream; nothing to store
      raw = fetched;
      await this.db.insert(schema.rawMatches)
        .values({ matchId, platform: account.platform, source: this.source.kind, payload: fetched })
        .onConflictDoNothing();
    }

    const [tlRow] = await this.db.select().from(schema.rawTimelines).where(eq(schema.rawTimelines.matchId, matchId));
    let timeline = (tlRow?.payload ?? null) as Parameters<typeof analyzeMatch>[1];
    if (!timeline) {
      timeline = await this.source.timeline(account.platform, matchId);
      if (timeline) await this.db.insert(schema.rawTimelines).values({ matchId, payload: timeline }).onConflictDoNothing();
    }

    const normalized = normalizeMatch(raw);
    await this.db.insert(schema.accountMatches)
      .values({ accountId: account.id, matchId, startedAt: new Date(normalized.startedAt) })
      .onConflictDoNothing();

    const analysis = analyzeMatch(normalized, timeline, account.puuid);
    if (analysis) {
      await this.db.insert(schema.matchAnalyses)
        .values({ matchId, puuid: account.puuid, analysisVersion: ANALYSIS_VERSION, data: analysis })
        .onConflictDoNothing();
    }
  }
}
