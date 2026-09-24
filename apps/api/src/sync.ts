import { analyzeMatch, ANALYSIS_VERSION } from "@coach/analysis";
import { normalizeMatch } from "@coach/domain";
import { and, eq, inArray } from "drizzle-orm";
import { schema, type Db } from "./db/index.js";
import type { MatchSource } from "./sources.js";

/** First sync pulls the last 50 games (brief §14); later syncs are incremental. */
export const INITIAL_SYNC_COUNT = 50;
export const INCREMENTAL_SYNC_COUNT = 20;

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

  /** Starts a sync unless one is already running; resolves when it finishes. */
  start(accountId: string): Promise<void> {
    const existing = this.running.get(accountId);
    if (existing) return existing;
    const job = this.run(accountId).finally(() => {
      this.running.delete(accountId);
      this.progress.delete(accountId);
    });
    this.running.set(accountId, job);
    return job;
  }

  private async run(accountId: string): Promise<void> {
    const [account] = await this.db.select().from(schema.riotAccounts).where(eq(schema.riotAccounts.id, accountId));
    if (!account) return;
    await this.db.update(schema.riotAccounts).set({ syncStatus: "syncing", syncError: null }).where(eq(schema.riotAccounts.id, accountId));

    try {
      const first = account.lastSyncedAt === null;
      const startTime = first ? undefined : Math.floor(account.lastSyncedAt!.getTime() / 1000) - 3600;
      const ids = await this.source.matchIds(account.platform, account.puuid, first ? INITIAL_SYNC_COUNT : INCREMENTAL_SYNC_COUNT, startTime);

      const linked = ids.length
        ? new Set(
            (await this.db.select({ id: schema.accountMatches.matchId }).from(schema.accountMatches)
              .where(and(eq(schema.accountMatches.accountId, accountId), inArray(schema.accountMatches.matchId, ids))))
              .map((r) => r.id),
          )
        : new Set<string>();
      const todo = ids.filter((id) => !linked.has(id));
      this.progress.set(accountId, { done: 0, total: todo.length });

      for (const matchId of todo) {
        await this.ingest(account, matchId);
        const p = this.progress.get(accountId)!;
        p.done++;
      }

      await this.db.update(schema.riotAccounts)
        .set({ syncStatus: "ok", lastSyncedAt: new Date() })
        .where(eq(schema.riotAccounts.id, accountId));
    } catch (err) {
      await this.db.update(schema.riotAccounts)
        .set({ syncStatus: "error", syncError: err instanceof Error ? err.message : String(err) })
        .where(eq(schema.riotAccounts.id, accountId));
    }
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
