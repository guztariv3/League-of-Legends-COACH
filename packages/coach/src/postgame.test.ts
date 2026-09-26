import { describe, expect, it } from "vitest";
import { analyzeMatch, type MatchAnalysis } from "@coach/analysis";
import { normalizeMatch, type NormalizedMatch, type NormalizedParticipant, type RawTimeline } from "@coach/domain";
import { generateHistory } from "@coach/synthetic";
import { gameAchievements, gameRanking, RANKING_COMPONENTS, RANKING_EXPLANATION } from "./index.js";

const ROLES = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"] as const;
function player(i: number, over: Partial<NormalizedParticipant> = {}): NormalizedParticipant {
  return {
    participantId: i + 1, puuid: i === 0 ? "me" : `p${i}`, riotId: null, teamId: i < 5 ? 100 : 200, championId: i, championName: `C${i}`,
    role: ROLES[i % 5]!, win: i < 5, kills: 2, deaths: 3, assists: 4, cs: 150, gold: 9000, damageToChampions: 12000, damageTaken: 15000,
    visionScore: 20, level: 14, items: [], spells: [], runes: { keystone: null, primary: null, secondary: null }, perks: [], shards: [], ...over,
  };
}
function match(players: NormalizedParticipant[], durationSec = 1800): NormalizedMatch {
  return { matchId: "T_1", platform: "na1", queueId: 420, mode: "summoners_rift", patch: "26.19", startedAt: 0, durationSec, remake: false, participants: players };
}

describe("in-game ranking", () => {
  it("ranks the ten players 1–10 with a score out of 10, from a published formula", () => {
    const m = match(Array.from({ length: 10 }, (_, i) => player(i, { kills: i, deaths: 10 - i, damageToChampions: 8000 + i * 1000, cs: 100 + i * 10, visionScore: 10 + i })));
    const r = gameRanking(m)!;
    expect(r.map((x) => x.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    for (const x of r) expect(x.score).toBeGreaterThanOrEqual(0), expect(x.score).toBeLessThanOrEqual(10);
    expect(r[0]!.score).toBeGreaterThanOrEqual(r[9]!.score);
    expect(RANKING_COMPONENTS.reduce((s, c) => s + c.weight, 0)).toBeCloseTo(1);
    expect(RANKING_EXPLANATION).toMatch(/kill participation 25%/);
    expect(RANKING_EXPLANATION).toMatch(/ignores the result/);
  });

  it("the best at everything is first and the result doesn't count", () => {
    const players = Array.from({ length: 10 }, (_, i) => player(i));
    players[7] = player(7, { kills: 12, deaths: 0, assists: 10, damageToChampions: 40000, damageTaken: 30000, visionScore: 60, cs: 300, win: false });
    expect(gameRanking(match(players))![0]!.championName).toBe("C7");
  });

  it("doesn't count CS against supports", () => {
    const base = Array.from({ length: 10 }, (_, i) => player(i));
    const sup = gameRanking(match(base.map((p) => (p.participantId === 5 ? { ...p, cs: 20 } : p))))!.find((x) => x.participantId === 5)!;
    const same = gameRanking(match(base))!.find((x) => x.participantId === 5)!;
    expect(sup.score).toBe(same.score);
  });

  it("isn't given for remakes", () => {
    expect(gameRanking({ ...match(Array.from({ length: 10 }, (_, i) => player(i))), remake: true })).toBeNull();
  });
});

describe("achievements", () => {
  const games = generateHistory({ seed: 21, puuid: "me", gameName: "Me", tagLine: "T", platform: "na1", count: 60 });
  const analyses = games.map((g) => analyzeMatch(normalizeMatch(g.match), g.timeline, "me")).filter((a): a is MatchAnalysis => a !== null);

  it("are facts with the number behind them", () => {
    const players = Array.from({ length: 10 }, (_, i) => player(i));
    players[0] = player(0, { deaths: 0, damageToChampions: 30000, visionScore: 45, kills: 9 });
    const m = match(players);
    const kill = (t: number, killerId: number, victimId: number, assists: number[] = []) => ({ type: "CHAMPION_KILL", timestamp: t, killerId, victimId, assistingParticipantIds: assists });
    const timeline = { info: { frameInterval: 60_000, frames: [{ timestamp: 0, participantFrames: {}, events: [
      kill(185_000, 1, 7), kill(400_000, 1, 8, [2]),
      { type: "CHAMPION_SPECIAL_KILL", timestamp: 900_000, killerId: 1, killType: "KILL_MULTI", multiKillLength: 3 },
      { type: "ELITE_MONSTER_KILL", timestamp: 1_300_000, killerId: 1, killerTeamId: 100, monsterType: "BARON_NASHOR" },
    ] }] } } as unknown as RawTimeline;
    const game = { ...analyses[0]!, matchId: "T_1", championName: "C0", killParticipation: 0.8, goldDiff15: 1200, laneOpponentChampion: "C5" };
    const a = gameAchievements({ match: m, timeline, puuid: "me", game, history: [] });
    const titles = a.map((x) => x.title);
    expect(titles).toEqual(expect.arrayContaining([
      "Most damage in the game", "Highest vision score", "Most kills in the game", "Deathless",
      "Involved in most of your team's kills", "Won the lane on gold", "First blood", "Solo kill", "Triple kill", "Secured Baron Nashor",
    ]));
    expect(a.find((x) => x.id === "first-blood")!.detail).toBe("At 3:05");
    for (const x of a) expect(x.detail).toMatch(/\d/);
  });

  it("gives nothing for a tie at the top, and no personal best without enough games", () => {
    const m = match(Array.from({ length: 10 }, (_, i) => player(i)));
    const game = { ...analyses[0]!, matchId: "T_1", championName: "C0", killParticipation: 0.3, goldDiff15: 0 };
    const a = gameAchievements({ match: m, timeline: null, puuid: "me", game, history: [] });
    expect(a.filter((x) => x.scope === "game" && x.id.startsWith("most-"))).toHaveLength(0);
    expect(a.filter((x) => x.scope === "personal")).toHaveLength(0);
  });

  it("personal bests only count the same champion and mode, over at least 5 games", () => {
    const champ = analyses.filter((x) => x.analyzable && x.mode === "summoners_rift")[0]!.championName;
    const same = analyses.filter((x) => x.analyzable && x.mode === "summoners_rift" && x.championName === champ);
    expect(same.length).toBeGreaterThanOrEqual(5);
    const game = { ...same[0]!, kda: 99 };
    const g = games.find((x) => x.match.metadata.matchId === game.matchId)!;
    const a = gameAchievements({ match: normalizeMatch(g.match), timeline: g.timeline, puuid: "me", game, history: analyses });
    expect(a.find((x) => x.id === "best-kda")!.detail).toMatch(new RegExp(`over ${same.length} games`));
  });
});
