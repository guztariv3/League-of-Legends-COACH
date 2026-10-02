import { ANALYSIS_VERSION, type MatchAnalysis } from "@coach/analysis";
import { and, eq, inArray, notExists } from "drizzle-orm";
import { schema, type Db } from "./db/index.js";

export type Account = typeof schema.riotAccounts.$inferSelect;

export async function userAccounts(db: Db, userId: string): Promise<Account[]> {
  return db.select().from(schema.riotAccounts).where(eq(schema.riotAccounts.userId, userId));
}

/**
 * Garbage-collects derived/raw match data left behind by deleting an account or user.
 * `matchAnalyses`, `rawMatches` and `rawTimelines` aren't owned by one account — a raw match
 * can be shared by several linked accounts, and `matchAnalyses` only keys off `puuid` — so they
 * don't cascade from `riotAccounts`. Call this with the puuids/matchIds that were about to lose
 * their last reference, captured *before* the account/user delete removes that reference.
 */
export async function purgeOrphanedMatchData(db: Db, puuids: string[], matchIds: string[]): Promise<void> {
  const uniquePuuids = [...new Set(puuids)];
  const uniqueMatchIds = [...new Set(matchIds)];
  if (uniquePuuids.length) {
    await db.delete(schema.matchAnalyses).where(
      and(
        inArray(schema.matchAnalyses.puuid, uniquePuuids),
        notExists(db.select().from(schema.riotAccounts).where(eq(schema.riotAccounts.puuid, schema.matchAnalyses.puuid))),
      ),
    );
  }
  if (uniqueMatchIds.length) {
    await db.delete(schema.rawTimelines).where(
      and(
        inArray(schema.rawTimelines.matchId, uniqueMatchIds),
        notExists(db.select().from(schema.accountMatches).where(eq(schema.accountMatches.matchId, schema.rawTimelines.matchId))),
      ),
    );
    await db.delete(schema.rawMatches).where(
      and(
        inArray(schema.rawMatches.matchId, uniqueMatchIds),
        notExists(db.select().from(schema.accountMatches).where(eq(schema.accountMatches.matchId, schema.rawMatches.matchId))),
      ),
    );
  }
}

export interface AccountAnalysis extends MatchAnalysis {
  accountId: string;
}

/** Current-version analyses for the given accounts, newest first. */
export async function analysesFor(db: Db, accounts: Account[]): Promise<AccountAnalysis[]> {
  if (!accounts.length) return [];
  const rows = await db
    .select({ accountId: schema.accountMatches.accountId, puuid: schema.riotAccounts.puuid, data: schema.matchAnalyses.data })
    .from(schema.accountMatches)
    .innerJoin(schema.riotAccounts, eq(schema.riotAccounts.id, schema.accountMatches.accountId))
    .innerJoin(
      schema.matchAnalyses,
      and(
        eq(schema.matchAnalyses.matchId, schema.accountMatches.matchId),
        eq(schema.matchAnalyses.puuid, schema.riotAccounts.puuid),
        eq(schema.matchAnalyses.analysisVersion, ANALYSIS_VERSION),
      ),
    )
    .where(inArray(schema.accountMatches.accountId, accounts.map((a) => a.id)));
  return rows
    .map((r) => ({ ...(r.data as MatchAnalysis), accountId: r.accountId }))
    .sort((a, b) => b.startedAt - a.startedAt);
}

export interface MatchFilters {
  accountId?: string;
  champion?: string;
  /** Lane opponent champion (Summoner's Rift). */
  opponent?: string;
  role?: string;
  result?: "win" | "loss";
  patch?: string;
  mode?: string;
  from?: number;
  to?: number;
  minDurationMin?: number;
  maxDurationMin?: number;
}

export function applyFilters(list: AccountAnalysis[], f: MatchFilters): AccountAnalysis[] {
  return list.filter(
    (a) =>
      (!f.accountId || a.accountId === f.accountId) &&
      (!f.champion || a.championName.toLowerCase() === f.champion.toLowerCase()) &&
      (!f.opponent || (a.laneOpponentChampion ?? "").toLowerCase() === f.opponent.toLowerCase()) &&
      (!f.role || a.role === f.role) &&
      (!f.result || (f.result === "win") === a.win) &&
      (!f.patch || a.patch === f.patch) &&
      (!f.mode || a.mode === f.mode) &&
      (f.from === undefined || a.startedAt >= f.from) &&
      (f.to === undefined || a.startedAt <= f.to) &&
      (f.minDurationMin === undefined || a.durationSec >= f.minDurationMin * 60) &&
      (f.maxDurationMin === undefined || a.durationSec <= f.maxDurationMin * 60),
  );
}
