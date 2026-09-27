import { gameAchievements } from "@coach/coach";
import { normalizeMatch, type RawMatch } from "@coach/domain";
import { inArray } from "drizzle-orm";
import { Hono } from "hono";
import type { AuthVars } from "./auth.js";
import { schema, type Db } from "./db/index.js";
import type { AccountAnalysis } from "./queries.js";
import { rankHistory, type RankPoint } from "./rank.js";
import type { Services } from "./services.js";

/** Queues with a profile card. Labels only; games are still classified by map and mode. */
export const PROFILE_QUEUES: { id: number; label: string; ranked: "RANKED_SOLO_5x5" | "RANKED_FLEX_SR" | null }[] = [
  { id: 420, label: "Ranked Solo", ranked: "RANKED_SOLO_5x5" },
  { id: 440, label: "Ranked Flex", ranked: "RANKED_FLEX_SR" },
  { id: 400, label: "Normal Draft", ranked: null },
  { id: 430, label: "Normal Blind", ranked: null },
];

type A = AccountAnalysis;

/**
 * The eight axes of the profile radar. Each is scored against the player's own games, never
 * against other players: 50 means "like your typical game", 100 "better than all of them".
 */
export const AXES: { id: string; label: string; value: (a: A) => number | null; higherIsBetter: boolean }[] = [
  { id: "fighting", label: "Fighting", value: (a) => a.killParticipation, higherIsBetter: true },
  { id: "damage", label: "Damage", value: (a) => a.damageShare, higherIsBetter: true },
  { id: "laning", label: "Laning", value: (a) => a.goldDiff15, higherIsBetter: true },
  { id: "farming", label: "Farming", value: (a) => a.csPerMin, higherIsBetter: true },
  { id: "vision", label: "Vision", value: (a) => a.visionPerMin, higherIsBetter: true },
  { id: "survival", label: "Survival", value: (a) => a.deathsPerMin, higherIsBetter: false },
  { id: "early", label: "Early game", value: (a) => a.earlyDeaths, higherIsBetter: false },
  { id: "economy", label: "Economy", value: (a) => a.goldShare, higherIsBetter: true },
];

const nums = (list: A[], pick: (a: A) => number | null | undefined) =>
  list.map(pick).filter((x): x is number => typeof x === "number" && Number.isFinite(x));
const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
const stat = (list: A[], pick: (a: A) => number | null | undefined) => {
  const xs = nums(list, pick);
  return xs.length ? { value: avg(xs)!, games: xs.length } : null;
};

/** Where the group's average falls among all the player's games (0–100, ties count half). */
function score(groupAvg: number, reference: number[], higherIsBetter: boolean): number {
  let below = 0, ties = 0;
  for (const r of reference) {
    if (r === groupAvg) ties++;
    else if (higherIsBetter ? r < groupAvg : r > groupAvg) below++;
  }
  return Math.round((100 * (below + ties / 2)) / reference.length);
}

export function radar(group: A[], reference: A[]) {
  return AXES.map((ax) => {
    const g = avg(nums(group, ax.value));
    const ref = nums(reference, ax.value);
    return { id: ax.id, label: ax.label, score: g === null || ref.length < 5 ? null : score(g, ref, ax.higherIsBetter), games: nums(group, ax.value).length };
  });
}

export function performance(list: A[]) {
  return {
    goldDiff15: stat(list, (a) => a.goldDiff15),
    goldShare: stat(list, (a) => a.goldShare),
    damageShare: stat(list, (a) => a.damageShare),
    damagePerMinDiff: stat(list, (a) => a.damagePerMinDiff),
    soloDeaths: stat(list, (a) => a.soloDeaths),
    visionScore: stat(list, (a) => a.visionScore),
  };
}

/**
 * LP won or lost in each game we can pin down: consecutive rank snapshots of the queue with
 * exactly one game between them, and exactly one game of that queue started in that window.
 */
export function lpByGame(history: (RankPoint & { accountId: string })[], games: A[]): Map<string, number> {
  const out = new Map<string, number>();
  const byAccount = new Map<string, (RankPoint & { accountId: string })[]>();
  for (const p of history) byAccount.set(p.accountId, [...(byAccount.get(p.accountId) ?? []), p]);
  for (const [accountId, points] of byAccount) {
    for (let i = 1; i < points.length; i++) {
      const cur = points[i]!, prev = points[i - 1]!;
      if (cur.lpChange === null) continue;
      const from = Date.parse(prev.at) - 2 * 3_600_000, to = Date.parse(cur.at);
      const inWindow = games.filter((g) => g.accountId === accountId && g.startedAt > from && g.startedAt <= to && !out.has(g.matchId));
      if (inWindow.length === 1) out.set(inWindow[0]!.matchId, cur.lpChange);
    }
  }
  return out;
}

