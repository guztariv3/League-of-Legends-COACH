import { describe, expect, it } from "vitest";
import { analyzeMatch, type MatchAnalysis } from "@coach/analysis";
import { normalizeMatch } from "@coach/domain";
import { generateHistory } from "@coach/synthetic";
import { LATE_BACK_GOLD, playerMemory, playstyle, styleNote } from "./memory.js";

const history = generateHistory({ seed: 41, puuid: "me", gameName: "Me", tagLine: "T", platform: "na1", count: 30 })
  .map((g) => analyzeMatch(normalizeMatch(g.match), g.timeline, "me")).filter((a): a is MatchAnalysis => a !== null);
const base: MatchAnalysis = {
  ...history.find((a) => a.analyzable && a.mode === "summoners_rift")!,
  championName: "Ahri", role: "MIDDLE", win: true, earlyDeaths: 0, teamGoldDiff15: 0, deathsAfter15: 1, csDiff15: 0, goldDiff10: 0,
  killParticipation: 0.5, firstBack: { atSec: 400, gold: 900 }, purchases: [],
};
let n = 0;
const game = (over: Partial<MatchAnalysis> = {}): MatchAnalysis => ({ ...base, matchId: `G${n++}`, ...over });
const many = (k: number, over: Partial<MatchAnalysis>) => Array.from({ length: k }, () => game(over));

describe("player memory", () => {
  it("finds recurring early deaths on the champion, with the count", () => {
    const m = playerMemory({ history: [...many(4, { earlyDeaths: 2 }), ...many(4, { earlyDeaths: 0 })], champion: "Ahri", position: "MIDDLE" });
    const p = m.patterns.find((x) => x.id === "early-deaths")!;
    expect(p).toMatchObject({ kind: "mistake", scope: "champion", games: 8, hits: 4 });
    expect(p.text).toMatch(/with Ahri/);
    expect(p.why).toMatch(/4 of your last 8 games/);
  });

  it("says nothing below the minimum sample", () => {
    expect(playerMemory({ history: many(4, { earlyDeaths: 3 }), champion: "Ahri" }).patterns).toEqual([]);
  });

  it("widens the scope to the role, then to all games, when the champion has too few", () => {
    const other = many(6, { championName: "Lux", earlyDeaths: 2 });
    const m = playerMemory({ history: [...other, ...many(2, {})], champion: "Ahri", position: "MIDDLE" });
    expect(m.patterns[0]).toMatchObject({ id: "early-deaths", scope: "role" });
    expect(m.patterns[0]!.text).toMatch(/as mid laner/);
  });

  it("reads lost leads, late backs and slow items, and keeps at most two mistakes and one strength", () => {
    const games = [
      ...many(5, { teamGoldDiff15: 2500, win: false, deathsAfter15: 4, firstBack: { atSec: 480, gold: LATE_BACK_GOLD + 400 }, goldDiff10: 600, purchases: [{ itemId: 6655, atSec: 17 * 60 }] }),
      ...many(3, { teamGoldDiff15: 2000, win: true, goldDiff10: 400, purchases: [{ itemId: 6655, atSec: 16 * 60 }] }),
    ];
    const m = playerMemory({ history: games, champion: "Ahri", reference: { itemId: 6655, name: "Luden's Companion", avgMinute: 13.2 } });
    const ids = m.patterns.map((p) => p.id);
    expect(m.patterns.filter((p) => p.kind === "mistake")).toHaveLength(2);
    expect(m.patterns.filter((p) => p.kind === "strength").map((p) => p.id)).toEqual(["lane-strong"]);
    expect(ids).toContain("lead-lost");
    // Each line carries its numbers.
    const back = playerMemory({ history: many(6, { firstBack: { atSec: 450, gold: 2100 } }), champion: "Ahri" }).patterns[0]!;
    expect(back.id).toBe("late-back");
    expect(back.why).toMatch(/2,100 gold at 7:30/);
    const slow = playerMemory({ history: many(6, { purchases: [{ itemId: 6655, atSec: 17 * 60 }] }), champion: "Ahri", reference: { itemId: 6655, name: "Luden's Companion", avgMinute: 13.2 } }).patterns[0]!;
    expect(slow.text).toBe("Your Luden's Companion comes 4 minutes later than in Master+ games");
  });

  it("names strengths too", () => {
    const m = playerMemory({ history: many(10, { earlyDeaths: 0, teamGoldDiff15: 2000, win: true }), champion: "Ahri" });
    expect(m.patterns.map((p) => p.kind)).toEqual(["strength"]);
  });
});

describe("playstyle", () => {
  it("needs enough games", () => {
    expect(playstyle(many(9, { killParticipation: 0.7, earlyDeaths: 2 }))).toBeNull();
  });
  it("reads aggressive, safe and balanced from the player's numbers", () => {
    expect(playstyle(many(10, { killParticipation: 0.7, earlyDeaths: 2 }))!.style).toBe("aggressive");
    expect(playstyle(many(10, { killParticipation: 0.4, earlyDeaths: 0 }))!.style).toBe("safe");
    expect(playstyle(many(10, { killParticipation: 0.5, earlyDeaths: 1 }))!.style).toBe("balanced");
    expect(playstyle(many(10, { killParticipation: 0.7, earlyDeaths: 2 }))!.why).toMatch(/70% kill participation and 2\.0 deaths/);
  });
  it("junglers and supports need more fights to count as aggressive", () => {
    expect(playstyle(many(10, { role: "UTILITY", killParticipation: 0.6, earlyDeaths: 1 }))!.style).toBe("balanced");
  });
});

describe("style note on a close call", () => {
  const safe = { style: "safe" as const, why: "", games: 10 };
  const aggressive = { style: "aggressive" as const, why: "", games: 10 };
  it("points at the option nearer to how the player plays, without changing the pick", () => {
    const first = { name: "Luden's Companion", defense: 0 };
    const alt = { name: "Zhonya's Hourglass", defense: 50 };
    expect(styleNote(safe, first, alt)).toMatch(/^Both are valid here; Zhonya's Hourglass keeps you alive longer/);
    expect(styleNote(aggressive, first, alt)).toMatch(/Luden's Companion puts more into damage/);
  });
  it("stays silent without a style, a close call, or a difference", () => {
    expect(styleNote(null, { name: "A", defense: 0 }, { name: "B", defense: 1 })).toBeNull();
    expect(styleNote(safe, { name: "A", defense: 0 }, null)).toBeNull();
    expect(styleNote({ ...safe, style: "balanced" }, { name: "A", defense: 0 }, { name: "B", defense: 1 })).toBeNull();
    expect(styleNote(safe, { name: "A", defense: 1 }, { name: "B", defense: 1 })).toBeNull();
  });
});
