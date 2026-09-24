import { describe, expect, it } from "vitest";
import { RawMatch, RawTimeline } from "@coach/domain";
import { generateHistory, type GenerateOptions } from "./generator.js";

const base: GenerateOptions = {
  seed: 42,
  puuid: "me-puuid",
  gameName: "Tester",
  tagLine: "EUW",
  platform: "euw1",
  count: 50,
};

describe("synthetic generator", () => {
  const games = generateHistory(base);

  it("is deterministic for a given seed", () => {
    expect(JSON.stringify(generateHistory(base))).toBe(JSON.stringify(games));
    expect(JSON.stringify(generateHistory({ ...base, seed: 43 }))).not.toBe(JSON.stringify(games));
  });

  it("produces payloads that validate against the raw match-v5 schemas", () => {
    for (const g of games) {
      expect(RawMatch.safeParse(g.match).success).toBe(true);
      if (g.timeline) expect(RawTimeline.safeParse(g.timeline).success).toBe(true);
    }
  });

  it("is newest-first with unique match ids", () => {
    const ids = new Set(games.map((g) => g.match.metadata.matchId));
    expect(ids.size).toBe(games.length);
    for (let i = 1; i < games.length; i++) {
      expect(games[i - 1]!.match.info.gameCreation).toBeGreaterThan(games[i]!.match.info.gameCreation);
    }
  });

  it("keeps final kills/deaths consistent with timeline kill events", () => {
    for (const g of games.filter((x) => x.timeline)) {
      const events = g.timeline!.info.frames.flatMap((f) => f.events).filter((e) => e.type === "CHAMPION_KILL");
      for (const p of g.match.info.participants) {
        expect(events.filter((e) => e["killerId"] === p.participantId).length).toBe(p.kills);
        expect(events.filter((e) => e["victimId"] === p.participantId).length).toBe(p.deaths);
      }
    }
  });

  it("includes the player exactly once and exactly one winning team", () => {
    for (const g of games) {
      expect(g.match.info.participants.filter((p) => p.puuid === base.puuid)).toHaveLength(1);
      expect(g.match.info.teams.filter((t) => t.win)).toHaveLength(1);
    }
  });

  it("covers edge scenarios over a 50-game history", () => {
    const scenarios = new Set(games.map((g) => g.scenario));
    expect(scenarios.has("normal")).toBe(true);
    expect(scenarios.has("aram")).toBe(true);
  });
});
