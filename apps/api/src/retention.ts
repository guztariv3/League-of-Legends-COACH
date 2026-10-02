import { sql } from "drizzle-orm";
import type { Db } from "./db/index.js";

/**
 * Data retention (privacy page): match data that no linked account uses any more — rivals'
 * games fetched for scouting, or games left behind by an unlinked or deleted account — is
 * deleted once it is older than this. Games in a linked account's history are kept.
 */
export const UNLINKED_MATCH_TTL_DAYS = 30;

export async function purgeUnlinkedMatches(db: Db, now = new Date()): Promise<void> {
  const cutoff = new Date(now.getTime() - UNLINKED_MATCH_TTL_DAYS * 86_400_000).toISOString();
  await db.execute(sql`
    DELETE FROM match_analyses ma
    WHERE ma.created_at < ${cutoff}
      AND NOT EXISTS (
        SELECT 1 FROM account_matches am JOIN riot_accounts ra ON ra.id = am.account_id
        WHERE am.match_id = ma.match_id AND ra.puuid = ma.puuid)`);
  await db.execute(sql`
    DELETE FROM raw_timelines rt
    WHERE rt.fetched_at < ${cutoff}
      AND NOT EXISTS (SELECT 1 FROM account_matches am WHERE am.match_id = rt.match_id)`);
  await db.execute(sql`
    DELETE FROM raw_matches rm
    WHERE rm.fetched_at < ${cutoff}
      AND NOT EXISTS (SELECT 1 FROM account_matches am WHERE am.match_id = rm.match_id)
      AND NOT EXISTS (SELECT 1 FROM match_analyses ma WHERE ma.match_id = rm.match_id)`);
  // Master+ statistics: the list of counted game ids is only needed while the crawler can still
  // list those games (14 days back); the counters themselves hold nothing about players.
  await db.execute(sql`DELETE FROM stats_matches WHERE processed_at < ${cutoff}`);
  // Pairing codes nobody used, and expired sessions.
  await db.execute(sql`DELETE FROM device_links WHERE claimed_at IS NULL AND code_expires_at < ${now.toISOString()}`);
  await db.execute(sql`DELETE FROM sessions WHERE expires_at < ${now.toISOString()}`);
}

/** Runs the purge now and then once a day. Failures are logged and retried the next day. */
export function scheduleRetention(db: Db): () => void {
  const run = () => purgeUnlinkedMatches(db).catch((e) => console.error("[retention] purge failed", e));
  void run();
  const t = setInterval(run, 24 * 3600_000);
  t.unref?.();
  return () => clearInterval(t);
}

/** After unlinking or deleting accounts: their analyses go at once unless another linked account is that same player. */
export async function forgetPlayers(db: Db, puuids: string[]): Promise<void> {
  for (const puuid of new Set(puuids)) {
    await db.execute(sql`
      DELETE FROM match_analyses
      WHERE puuid = ${puuid} AND NOT EXISTS (SELECT 1 FROM riot_accounts WHERE puuid = ${puuid})`);
  }
}

/** Only the deleted account's captured match IDs are eligible. Run in the same
 * transaction as deletion; retain data still used by another linked account. */
export async function purgeDeletedMatches(db:Db,matchIds:string[]):Promise<void>{
  const ids=[...new Set(matchIds)];
  for(let offset=0;offset<ids.length;offset+=500){
    const list=sql.join(ids.slice(offset,offset+500).map(id=>sql`${id}`),sql`, `);
    await db.execute(sql`DELETE FROM match_analyses ma WHERE ma.match_id IN (${list})
      AND NOT EXISTS (SELECT 1 FROM account_matches am WHERE am.match_id=ma.match_id)
      AND NOT EXISTS (SELECT 1 FROM riot_accounts ra WHERE ra.puuid=ma.puuid)`);
    await db.execute(sql`DELETE FROM raw_timelines rt WHERE rt.match_id IN (${list})
      AND NOT EXISTS (SELECT 1 FROM account_matches am WHERE am.match_id=rt.match_id)
      AND NOT EXISTS (SELECT 1 FROM match_analyses ma WHERE ma.match_id=rt.match_id)`);
    await db.execute(sql`DELETE FROM raw_matches rm WHERE rm.match_id IN (${list})
      AND NOT EXISTS (SELECT 1 FROM account_matches am WHERE am.match_id=rm.match_id)
      AND NOT EXISTS (SELECT 1 FROM match_analyses ma WHERE ma.match_id=rm.match_id)`);
  }
}
