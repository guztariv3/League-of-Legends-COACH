import { describe, expect, it } from "vitest";
import { analyzeMatch, type MatchAnalysis } from "@coach/analysis";
import { normalizeMatch } from "@coach/domain";
import { generateHistory } from "@coach/synthetic";
import { activity, championPool, matchupPool, MIN_POOL_GAMES } from "./index.js";

const analyses = generateHistory({ seed: 31, puuid: "me", gameName: "Me", tagLine: "T", platform: "na1", count: 80 })
  .map((g) => analyzeMatch(normalizeMatch(g.match), g.timeline, "me")).filter((a): a is MatchAnalysis => a !== null);
const rift = analyses.filter((a) => a.analyzable && a.mode === "summoners_rift");

const fake = (i: number, win: boolean, over: Partial<MatchAnalysis> = {}): MatchAnalysis =>
  ({ ...rift[0]!, matchId: `F_${i}`, win, championName: "Solo", laneOpponentChampion: "Rival", startedAt: i, ...over });

describe("champion pool", () => {
  it("counts only analyzable Rift games, most played first, with wins and a Wilson interval", () => {
    const pool = championPool(analyses);
    expect(pool.reduce((s, e) => s + e.games, 0)).toBe(rift.length);
    for (let i = 1; i < pool.length; i++) expect(pool[i - 1]!.games).toBeGreaterThanOrEqual(pool[i]!.games);
    for (const e of pool) {
      expect(e.wins).toBeLessThanOrEqual(e.games);
      expect(e.interval.low).toBeLessThanOrEqual(e.wins / e.games);
      expect(e.interval.high).toBeGreaterThanOrEqual(e.wins / e.games);
    }
  });

  it("gives a verdict only when it's clear, and never under the minimum", () => {
    const winning = championPool(Array.from({ length: 12 }, (_, i) => fake(i, i < 11)))[0]!;
    expect(winning.verdict).toBe("strong");
    const losing = championPool(Array.from({ length: 12 }, (_, i) => fake(i, i < 1)))[0]!;
    expect(losing.verdict).toBe("weak");
    const even = championPool(Array.from({ length: 12 }, (_, i) => fake(i, i % 2 === 0)))[0]!;
    expect(even.verdict).toBe("even");
    const few = championPool(Array.from({ length: MIN_POOL_GAMES - 1 }, (_, i) => fake(i, true)))[0]!;
    expect(few.verdict).toBe("few");
  });
});

describe("matchup pool", () => {
  it("groups by lane opponent, optionally for one champion", () => {
    const all = matchupPool(analyses);
    expect(all.reduce((s, e) => s + e.games, 0)).toBe(rift.filter((a) => a.laneOpponentChampion).length);
    const champ = championPool(analyses)[0]!.name;
    const one = matchupPool(analyses, champ);
    expect(one.reduce((s, e) => s + e.games, 0)).toBe(rift.filter((a) => a.championName === champ && a.laneOpponentChampion).length);
  });
});

describe("activity", () => {
  it("lists games since a date, oldest first, flagging non-analyzable ones", () => {
    const since = Math.min(...analyses.map((a) => a.startedAt)) + 1;
    const list = activity(analyses, since);
    expect(list.length).toBe(analyses.filter((a) => a.startedAt >= since).length);
    for (let i = 1; i < list.length; i++) expect(list[i]!.t).toBeGreaterThanOrEqual(list[i - 1]!.t);
  });
});
