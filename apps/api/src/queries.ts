import { ANALYSIS_VERSION, type MatchAnalysis } from "@coach/analysis";
import { and, eq, inArray } from "drizzle-orm";
import { schema, type Db } from "./db/index.js";

export type Account = typeof schema.riotAccounts.$inferSelect;

export async function userAccounts(db: Db, userId: string): Promise<Account[]> {
  return db.select().from(schema.riotAccounts).where(eq(schema.riotAccounts.userId, userId));
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
