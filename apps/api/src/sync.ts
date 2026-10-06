import { analyzeMatch, ANALYSIS_VERSION } from "@coach/analysis";
import { normalizeMatch } from "@coach/domain";
import { RiotApiError } from "@coach/riot";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { schema, type Db } from "./db/index.js";
import { riotFailure } from "./errors.js";
import { recordRank } from "./rank.js";
import { forgetPlayers } from "./retention.js";
import type { MatchSource } from "./sources.js";

/** First sync pulls the last 50 games (brief §14); later syncs drain bounded time windows. */
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
  private readonly deleting = new Map<string,number>();
  /** Background re-analysis (startup) writes analyses too, so deletion waits for it as well. */
  private readonly reanalyzing = new Map<string, Promise<void>>();

  /** Let in-flight writes finish before deletion, and block new local jobs until
   * the deletion transaction commits. A process restart has no jobs to await. */
  async withDeletion<T>(accountIds:string[],operation:()=>Promise<T>):Promise<T>{
    const ids=[...new Set(accountIds)];
    for(const id of ids)this.deleting.set(id,(this.deleting.get(id)??0)+1);
    try {
      await Promise.all(ids.flatMap(id=>[this.running.get(id),this.reanalyzing.get(id)]));
      return await operation();
    } finally {
      for(const id of ids){const n=this.deleting.get(id)!-1;if(n)this.deleting.set(id,n);else this.deleting.delete(id);}
    }
  }

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
    if(this.deleting.has(accountId))return Promise.resolve();
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
        .set({ syncStatus: "error", syncError: riotFailure(err)?.message ?? (err instanceof Error ? err.message : String(err)) })
        .where(eq(schema.riotAccounts.id, accountId));
    } catch (dbErr) {
      console.error(`[sync] could not record error for ${accountId}:`, dbErr);
    }
  }

  private async run(accountId: string): Promise<void> {
    try {
      let [account] = await this.db.select().from(schema.riotAccounts).where(eq(schema.riotAccounts.id, accountId));
      if (!account) return;
      await this.markSyncing([accountId]);

      let windowEnd=account.syncWindowEnd ?? new Date(Math.floor(Date.now()/1000)*1000);
      await this.db.update(schema.riotAccounts).set({syncWindowEnd:windowEnd}).where(eq(schema.riotAccounts.id,accountId));
      let batch:{ids:string[];complete:boolean;nextOffset:number};
      try {
        batch = account.lastSyncedAt === null
          ? {ids:await this.source.matchIds(account.platform,account.puuid,INITIAL_SYNC_COUNT,0,undefined,windowEnd.getTime()/1000),complete:true,nextOffset:0}
          : await this.newMatchIds(account,windowEnd);
      } catch (err) {
        // Riot encrypts PUUIDs per API key: after the server's key changes, the stored one is
        // rejected with a 400. Look the Riot ID up again and start this account's history over.
        if (!(err instanceof RiotApiError && err.status === 400)) throw err;
        const renewed = await this.renewPuuid(account);
        if (!renewed) throw err;
        account = renewed;
        windowEnd=new Date(Math.floor(Date.now()/1000)*1000);
        await this.db.update(schema.riotAccounts).set({syncWindowEnd:windowEnd}).where(eq(schema.riotAccounts.id,accountId));
        batch={ids:await this.source.matchIds(account.platform,account.puuid,INITIAL_SYNC_COUNT,0,undefined,windowEnd.getTime()/1000),complete:true,nextOffset:0};
      }
      const todo=batch.ids;
      this.progress.set(accountId, { done: 0, total: todo.length });

      for (const matchId of todo) {
        await this.ingest(account, matchId);
        this.progress.get(accountId)!.done++;
      }
      await this.reanalyze(account);
      await recordRank(this.db, this.source, account);

      await this.db.update(schema.riotAccounts)
        .set(batch.complete
          ? {syncStatus:"ok",lastSyncedAt:windowEnd,syncOffset:0,syncWindowEnd:null}
          : {syncStatus:"ok",syncOffset:batch.nextOffset,syncWindowEnd:windowEnd})
        .where(eq(schema.riotAccounts.id, accountId));
    } catch (err) {
      await this.setError(accountId, err);
    }
  }

  /** New PUUID for the same Riot ID under the current API key, or null if it is the same (or gone). */
  private async renewPuuid(account: typeof schema.riotAccounts.$inferSelect) {
    const found = await this.source.resolveAccount(account.platform, account.gameName, account.tagLine);
    if (!found || found.puuid === account.puuid) return null;
    console.warn(`[sync] account ${account.id}: PUUID changed with the API key; re-syncing its history`);
    await this.db.delete(schema.accountMatches).where(eq(schema.accountMatches.accountId, account.id));
    const [renewed] = await this.db.update(schema.riotAccounts)
      .set({ puuid: found.puuid, lastSyncedAt: null, syncOffset:0, syncWindowEnd:null })
      .where(eq(schema.riotAccounts.id, account.id))
      .returning();
    await forgetPlayers(this.db, [account.puuid]);
    return renewed ?? null;
  }

  /** Resume a bounded time window. Linked pages do not prove that older pages
   * are complete. Cursor and watermark advance only after all ingests succeed. */
  private async newMatchIds(account:typeof schema.riotAccounts.$inferSelect,windowEnd:Date):Promise<{ids:string[];complete:boolean;nextOffset:number}>{
    const startTime=Math.floor(account.lastSyncedAt!.getTime()/1000)-3600;
    const ids:string[]=[];
    let start=account.syncOffset;
    while(ids.length<MAX_INCREMENTAL){
      const count=Math.min(PAGE_SIZE,MAX_INCREMENTAL-ids.length);
      const page=await this.source.matchIds(account.platform,account.puuid,count,start,startTime,windowEnd.getTime()/1000);
      ids.push(...page);start+=page.length;
      if(page.length<count)return {ids:[...new Set(ids)],complete:true,nextOffset:0};
    }
    return {ids:[...new Set(ids)],complete:false,nextOffset:start};
  }

  /**
   * Brings every linked account up to the current ANALYSIS_VERSION from stored raw
   * games (no Riot calls). Run at startup so a version bump never shows an empty
   * history until the next sync. Never throws.
   */
  async reanalyzeAll(): Promise<number> {
    let done = 0;
    for (const { id } of await this.db.select({ id: schema.riotAccounts.id }).from(schema.riotAccounts)) {
      // Registered before the first await, so a deletion either sees it or blocks it.
      if (this.deleting.has(id)) continue;
      const job = (async () => {
        // The list may be stale: an account deleted since then must not be re-analysed.
        const [account] = await this.db.select().from(schema.riotAccounts).where(eq(schema.riotAccounts.id, id));
        if (account) await this.reanalyze(account);
        return Boolean(account);
      })();
      this.reanalyzing.set(id, job.then(() => {}, () => {}));
      try {
        if (await job) done++;
      } catch (err) {
        console.error(`[sync] re-analysis failed for ${id}:`, err);
      } finally {
        this.reanalyzing.delete(id);
      }
    }
    return done;
  }

  /**
   * Adds current-version analyses for stored games analysed under an older
   * ANALYSIS_VERSION. Older rows are kept untouched (historical truth is
   * immutable); queries read the current version.
   */
  private async reanalyze(account: typeof schema.riotAccounts.$inferSelect): Promise<void> {
    const missing = await this.db
      .select({ matchId: schema.accountMatches.matchId })
      .from(schema.accountMatches)
      .leftJoin(
        schema.matchAnalyses,
        and(
          eq(schema.matchAnalyses.matchId, schema.accountMatches.matchId),
          eq(schema.matchAnalyses.puuid, account.puuid),
          eq(schema.matchAnalyses.analysisVersion, ANALYSIS_VERSION),
        ),
      )
      .where(and(eq(schema.accountMatches.accountId, account.id), isNull(schema.matchAnalyses.matchId)));
    for (const { matchId } of missing) {
      const [raw] = await this.db.select().from(schema.rawMatches).where(eq(schema.rawMatches.matchId, matchId));
      if (!raw) continue;
      const [tl] = await this.db.select().from(schema.rawTimelines).where(eq(schema.rawTimelines.matchId, matchId));
      const analysis = analyzeMatch(normalizeMatch(raw.payload as Parameters<typeof normalizeMatch>[0]), (tl?.payload ?? null) as Parameters<typeof analyzeMatch>[1], account.puuid);
      if (analysis) {
        await this.db.insert(schema.matchAnalyses)
          .values({ matchId, puuid: account.puuid, analysisVersion: ANALYSIS_VERSION, data: analysis })
          .onConflictDoNothing();
      }
    }
  }

  private async ingest(account: typeof schema.riotAccounts.$inferSelect, matchId: string): Promise<void> {
    const [stored] = await this.db.select().from(schema.rawMatches).where(eq(schema.rawMatches.matchId, matchId));
    let raw = stored?.payload as Parameters<typeof normalizeMatch>[0] | undefined;
    // A copy stored under an older API key carries PUUIDs this key no longer uses: fetch it again.
    const stale = raw !== undefined && !raw.metadata.participants.includes(account.puuid);
    if (!raw || stale) {
      const fetched = await this.source.match(account.platform, matchId);
      if (!fetched) return; // match vanished upstream; nothing to store
      raw = fetched;
      await this.db.insert(schema.rawMatches)
        .values({ matchId, platform: account.platform, source: this.source.kind, payload: fetched })
        .onConflictDoUpdate({ target: schema.rawMatches.matchId, set: { payload: fetched, fetchedAt: new Date() } });
    }

    const [tlRow] = await this.db.select().from(schema.rawTimelines).where(eq(schema.rawTimelines.matchId, matchId));
    let timeline = (stale ? null : tlRow?.payload ?? null) as Parameters<typeof analyzeMatch>[1];
    if (!timeline) {
      timeline = await this.source.timeline(account.platform, matchId);
      if (timeline) {
        await this.db.insert(schema.rawTimelines).values({ matchId, payload: timeline })
          .onConflictDoUpdate({ target: schema.rawTimelines.matchId, set: { payload: timeline, fetchedAt: new Date() } });
      }
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
