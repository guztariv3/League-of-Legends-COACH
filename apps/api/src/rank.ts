import type { RiotLeagueEntry } from "@coach/riot";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import type { AuthVars } from "./auth.js";
import { schema, type Db } from "./db/index.js";
import { userAccounts } from "./queries.js";
import type { MatchSource } from "./sources.js";

/** Queues whose rank we track. */
export const RANKED_QUEUES = ["RANKED_SOLO_5x5", "RANKED_FLEX_SR"] as const;

const TIERS = ["IRON", "BRONZE", "SILVER", "GOLD", "PLATINUM", "EMERALD", "DIAMOND", "MASTER", "GRANDMASTER", "CHALLENGER"];
const DIVISIONS = ["IV", "III", "II", "I"];

/**
 * Position on one continuous ladder (100 per division), so LP changes can be
 * measured across promotions. Master and above have no divisions and share one
 * base. Null for tiers we don't know.
 */
export function ladderPoints(tier: string, rank: string, lp: number): number | null {
  const t = TIERS.indexOf(tier);
  if (t < 0) return null;
  if (t >= TIERS.indexOf("MASTER")) return TIERS.indexOf("MASTER") * 400 + lp;
  const d = DIVISIONS.indexOf(rank);
  return d < 0 ? null : t * 400 + d * 100 + lp;
}

type Snapshot = typeof schema.rankSnapshots.$inferSelect;

/**
 * Records the account's current ranked entries, one row per queue, only when
 * something changed since the last row. Failures are swallowed: rank is a
 * nice-to-have and must never break a sync.
 */
export async function recordRank(db: Db, source: MatchSource, account: { id: string; platform: string; puuid: string }): Promise<number> {
  if (!source.leagueEntries) return 0;
  try {
    const entries: RiotLeagueEntry[] = await source.leagueEntries(account.platform, account.puuid);
    let added = 0;
    for (const e of entries) {
      if (!(RANKED_QUEUES as readonly string[]).includes(e.queueType) || !e.tier || e.leaguePoints === undefined) continue;
      const [last] = await db.select().from(schema.rankSnapshots)
        .where(and(eq(schema.rankSnapshots.accountId, account.id), eq(schema.rankSnapshots.queueType, e.queueType)))
        .orderBy(desc(schema.rankSnapshots.takenAt)).limit(1);
      const rank = e.rank ?? "";
      if (last && last.tier === e.tier && last.rank === rank && last.lp === e.leaguePoints && last.wins === e.wins && last.losses === e.losses) continue;
      await db.insert(schema.rankSnapshots).values({
        accountId: account.id, queueType: e.queueType, tier: e.tier, rank, lp: e.leaguePoints, wins: e.wins, losses: e.losses,
      });
      added++;
    }
    return added;
  } catch (err) {
    console.warn(`[rank] could not record rank for ${account.id}:`, err instanceof Error ? err.message : err);
    return 0;
  }
}

export interface RankPoint {
  at: string;
  tier: string;
  rank: string;
  lp: number;
  wins: number;
  losses: number;
  /** LP won or lost since the previous point; only when exactly one game was played in between. */
  lpChange: number | null;
}

/** Oldest-first history for one queue, with the LP change of single-game steps. */
export function rankHistory(rows: Snapshot[]): RankPoint[] {
  const sorted = [...rows].sort((a, b) => a.takenAt.getTime() - b.takenAt.getTime());
  return sorted.map((r, i) => {
    const prev = sorted[i - 1];
    let lpChange: number | null = null;
    if (prev && r.wins + r.losses - (prev.wins + prev.losses) === 1) {
      const a = ladderPoints(prev.tier, prev.rank, prev.lp);
      const b = ladderPoints(r.tier, r.rank, r.lp);
      if (a !== null && b !== null) lpChange = b - a;
    }
    return { at: r.takenAt.toISOString(), tier: r.tier, rank: r.rank, lp: r.lp, wins: r.wins, losses: r.losses, lpChange };
  });
}

export function rankRoutes(deps: { db: Db }) {
  const r = new Hono<AuthVars>();
  /** Current rank and recorded history per ranked queue, for each account in the profile. */
  r.get("/rank", async (c) => {
    const accounts = (await userAccounts(deps.db, c.get("userId"))).filter((a) => a.includeInProfile);
    if (!accounts.length) return c.json({ accounts: [] });
    const rows = await deps.db.select().from(schema.rankSnapshots)
      .where(inArray(schema.rankSnapshots.accountId, accounts.map((a) => a.id)))
      .orderBy(asc(schema.rankSnapshots.takenAt));
    return c.json({
      accounts: accounts.map((a) => ({
        accountId: a.id,
        riotId: `${a.gameName}#${a.tagLine}`,
        queues: RANKED_QUEUES.flatMap((q) => {
          const history = rankHistory(rows.filter((s) => s.accountId === a.id && s.queueType === q));
          const current = history.at(-1);
          return current ? [{ queueType: q, current, history }] : [];
        }),
      })),
    });
  });
  return r;
}
