import { describe, expect, it } from "vitest";
import { generateHistory } from "./generator.js";
import {
  classifyMode,
  durationSeconds,
  findParticipant,
  getPlatform,
  goldDiffAt,
  laneOpponent,
  normalizeMatch,
  patchFromVersion,
  platformFromMatchId,
  queueLabel,
} from "@coach/domain";

describe("regions", () => {
  it("maps platforms to regional routes", () => {
    expect(getPlatform("EUW1")?.matchRoute).toBe("europe");
    expect(getPlatform("kr")?.accountRoute).toBe("asia");
    expect(getPlatform("oc1")?.matchRoute).toBe("sea");
    expect(getPlatform("nope")).toBeUndefined();
    expect(platformFromMatchId("NA1_123")?.id).toBe("na1");
  });
});

describe("modes", () => {
  it("classifies by gameMode + mapId and refuses unknown modes", () => {
    expect(classifyMode("CLASSIC", 11)).toBe("summoners_rift");
    expect(classifyMode("ARAM", 12)).toBe("aram");
    expect(classifyMode("CHERRY", 30)).toBe("unsupported");
    expect(queueLabel(420, "summoners_rift")).toBe("Ranked Solo/Duo");
    expect(queueLabel(999, "aram")).toBe("ARAM");
  });
});

describe("normalize", () => {
  it("parses patch and duration units", () => {
    expect(patchFromVersion("15.3.651.1234")).toBe("15.3");
    expect(patchFromVersion("garbage")).toBe("unknown");
    const info = { gameDuration: 1800 } as Parameters<typeof durationSeconds>[0];
    expect(durationSeconds({ ...info, gameEndTimestamp: 1 })).toBe(1800);
    expect(durationSeconds({ ...info, gameDuration: 1_800_000 })).toBe(1800);
  });

  const [game] = generateHistory({
    seed: 7, puuid: "me", gameName: "Me", tagLine: "T", platform: "euw1", count: 1,
    scenarios: { normal: 1, stomp_win: 0, stomp_loss: 0, comeback: 0, throw: 0, remake: 0, aram: 0, missing_timeline: 0, unsupported_mode: 0 },
  });

  it("normalizes a synthetic Summoner's Rift game", () => {
    const m = normalizeMatch(game!.match);
    expect(m.mode).toBe("summoners_rift");
    expect(m.platform).toBe("euw1");
    expect(m.participants).toHaveLength(10);
    const me = findParticipant(m, "me")!;
    expect(me.role).toBe("MIDDLE");
    const opp = laneOpponent(m, me)!;
    expect(opp.teamId).not.toBe(me.teamId);
    expect(opp.role).toBe("MIDDLE");
    const diff = goldDiffAt(game!.timeline!, me.participantId, opp.participantId, 10);
    expect(typeof diff).toBe("number");
    expect(goldDiffAt(game!.timeline!, me.participantId, opp.participantId, 999)).toBeUndefined();
  });
});
