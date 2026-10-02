import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateHistory, type SyntheticGame } from "@coach/synthetic";
import { and, eq } from "drizzle-orm";
import { openDatabase, schema, type Database } from "./db/index.js";
import { MAX_INCREMENTAL, PAGE_SIZE, SyncService } from "./sync.js";
import type { MatchSource } from "./sources.js";

let database: Database;

beforeAll(async () => {
  database = await openDatabase(undefined, undefined);
}, 30_000);
afterAll(() => database.close());

/** A MatchSource backed by a fixed, newest-first history larger than MAX_INCREMENTAL. */
function bigHistorySource(
  count: number,
  seed = 1,
  failOnce?: { matchId: string; thrown: boolean },
): MatchSource & { games: SyntheticGame[] } {
  const games = generateHistory({ seed, puuid: "p1", gameName: "Big", tagLine: "EUW", platform: "euw1", count, now: Date.UTC(2026, 5, 1) });
  const byMatch = new Map(games.map((g) => [g.match.metadata.matchId, g]));
  return {
    kind: "synthetic",
    games,
    async resolveAccount() { return null; },
    async matchIds(_platform, _puuid, pageCount, start, startTime) {
      return games
        .filter((g) => startTime === undefined || g.match.info.gameCreation >= startTime * 1000)
        .slice(start, start + pageCount)
        .map((g) => g.match.metadata.matchId);
    },
    async match(_platform, id) {
      if (failOnce && !failOnce.thrown && id === failOnce.matchId) {
        failOnce.thrown = true;
        throw new Error("transient upstream failure");
      }
      return byMatch.get(id)?.match ?? null;
    },
    async timeline(_platform, id) {
      return byMatch.get(id)?.timeline ?? null;
    },
    async activeGame() { return null; },
  };
}

async function makeAccount(puuid: string, lastSyncedAt: Date | null) {
  const [user] = await database.db.insert(schema.users).values({ displayName: `user-${puuid}` }).returning();
  const [account] = await database.db.insert(schema.riotAccounts).values({
    userId: user!.id,
    puuid,
    gameName: "Big",
    tagLine: "EUW",
    platform: "euw1",
    source: "synthetic",
    lastSyncedAt,
  }).returning();
  return account!;
}

async function linkedMatchIds(accountId: string): Promise<string[]> {
  const rows = await database.db.select({ matchId: schema.accountMatches.matchId }).from(schema.accountMatches)
    .where(eq(schema.accountMatches.accountId, accountId));
  return rows.map((r) => r.matchId);
}

describe("SyncService incremental backlog", () => {
  it("keeps draining a backlog larger than MAX_INCREMENTAL instead of losing it", async () => {
    const total = MAX_INCREMENTAL + PAGE_SIZE + 10; // comfortably more than one capped pass
    const source = bigHistorySource(total);
    const account = await makeAccount("p1", new Date(Date.UTC(2020, 0, 1))); // old enough that everything looks "new"
    const sync = new SyncService(database.db, source);

    await sync.start(account.id);
    let linked = await linkedMatchIds(account.id);
    expect(linked.length).toBe(MAX_INCREMENTAL);
    let [row] = await database.db.select().from(schema.riotAccounts).where(eq(schema.riotAccounts.id, account.id));
    expect(row!.lastSyncedAt).toEqual(account.lastSyncedAt); // not advanced: backlog still pending
    expect(row!.syncOffset).toBeGreaterThan(0);

    await sync.start(account.id);
    linked = await linkedMatchIds(account.id);
    expect(linked.length).toBe(total); // the remaining backlog was picked up, nothing lost
    [row] = await database.db.select().from(schema.riotAccounts).where(eq(schema.riotAccounts.id, account.id));
    expect(row!.syncStatus).toBe("ok");
    expect(row!.syncOffset).toBe(0);
    expect(row!.lastSyncedAt!.getTime()).toBeGreaterThan(account.lastSyncedAt!.getTime());
  });

  it("recovers every match after a partial failure instead of skipping past the gap", async () => {
    const total = PAGE_SIZE + 20;
    const seed = 2;
    // Fail on a match roughly in the middle of the page so some ingests before it succeed first.
    const probe = generateHistory({ seed, puuid: "p1", gameName: "Big", tagLine: "EUW", platform: "euw1", count: total, now: Date.UTC(2026, 5, 1) });
    const failId = probe[60]!.match.metadata.matchId;
    const source = bigHistorySource(total, seed, { matchId: failId, thrown: false });
    const account = await makeAccount("p2", new Date(Date.UTC(2020, 0, 1)));
    const sync = new SyncService(database.db, source);

    await sync.start(account.id); // fails partway through
    let [row] = await database.db.select().from(schema.riotAccounts).where(eq(schema.riotAccounts.id, account.id));
    expect(row!.syncStatus).toBe("error");
    const afterFailure = await linkedMatchIds(account.id);
    expect(afterFailure.length).toBeGreaterThan(0);
    expect(afterFailure).not.toContain(failId);

    await sync.start(account.id); // retry: the matchIds lookup no longer throws
    const afterRetry = await linkedMatchIds(account.id);
    expect(afterRetry.length).toBe(total);
    expect(afterRetry).toContain(failId);
    [row] = await database.db.select().from(schema.riotAccounts).where(eq(schema.riotAccounts.id, account.id));
    expect(row!.syncStatus).toBe("ok");
  });
});
