import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { normalizeMatch, type RawMatch, type RawTimeline } from "@coach/domain";
import { generateHistory, SYNTHETIC_ITEMS } from "@coach/synthetic";
import { openDatabase, type Database } from "../db/index.js";
import { maxOrder, statRows, type StatRow } from "./aggregate.js";
import { championStats, MIN_GAMES, MIN_OPTION, previousPatch, recordGame, seen } from "./store.js";
import { RiotApiError } from "@coach/riot";
import { StatsCrawler, type StatsRiot } from "./crawler.js";

const COMPLETED = new Set(SYNTHETIC_ITEMS.map((i) => i.id));
const history = generateHistory({ seed: 11, puuid: "p-stats", gameName: "Stats", tagLine: "T1", platform: "EUW1", count: 40, now: Date.UTC(2026, 8, 20) });

let database: Database;
beforeAll(async () => { database = await openDatabase(undefined, undefined); });
afterAll(async () => { await database.close(); });

describe("maxOrder", () => {
  it("reads the order the basic abilities reached rank 5", () => {
    // Q first to 5, then W, then E.
    const order = [1, 2, 3, 1, 1, 4, 1, 2, 1, 2, 4, 2, 2, 3, 3, 4, 3, 3] as const;
    expect(maxOrder([...order])).toBe("Q>W>E");
    expect(maxOrder([1, 3, 1, 3, 1, 3, 1, 3, 1, 3])).toBe("Q>E>W");
  });
  it("says nothing before two abilities are maxed", () => {
    expect(maxOrder([1, 2, 3, 1, 1, 4, 1, 1])).toBeNull();
  });
});

describe("statRows", () => {
  it("preserves complete rune pages with role and matchup instead of mixing individual runes", () => {
    const g = structuredClone(history.find(h => h.scenario === "normal" && h.timeline)!);
    const p = g.match.info.participants[0]!;
    p.perks = {styles:[{style:8000,selections:[8008,9101,9104,8299].map(perk=>({perk}))},{style:8400,selections:[8444,8451].map(perk=>({perk}))}],statPerks:{offense:5005,flex:5008,defense:5001}};
    const {rows}=statRows(g.match,g.timeline,COMPLETED);
    const page=rows.find(r=>r.kind==='rune_page' && r.champion===p.championName)!;
    expect(page.key).toBe('8000>8400>8008>9101>9104>8299>8444>8451>5005>5008>5001');
    expect(rows.some(r=>r.kind==='matchup_rune_page' && r.position===page.position && r.key.endsWith('|'+page.key))).toBe(true);
  });

  it("counts every player of a solo-queue game and nothing about who they are", () => {
    const g = history.find((h) => h.scenario === "normal" && h.timeline)!;
    const { rows } = statRows(g.match, g.timeline, COMPLETED);
    const games = rows.filter((r) => r.kind === "games");
    expect(games.length).toBe(10);
    for (const r of rows) expect(Object.keys(r).sort()).toEqual(["champion", "key", "kind", "minute", "position", "win"]);
    const first = rows.filter((r) => r.kind === "first_item");
    expect(first.length).toBeGreaterThan(0);
    for (const r of first) {
      expect(COMPLETED.has(Number(r.key))).toBe(true);
      expect(r.minute).toBeGreaterThan(0);
    }
    const matchupFirst=rows.filter(r=>r.kind==='matchup_first_item');
    expect(matchupFirst.length).toBeGreaterThan(0);
    for(const r of matchupFirst){const [opponent,id]=r.key.split('|');expect(opponent).toBeTruthy();expect(first.some(f=>f.champion===r.champion&&f.position===r.position&&f.key===id&&f.win===r.win)).toBe(true);}
    // Wins match the team result.
    const winners = games.filter((r) => r.win).length;
    expect(winners).toBe(5);
  });
  it("skips components: only finished items are counted", () => {
    const g = history.find((h) => h.scenario === "normal" && h.timeline)!;
    const { rows } = statRows(g.match, g.timeline, new Set());
    expect(rows.some((r) => r.kind === "first_item" || r.kind === "core")).toBe(false);
  });
  it("ignores remakes and other queues", () => {
    for (const s of ["remake", "aram", "unsupported_mode"] as const) {
      const g = history.find((h) => h.scenario === s);
      if (g) expect(statRows(g.match, g.timeline, COMPLETED).rows).toEqual([]);
    }
  });
});

