import { describe, expect, it } from "vitest";
import { analyzeMatch, type MatchAnalysis } from "@coach/analysis";
import { normalizeMatch, type NormalizedMatch, type RawTimeline } from "@coach/domain";
import { parseCatalog } from "@coach/itemization";
import { buildReview } from "@coach/review";
import { generateHistory } from "@coach/synthetic";
import { championJson, itemJson } from "../../itemization/src/test-fixture.js";
import { coachReview } from "./index.js";

const games = generateHistory({ seed: 11, puuid: "me", gameName: "Me", tagLine: "T", platform: "euw1", count: 60 });
const analyses = games.map((g) => analyzeMatch(normalizeMatch(g.match), g.timeline, "me")).filter((a): a is MatchAnalysis => a !== null);
const withTimeline = games.findIndex((g, i) => g.timeline && analyses[i]?.analyzable && analyses[i]?.mode === "summoners_rift");

describe("coach review", () => {
  const g = games[withTimeline]!;
  const game = analyses[withTimeline]!;
  const match = normalizeMatch(g.match);
  const review = buildReview(match, g.timeline!, "me");
  const r = coachReview({ game, history: analyses, review, match, timeline: g.timeline });

  it("always has the eight sections, in order, and every decision says why", () => {
    expect(r.sections.map((s) => s.id)).toEqual(["went_well", "hurt", "biggest_mistake", "missed_opportunity", "build", "skills", "macro", "focus"]);
    for (const s of r.sections) {
      expect(s.decisions.length > 0 || typeof s.empty === "string").toBe(true);
      for (const d of s.decisions) expect(d.reasons.length).toBeGreaterThan(0);
    }
    expect(r.baseline.games).toBeGreaterThanOrEqual(5);
  });

  it("compares with the player's own range, with the sample size, and never with other players", () => {
    for (const d of [...r.sections[0]!.decisions, ...r.sections[1]!.decisions]) {
      if (!d.id.includes(":well:") && !d.id.includes(":hurt:")) continue;
      const usual = d.evidence.find((e) => e.label === "Your usual range")!;
      expect(usual.source).toBe("your_games");
      expect(usual.sampleSize).toBeGreaterThanOrEqual(5);
    }
    expect(JSON.stringify(r)).not.toMatch(/global_stats/);
  });

  it("says why the build section is empty without item data, instead of guessing", () => {
    const build = r.sections.find((s) => s.id === "build")!;
    expect(build.decisions).toHaveLength(0);
    expect(build.empty).toMatch(/Item data/);
  });

  it("reports objectives as facts and R timing from the level-ups", () => {
    const macro = r.sections.find((s) => s.id === "macro")!;
    expect(macro.decisions[0]!.basis).toBe("fact");
    expect(macro.decisions[0]!.headline).toMatch(/Epic monsters: your team \d+, enemy \d+/);
    const late = coachReview({ game: { ...game, skillOrder: [1, 2, 3, 1, 1, 1, 4, 1, 2, 2, 4, 2] }, history: analyses, review: null });
    const skills = late.sections.find((s) => s.id === "skills")!;
    expect(skills.decisions.some((d) => /R learned late: level 7 instead of 6/.test(d.headline))).toBe(true);
  });

  it("with too few comparable games, says so instead of calling anything usual", () => {
    const few = coachReview({ game, history: analyses.slice(0, 2), review: null });
    expect(few.sections[1]!.empty).toMatch(/at least 5 comparable games/);
    expect(few.sections[2]!.empty).toMatch(/timeline/);
  });
});

describe("build decision", () => {
  const catalog = parseCatalog(itemJson, championJson);
  const cast = ["Ahri", "Brannoc", "Oshra", "Sylvaine", "Harrow", "Syndra", "Brand", "Lux", "Malphite", "Jinx"];
  const match = {
    matchId: "T_1", mode: "summoners_rift",
    participants: cast.map((championName, i) => ({ participantId: i + 1, puuid: i === 0 ? "me" : `p${i}`, teamId: i < 5 ? 100 : 200, championName })),
  } as unknown as NormalizedMatch;
  const kill = (t: number, killerId: number, victimId: number) => ({ type: "CHAMPION_KILL", timestamp: t, killerId, victimId });
  const buy = (t: number, participantId: number, itemId: number) => ({ type: "ITEM_PURCHASED", timestamp: t, participantId, itemId });
  const events = [
    ...[1, 2, 3, 4, 5, 6].map((n) => kill(n * 60_000, 6, 2)), // Syndra 6 kills
    ...[1, 2, 3, 4].map((n) => kill(n * 61_000, 7, 3)), // Brand 4 kills
    buy(500_000, 6, 3089), buy(510_000, 7, 6655),
    buy(700_000, 1, 6655), // my first item
    buy(1_200_000, 1, 3031), // my second: an attack-damage item on a mage, into a fed magic team
  ];
  const timeline = { info: { frameInterval: 60_000, frames: [{ timestamp: 0, participantFrames: {}, events }] } } as unknown as RawTimeline;
  const game = { ...analyzeMatchStub(), purchases: [{ itemId: 6655, atSec: 700 }, { itemId: 3031, atSec: 1200 }] };

  it("replays each completed item against the enemies at that moment, as an observation", () => {
    const r = coachReview({ game, history: [], review: null, match, timeline, catalog });
    const build = r.sections.find((s) => s.id === "build")!;
    expect(build.decisions).toHaveLength(2);
    const second = build.decisions[1]!;
    expect(second.basis).toBe("observation");
    expect(second.headline).toMatch(/20:00 Infinity Edge: the Coach would have looked at Banshee's Veil/);
    expect(second.reasons.join(" ")).toMatch(/not a verdict/);
    expect(second.evidence.find((e) => e.label === "Enemy damage")!.value).toMatch(/magic/);
  });
});

function analyzeMatchStub(): MatchAnalysis {
  return {
    ...analyses.find((a) => a.analyzable)!,
    matchId: "T_1", puuid: "me", championName: "Ahri", mode: "summoners_rift", skillOrder: null,
  };
}