function row(kind: "role" | "champion", name: string, list: A[], reference: A[], lp: Map<string, number> | null) {
  const wins = list.filter((a) => a.win).length;
  const k = avg(list.map((a) => a.kills)) ?? 0, d = avg(list.map((a) => a.deaths)) ?? 0, as = avg(list.map((a) => a.assists)) ?? 0;
  const lpGames = lp ? list.filter((a) => lp.has(a.matchId)) : [];
  return {
    kind, name,
    championId: kind === "champion" ? list[0]?.championId ?? null : null,
    games: list.length, wins,
    kills: k, deaths: d, assists: as, kda: (k + as) / Math.max(1, d),
    csPerMin: avg(nums(list, (a) => a.csPerMin)),
    killParticipation: avg(nums(list, (a) => a.killParticipation)),
    lp: lp && lpGames.length ? { value: lpGames.reduce((s, a) => s + lp.get(a.matchId)!, 0), games: lpGames.length } : null,
    radar: radar(list, reference),
    performance: performance(list),
  };
}

export function overviewRoutes({ db, services }: { db: Db; services: Services }) {
  const r = new Hono<AuthVars>();

  /** Profile overview for one queue: the queue cards, and the radar, primary-role table and performance for it. */
  r.get("/overview", async (c) => {
    const { accounts, analyses } = await services.profileAnalyses(c.get("userId"));
    const sr = analyses.filter((a) => a.analyzable && a.mode === "summoners_rift");
    const snaps = accounts.length
      ? await db.select().from(schema.rankSnapshots).where(inArray(schema.rankSnapshots.accountId, accounts.map((a) => a.id)))
      : [];
    const historyOf = (queueType: string) => accounts.flatMap((acc) =>
      rankHistory(snaps.filter((s) => s.accountId === acc.id && s.queueType === queueType)).map((p) => ({ ...p, accountId: acc.id })));

    const queues = PROFILE_QUEUES.map((q) => {
      const games = sr.filter((a) => a.queueId === q.id);
      const history = q.ranked ? historyOf(q.ranked) : [];
      const current = history.length ? history.reduce((a, b) => (Date.parse(b.at) > Date.parse(a.at) ? b : a)) : null;
      return {
        queueId: q.id, label: q.label, ranked: q.ranked !== null,
        rank: current ? { tier: current.tier, division: current.rank, lp: current.lp, wins: current.wins, losses: current.losses } : null,
        games: games.length, wins: games.filter((a) => a.win).length,
      };
    }).filter((q) => q.rank || q.games > 0);

    const asked = Number(c.req.query("queue"));
    const selected = queues.find((q) => q.queueId === asked && q.games > 0)
      ?? queues.find((q) => q.queueId === 420 && q.games > 0)
      ?? [...queues].sort((a, b) => b.games - a.games)[0];
    const queueId = selected?.queueId ?? null;
    const inQueue = sr.filter((a) => a.queueId === queueId);

    const roleCounts = new Map<string, number>();
    for (const a of inQueue) if (a.role !== "NONE") roleCounts.set(a.role, (roleCounts.get(a.role) ?? 0) + 1);
    const role = [...roleCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const inRole = inQueue.filter((a) => a.role === role);

    const ranked = PROFILE_QUEUES.find((q) => q.id === queueId)?.ranked ?? null;
    const lp = ranked ? lpByGame(historyOf(ranked), inQueue) : null;
    const lpColumn = lp !== null && lp.size > 0;

    const champs = new Map<string, A[]>();
    for (const a of inRole) champs.set(a.championName, [...(champs.get(a.championName) ?? []), a]);
    const rows = role ? [
      row("role", role, inRole, sr, lpColumn ? lp : null),
      ...[...champs.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 5).map(([name, list]) => row("champion", name, list, sr, lpColumn ? lp : null)),
    ] : [];

    const solo = historyOf("RANKED_SOLO_5x5");
    return c.json({
      queues, selected: queueId, role, games: inQueue.length, lpColumn, rows,
      axes: AXES.map((a) => ({ id: a.id, label: a.label })),
      lpTrack: { queue: ranked ?? (solo.length ? "RANKED_SOLO_5x5" : null), history: ranked ? historyOf(ranked) : solo },
      lastSyncedAt: accounts.map((a) => a.lastSyncedAt?.toISOString() ?? null).filter(Boolean).sort().at(-1) ?? null,
    });
  });
  /**
   * The Overview tab: activity, roles, a summary of the last 10 games and the game cards, for
   * the chosen queue, role and champion. Cards carry the ten players, scoreboard facts as tags
   * and the LP change when it is known for that game.
   */
  r.get("/overview/games", async (c) => {
    const { accounts, analyses } = await services.profileAnalyses(c.get("userId"));
    const q = c.req.query();
    const queue = Number(q.queue) || null;
    const role = q.role && q.role !== "ALL" ? q.role : null;
    const champion = q.champion?.slice(0, 40) || null;
    const limit = Math.min(40, Number(q.limit) || 20);
    const filtered = analyses.filter((a) => (queue === null || a.queueId === queue) && (role === null || a.role === role) && (champion === null || a.championName === champion));
    const usable = filtered.filter((a) => a.analyzable);

    const since = Date.now() - 120 * 86_400_000;
    const recent120 = filtered.filter((a) => a.startedAt >= since);
    const roles = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"].map((r) => {
      const g = usable.filter((a) => a.role === r && a.mode === "summoners_rift");
      return { role: r, games: g.length, wins: g.filter((a) => a.win).length };
    });

    const last10 = usable.slice(0, 10);
    const group = (list: A[]) => {
      const k = avg(list.map((a) => a.kills)) ?? 0, d = avg(list.map((a) => a.deaths)) ?? 0, as = avg(list.map((a) => a.assists)) ?? 0;
      return { games: list.length, wins: list.filter((a) => a.win).length, kills: k, deaths: d, assists: as, kda: (k + as) / Math.max(1, d) };
    };
    const byKey = (key: (a: A) => string) => {
      const m = new Map<string, A[]>();
      for (const a of last10) m.set(key(a), [...(m.get(key(a)) ?? []), a]);
      return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
    };
    const topRole = byKey((a) => a.role).find(([r]) => r !== "NONE");
    const summary = {
      ...group(last10),
      role: topRole ? { role: topRole[0], ...group(topRole[1]) } : null,
      champions: byKey((a) => a.championName).slice(0, 2).map(([name, list]) => ({ name, championId: list[0]!.championId, ...group(list) })),
      games: last10.map((a) => ({ matchId: a.matchId, championName: a.championName, championId: a.championId, win: a.win, kills: a.kills, deaths: a.deaths, assists: a.assists, startedAt: a.startedAt })),
    };

    // LP per game, when known.
    const snaps = accounts.length ? await db.select().from(schema.rankSnapshots).where(inArray(schema.rankSnapshots.accountId, accounts.map((a) => a.id))) : [];
    const lp = new Map<string, number>();
    for (const pq of PROFILE_QUEUES.filter((x) => x.ranked)) {
      const hist = accounts.flatMap((acc) => rankHistory(snaps.filter((s) => s.accountId === acc.id && s.queueType === pq.ranked)).map((p) => ({ ...p, accountId: acc.id })));
      for (const [id, v] of lpByGame(hist, analyses.filter((a) => a.queueId === pq.id))) lp.set(id, v);
    }

    const page = filtered.slice(0, limit);
    const raws = page.length ? await db.select().from(schema.rawMatches).where(inArray(schema.rawMatches.matchId, page.map((a) => a.matchId))) : [];
    const rawById = new Map(raws.map((r) => [r.matchId, r.payload as RawMatch]));
    const queueName = (id: number) => PROFILE_QUEUES.find((x) => x.id === id)?.label ?? (id === 450 ? "ARAM" : "Other");
    const cards = page.map((a) => {
      const raw = rawById.get(a.matchId);
      const match = raw ? normalizeMatch(raw) : null;
      const me = match?.participants.find((p) => p.puuid === a.puuid);
      return {
        matchId: a.matchId, queueId: a.queueId, queue: queueName(a.queueId), patch: a.patch, startedAt: a.startedAt, durationSec: a.durationSec,
        analyzable: a.analyzable, win: a.win, championName: a.championName, championId: a.championId, role: a.role, level: a.level,
        kills: a.kills, deaths: a.deaths, assists: a.assists, kda: a.kda, cs: a.cs, csPerMin: a.csPerMin, csDiff15: a.csDiff15,
        killParticipation: a.killParticipation, visionScore: a.visionScore, items: a.items, spells: a.spells, runes: a.runes,
        lpChange: lp.get(a.matchId) ?? null,
        // Scoreboard-only facts (no timeline load here); the match page has the full list.
        tags: match ? gameAchievements({ match, timeline: null, puuid: a.puuid, game: a, history: analyses }).slice(0, 4).map((t) => t.title) : [],
        players: match ? match.participants.map((p) => ({ teamId: p.teamId, championName: p.championName, championId: p.championId, name: p.riotId?.split("#")[0] ?? null, isMe: p === me })) : [],
      };
    });

    return c.json({
      activity: {
        days: 120,
        games: recent120.length,
        hours: Math.round(recent120.reduce((s, a) => s + a.durationSec, 0) / 3600),
        list: recent120.map((a) => ({ t: a.startedAt, win: a.win, analyzable: a.analyzable, mode: a.mode, durationSec: a.durationSec })),
      },
      roles, summary, cards, total: filtered.length,
      champions: [...new Set(analyses.map((a) => a.championName))].sort(),
    });
  });
  return r;
}