describe("store", () => {
  const row = (kind: StatRow["kind"], key: string, win: boolean, minute: number | null = null): StatRow =>
    ({ champion: "Ahri", position: "MIDDLE", kind, key, win, minute });

  it("knows the previous patch", () => {
    expect(previousPatch("16.19")).toBe("16.18");
    expect(previousPatch("16.1")).toBeNull();
  });

  it("says nothing below the minimum sample, then labels the patch and the sample", async () => {
    const db = database.db;
    for (let i = 0; i < MIN_GAMES - 1; i++) {
      await recordGame(db, { matchId: `EUW1_A${i}`, platform: "EUW1", patch: "16.19", counted: true,
        rows: [row("games", "", i % 2 === 0), row("first_item", i < 20 ? "3100" : "6655", i % 2 === 0, 10 + (i % 3)), row("skill_max", "Q>W>E", i % 2 === 0)] });
    }
    expect(await championStats(db, "Ahri", "MIDDLE", "16.19")).toBeNull();
    await recordGame(db, { matchId: "EUW1_Alast", platform: "EUW1", patch: "16.19", counted: true, rows: [row("games", "", true), row("skill_max", "Q>E>W", true)] });
    const s = (await championStats(db, "Ahri", "MIDDLE", "16.19"))!;
    expect(s.patchLabel).toBe("current");
    expect(s.games).toBe(MIN_GAMES);
    expect(s.byKind.first_item![0]!.key).toBe("3100");
    expect(s.byKind.first_item![0]!.avgMinute).toBeCloseTo(11, 0);
    // One game of Q>E>W is below the option minimum: not listed.
    expect(s.byKind.skill_max!.map((o) => o.key)).toEqual(["Q>W>E"]);
    expect(s.byKind.skill_max![0]!.games).toBeGreaterThanOrEqual(MIN_OPTION);
  });

  it("falls back to the previous patch, labelled as such", async () => {
    const s = (await championStats(database.db, "Ahri", "MIDDLE", "16.20"))!;
    expect(s.patch).toBe("16.19");
    expect(s.patchLabel).toBe("previous");
    expect(await championStats(database.db, "Ahri", "MIDDLE", "16.22")).toBeNull();
  });

  it("marks a game as seen once, even when it is recorded twice", async () => {
    await recordGame(database.db, { matchId: "EUW1_A0", platform: "EUW1", patch: "16.19", counted: true, rows: [] });
    expect([...(await seen(database.db, ["EUW1_A0", "EUW1_nope"]))]).toEqual(["EUW1_A0"]);
  });
});

