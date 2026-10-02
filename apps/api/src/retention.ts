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

/** A live frame older than this can no longer be shown (frames expire after 15 s); a margin is kept. */
export const LIVE_FRAME_KEEP_MS = 60_000;
/** The last match summary ("ended" frame) stays available for a day. */
export const ENDED_FRAME_KEEP_MS = 86_400_000;

/**
 * Shared Live frames (web Live page): they name the other players of the game, so a frame is only
 * kept while it can be shown. Stale frames go within minutes, even if the app was closed mid-game
 * and nobody opens the page; the end-of-match summary, which holds only your own line, after a day.
 */
export async function purgeStaleLiveFrames(db: Db, now = new Date()): Promise<void> {
  const stale = new Date(now.getTime() - LIVE_FRAME_KEEP_MS).toISOString();
  const day = new Date(now.getTime() - ENDED_FRAME_KEEP_MS).toISOString();
  await db.execute(sql`
    DELETE FROM live_frames
    WHERE (received_at < ${stale} AND payload->>'phase' IS DISTINCT FROM 'ended') OR received_at < ${day}`);
}

/** Runs the purge now and then once a day (live frames every few minutes). Failures are logged and retried. */
export function scheduleRetention(db: Db): () => void {
  const run = () => purgeUnlinkedMatches(db).catch((e) => console.error("[retention] purge failed", e));
  const live = () => purgeStaleLiveFrames(db).catch((e) => console.error("[retention] live purge failed", e));
  void run();
  void live();
  const t = setInterval(run, 24 * 3600_000);
  const l = setInterval(live, 5 * 60_000);
  t.unref?.();
  l.unref?.();
  return () => { clearInterval(t); clearInterval(l); };
}

/** After unlinking or deleting accounts: their analyses go at once unless another linked account is that same player. */
export async function forgetPlayers(db: Db, puuids: string[]): Promise<void> {
  for (const puuid of new Set(puuids)) {
    await db.execute(sql`
      DELETE FROM match_analyses
      WHERE puuid = ${puuid} AND NOT EXISTS (SELECT 1 FROM riot_accounts WHERE puuid = ${puuid})`);
  }
}
