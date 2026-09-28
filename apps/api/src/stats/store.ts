import { and, eq, inArray, sql } from "drizzle-orm";
import { schema, type Db } from "../db/index.js";
import type { StatKind, StatRow } from "./aggregate.js";

/** A champion needs this many games in a patch before anything is said about it. */
export const MIN_GAMES = 30;
/** An option (item, rune, order…) needs this many games to be listed. */
export const MIN_OPTION = 8;

/** Adds one game's rows to the counters and marks the game as done. */
export async function recordGame(db: Db, g: { matchId: string; platform: string; patch: string; rows: StatRow[]; counted: boolean }): Promise<void> {
  // Several rows of a game can share a counter (never in practice, but add them up to be safe).
  const acc = new Map<string, { champion: string; position: string; kind: StatKind; key: string; games: number; wins: number; minuteSum: number; minuteN: number }>();
  for (const r of g.counted ? g.rows : []) {
    const id = `${r.champion}|${r.position}|${r.kind}|${r.key}`;
    const a = acc.get(id) ?? { champion: r.champion, position: r.position, kind: r.kind, key: r.key, games: 0, wins: 0, minuteSum: 0, minuteN: 0 };
    a.games++; if (r.win) a.wins++;
    if (r.minute !== null) { a.minuteSum += r.minute; a.minuteN++; }
    acc.set(id, a);
  }
  await db.transaction(async tx => {
    // Claim the immutable match in the same transaction as every counter increment.
    const claimed = await tx.insert(schema.statsMatches).values({matchId:g.matchId,platform:g.platform,patch:g.patch,counted:g.counted})
      .onConflictDoNothing().returning({id:schema.statsMatches.matchId});
    if (!claimed.length) return;
    const c = schema.statsCounts;
    for (const a of acc.values()) {
      await tx.insert(c).values({ patch: g.patch, ...a })
        .onConflictDoUpdate({
          target: [c.patch, c.champion, c.position, c.kind, c.key],
          set: {
            games: sql`${c.games} + ${a.games}`,
            wins: sql`${c.wins} + ${a.wins}`,
            minuteSum: sql`${c.minuteSum} + ${a.minuteSum}`,
            minuteN: sql`${c.minuteN} + ${a.minuteN}`,
          },
        });
    }
  });
}

export async function seen(db: Db, matchIds: string[]): Promise<Set<string>> {
  if (!matchIds.length) return new Set();
  const rows = await db.select({ id: schema.statsMatches.matchId }).from(schema.statsMatches).where(inArray(schema.statsMatches.matchId, matchIds));
  return new Set(rows.map((r) => r.id));
}

export interface StatOption { key: string; games: number; wins: number; share: number; winRate: number; avgMinute: number | null }
export interface ChampionStats {
  patch: string;
  /** "current" = the patch the game data is on; "previous" = the one before, used when the current has too few games. */
  patchLabel: "current" | "previous";
  champion: string;
  position: string;
  games: number;
  wins: number;
  winRate: number;
  byKind: Partial<Record<Exclude<StatKind, "games">, StatOption[]>>;
  /** Unfiltered counters for engine baselines and prefix aggregation; never display-filter first. */
  evidenceByKind?: Partial<Record<Exclude<StatKind, "games">, StatOption[]>>;
}

/** The patch before "16.19" is "16.18"; null for the first patch of a season (unknown). */
export function previousPatch(patch: string): string | null {
  const [major, minor] = patch.split(".").map(Number);
  if (!Number.isFinite(major) || !Number.isFinite(minor) || minor! <= 1) return null;
  return `${major}.${minor! - 1}`;
}

/**
 * The champion's counters for the current patch, or the previous one when the current has too few
 * games. Without a position, the position the champion is played in most that patch.
 */
export async function championStats(db: Db, champion: string, position: string | null, currentPatch: string): Promise<ChampionStats | null> {
  const prev = previousPatch(currentPatch);
  const c = schema.statsCounts;
  for (const [patch, patchLabel] of [[currentPatch, "current"], ...(prev ? [[prev, "previous"]] : [])] as [string, "current" | "previous"][]) {
    let pos = position;
    if (!pos) {
      const totals = await db.select({ position: c.position, games: c.games }).from(c)
        .where(and(eq(c.patch, patch), eq(c.champion, champion), eq(c.kind, "games"), eq(c.key, "")));
      pos = totals.sort((a, b) => b.games - a.games)[0]?.position ?? null;
      if (!pos) continue;
    }
    const rows = await db.select().from(c).where(and(eq(c.patch, patch), eq(c.champion, champion), eq(c.position, pos)));
    const total = rows.find((r) => r.kind === "games" && r.key === "");
    if (!total || total.games < MIN_GAMES) continue;
    const byKind: ChampionStats["byKind"] = {};
    const evidenceByKind: ChampionStats["byKind"] = {};
    for (const r of rows) {
      if (r.kind === "games") continue;
      const k = r.kind as Exclude<StatKind, "games">;
      const option: StatOption = {
        key: r.key, games: r.games, wins: r.wins, share: r.games / total.games, winRate: r.games > 0 ? r.wins / r.games : 0,
        avgMinute: r.minuteN ? r.minuteSum / r.minuteN : null,
      };
      (evidenceByKind[k] ??= []).push(option);
      if (r.games >= MIN_OPTION) (byKind[k] ??= []).push(option);
    }
    for (const k of Object.keys(byKind) as (keyof typeof byKind)[]) byKind[k]!.sort((a, b) => b.games - a.games);
    return { patch, patchLabel, champion, position: pos, games: total.games, wins: total.wins, winRate: total.wins / total.games, byKind, evidenceByKind };
  }
  return null;
}