describe("StatsCrawler", () => {
  function fakeRiot(games: { match: RawMatch; timeline: RawTimeline | null }[]) {
    const calls = { league: 0, ids: 0, match: 0, timeline: 0 };
    const byId = new Map(games.map((g) => [g.match.metadata.matchId, g]));
    const riot: StatsRiot = {
      async getApexLeague(_p, tier) {
        calls.league++;
        return tier === "challenger" ? { tier: "CHALLENGER", entries: [{ puuid: "low", leaguePoints: 900 }, { puuid: "top", leaguePoints: 1500 }, { leaguePoints: 2000 }] } : { tier, entries: [] };
      },
      async getMatchIds(_p, puuid, q) {
        calls.ids++;
        expect(q.queue).toBe(420);
        return puuid === "top" ? [...byId.keys()] : [];
      },
      async getMatch(_p, id) { calls.match++; return byId.get(id)?.match ?? null; },
      async getTimeline(_p, id) { calls.timeline++; return byId.get(id)?.timeline ?? null; },
    };
    return { riot, calls };
  }

  it("walks Master+ players from the top, counts only the current and previous patch, and never twice", async () => {
    const opened = await openDatabase(undefined, undefined);
    try {
      const solo = history.filter((h) => h.match.info.queueId === 420 && h.timeline && h.scenario !== "remake").slice(0, 6)
        // Two games of an old patch, which must not be counted.
        .map((g, i) => i < 2 ? { ...g, match: { ...g.match, info: { ...g.match.info, gameVersion: "0.0.100.1" } } } : g);
      const current = normalizeMatch(solo[5]!.match).patch;
      const { riot, calls } = fakeRiot(solo);
      const crawler = new StatsCrawler({ db: opened.db, riot, platforms: ["EUW1"], patch: async () => ({ patch: current, completed: COMPLETED }), now: () => Date.UTC(2026, 8, 21) });

      expect(await crawler.step()).toBe("players");
      expect(calls.league).toBe(3);
      expect(await crawler.step()).toBe("listed"); // the highest-LP player first
      const results: string[] = [];
      for (let i = 0; i < solo.length; i++) results.push(await crawler.step());
      const wanted = solo.filter((g) => normalizeMatch(g.match).patch === current || normalizeMatch(g.match).patch === previousPatch(current)).length;
      expect(wanted).toBe(4);
      expect(results.filter((r) => r === "counted").length).toBe(wanted);
      // Games of other patches are marked seen without fetching their timeline.
      expect(calls.timeline).toBe(wanted);
      expect((await seen(opened.db, solo.map((g) => g.match.metadata.matchId))).size).toBe(solo.length);

      // The next listing finds nothing new.
      expect(await crawler.step()).toBe("listed");
      expect(await crawler.step()).toBe("listed");
      expect(calls.match).toBe(solo.length);
    } finally {
      await opened.close();
    }
  });

  it.each(["match", "timeline"] as const)("does not claim missing %s data and counts a later successful retry only once", async missing => {
    const opened = await openDatabase();
    try {
      const game = history.find(g => g.match.info.queueId === 420 && g.timeline && g.scenario !== "remake")!;
      const { riot, calls } = fakeRiot([game]);
      let available = false;
      const getMatch = riot.getMatch, getTimeline = riot.getTimeline;
      riot.getMatch = async (...args) => missing === "match" && !available ? null : getMatch(...args);
      riot.getTimeline = async (...args) => missing === "timeline" && !available ? null : getTimeline(...args);
      const crawler = new StatsCrawler({ db: opened.db, riot, platforms:["EUW1"], perLeague:1,
        patch:async()=>({patch:normalizeMatch(game.match).patch,completed:COMPLETED}) });
      await crawler.step(); await crawler.step();
      expect(await crawler.step()).toBe("unavailable");
      expect((await seen(opened.db,[game.match.metadata.matchId])).size).toBe(0);
      available = true;
      await crawler.step();
      expect(await crawler.step()).toBe("counted");
      expect((await seen(opened.db,[game.match.metadata.matchId])).size).toBe(1);
      const count = calls.timeline;
      await crawler.step(); await crawler.step();
      expect(calls.timeline).toBe(count);
    } finally { await opened.close(); }
  });

  it("backs off an empty ladder for a minute instead of fetching every tick", async () => {
    let now=0, calls=0;
    const {riot}=fakeRiot([]);
    riot.getApexLeague=async()=>{ calls++; return null; };
    const crawler=new StatsCrawler({db:database.db,riot,platforms:["EUW1"],now:()=>now,
      patch:async()=>({patch:"16.19",completed:COMPLETED})});
    expect(await crawler.step()).toBe("players");
    expect(calls).toBe(3);
    now=59_999;
    expect(await crawler.step()).toBe("idle");
    expect(calls).toBe(3);
    now=60_000;
    expect(await crawler.step()).toBe("players");
    expect(calls).toBe(6);
  });

  it("reports bounded aggregate progress without copying exception messages or secrets", async () => {
    vi.useFakeTimers();
    const log=vi.spyOn(console,"info").mockImplementation(()=>{});
    const {riot}=fakeRiot([]);
    const crawler=new StatsCrawler({db:database.db,riot,platforms:["EUW1"],
      patch:async()=>{throw new RiotApiError("private-key-and-player-details",403,"auth");}});
    try {
      crawler.start(1000);
      await vi.advanceTimersByTimeAsync(61_000);
      expect(log).toHaveBeenCalledTimes(2);
      const output=JSON.stringify(log.mock.calls);
      expect(output).toContain("failed-auth");
      expect(output).not.toContain("private-key-and-player-details");
    } finally {crawler.stop();log.mockRestore();vi.useRealTimers();}
  });

  it("does nothing without patch data", async () => {
    const { riot, calls } = fakeRiot([]);
    const crawler = new StatsCrawler({ db: database.db, riot, platforms: ["EUW1"], patch: async () => null });
    expect(await crawler.step()).toBe("no-patch");
    expect(calls.league).toBe(0);
  });
});
