import { describe, expect, it } from "vitest";
import { analyzeMatch, type MatchAnalysis } from "@coach/analysis";
import { normalizeMatch } from "@coach/domain";
import { generateHistory } from "@coach/synthetic";
import { challengeTitle, evaluateChallenge, suggestChallenges, type ChallengeSpec } from "./challenges.js";

const history = generateHistory({ seed: 41, puuid: "me", gameName: "Me", tagLine: "T", platform: "na1", count: 60 })
  .map((g) => analyzeMatch(normalizeMatch(g.match), g.timeline, "me")).filter((a): a is MatchAnalysis => a !== null);
const base = history.find((a) => a.analyzable && a.mode === "summoners_rift")!;
const game = (t: number, earlyDeaths: number | null, over: Partial<MatchAnalysis> = {}): MatchAnalysis => ({ ...base, matchId: `G${t}`, startedAt: t, earlyDeaths, ...over });
const spec = (kind: ChallengeSpec["kind"]): ChallengeSpec => ({ metric: "earlyDeaths", target: 1, kind });

describe("challenges", () => {
  it("3 of the next 5: completes at the third success and ignores older games", () => {
    const games = [game(5, 0), game(100, 0), game(110, 3), game(120, 1), game(130, 0), game(140, 5)];
    const p = evaluateChallenge(spec("next5"), games, 50, 1000);
    expect(p.results).toEqual([true, false, true, true, false]);
    expect(p.status).toBe("completed");
    expect(p.summary).toMatch(/Done: 3 of 5/);
  });

  it("fails as soon as 3 can no longer be reached, and games without the metric don't count", () => {
    const games = [game(100, 4), game(110, null), game(120, 3), game(130, 2)];
    const p = evaluateChallenge(spec("next5"), games, 50, 1000);
    expect(p.played).toBe(3);
    expect(p.status).toBe("failed");
  });

  it("in progress says how many are left", () => {
    const p = evaluateChallenge(spec("next5"), [game(100, 0)], 50, 1000);
    expect(p.status).toBe("in_progress");
    expect(p.summary).toBe("1 of 3 so far, 4 games left.");
  });

  it("weekly: counts games inside the 7 days and fails when the week ends short", () => {
    const day = 86_400_000;
    const games = [game(day, 0), game(2 * day, 0), game(9 * day, 0)];
    expect(evaluateChallenge(spec("week"), games, 0, 3 * day).status).toBe("in_progress");
    const ended = evaluateChallenge(spec("week"), games, 0, 8 * day);
    expect(ended.status).toBe("failed");
    expect(ended.met).toBe(2);
  });

  it("suggests reachable targets from the player's recent games, focus first, skipping excluded metrics", () => {
    const s = suggestChallenges(history, { focus: "visionPerMin", exclude: ["csPerMin"] });
    expect(s.length).toBeGreaterThan(0);
    expect(s.length).toBeLessThanOrEqual(3);
    expect(s.map((x) => x.metric)).not.toContain("csPerMin");
    if (s.some((x) => x.metric === "visionPerMin")) expect(s[0]!.metric).toBe("visionPerMin");
    for (const x of s) {
      expect(x.recent.met / x.recent.n).toBeGreaterThanOrEqual(0.2);
      expect(x.recent.met / x.recent.n).toBeLessThanOrEqual(0.75);
    }
    expect(challengeTitle({ metric: "earlyDeaths", target: 1, kind: "next5" })).toBe("Deaths before minute 14: at most 1 death, in 3 of your next 5 games");
  });
});
