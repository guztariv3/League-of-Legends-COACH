import { describe, expect, it } from "vitest";
import { normalizeMatch } from "@coach/domain";
import { generateHistory } from "@coach/synthetic";
import { buildReview } from "./index.js";

const games = generateHistory({
  seed: 5, puuid: "me", gameName: "Me", tagLine: "T", platform: "euw1", count: 40, traits: { earlyDeathRisk: 0.8 },
}).filter((g) => g.timeline && g.match.info.gameMode === "CLASSIC" && !g.match.info.participants[0]!.gameEndedInEarlySurrender);

describe("match review", () => {
  const reviews = games.map((g) => buildReview(normalizeMatch(g.match), g.timeline!, "me")!);

  it("builds one frame per timeline frame, with positions for all players", () => {
    const r = reviews[0]!;
    expect(r.frames).toHaveLength(games[0]!.timeline!.info.frames.length);
    expect(r.frames[1]!.positions).toHaveLength(10);
    expect(r.participants.filter((p) => p.isMe)).toHaveLength(1);
  });

  it("keeps every kill event and marks my involvement consistently with the match totals", () => {
    games.forEach((g, i) => {
      const me = g.match.info.participants.find((p) => p.puuid === "me")!;
      const r = reviews[i]!;
      expect(r.events.filter((e) => e.myInvolvement === "victim")).toHaveLength(me.deaths);
      expect(r.events.filter((e) => e.myInvolvement === "killer" && e.type === "kill")).toHaveLength(me.kills);
    });
  });

  it("never labels an uncertain error as a fact, and caps its confidence", () => {
    for (const r of reviews) {
      for (const m of r.moments.filter((x) => x.category === "error" || x.category === "opportunity")) {
        expect(m.kind).toBe("hypothesis");
        expect(m.confidence).toBeLessThanOrEqual(0.7);
      }
    }
  });

  it("highlights at most 3 moments, never plain events, and at most 2 per category", () => {
    for (const r of reviews) {
      expect(r.highlights.length).toBeLessThanOrEqual(3);
      const hs = r.highlights.map((id) => r.moments.find((m) => m.id === id)!);
      expect(hs.every((m) => m.category !== "event")).toBe(true);
      for (const cat of ["error", "opportunity", "good"]) expect(hs.filter((m) => m.category === cat).length).toBeLessThanOrEqual(2);
    }
    expect(reviews.some((r) => r.highlights.length > 0)).toBe(true);
  });

  it("always states its limits", () => {
    expect(reviews[0]!.limits.length).toBeGreaterThanOrEqual(3);
  });

  it("returns null when the player is not in the match", () => {
    expect(buildReview(normalizeMatch(games[0]!.match), games[0]!.timeline!, "someone-else")).toBeNull();
  });
});
