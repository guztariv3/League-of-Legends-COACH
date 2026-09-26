import { describe, expect, it } from "vitest";
import { csDiffAt, normalizeMatch, purchasesOf, skillOrderOf, soloDeathsOf, type RawTimeline } from "@coach/domain";

function timelineWith(events: Record<string, unknown>[]): RawTimeline {
  return {
    metadata: { matchId: "NA1_1" },
    info: {
      frameInterval: 60_000,
      frames: [{ timestamp: 0, participantFrames: {}, events: events as RawTimeline["info"]["frames"][number]["events"] }],
    },
  };
}

describe("timeline facts", () => {
  it("reads the skill order, dropping Riot's duplicate and EVOLVE events", () => {
    const tl = timelineWith([
      { type: "SKILL_LEVEL_UP", timestamp: 1000, participantId: 3, skillSlot: 1, levelUpType: "NORMAL" },
      { type: "SKILL_LEVEL_UP", timestamp: 1000, participantId: 3, skillSlot: 1, levelUpType: "NORMAL" },
      { type: "SKILL_LEVEL_UP", timestamp: 2000, participantId: 3, skillSlot: 3, levelUpType: "NORMAL" },
      { type: "SKILL_LEVEL_UP", timestamp: 2500, participantId: 3, skillSlot: 4, levelUpType: "EVOLVE" },
      { type: "SKILL_LEVEL_UP", timestamp: 2600, participantId: 4, skillSlot: 2, levelUpType: "NORMAL" },
      { type: "SKILL_LEVEL_UP", timestamp: 3000, participantId: 3, skillSlot: 1, levelUpType: "NORMAL" },
    ]);
    expect(skillOrderOf(tl, 3)).toEqual([1, 3, 1]);
    expect(skillOrderOf(tl, 9)).toBeNull();
  });

  it("lists purchases with undone ones removed", () => {
    const tl = timelineWith([
      { type: "ITEM_PURCHASED", timestamp: 11_000, participantId: 2, itemId: 1055 },
      { type: "ITEM_PURCHASED", timestamp: 12_000, participantId: 2, itemId: 2003 },
      { type: "ITEM_UNDO", timestamp: 13_000, participantId: 2, beforeId: 2003, afterId: 0 },
      { type: "ITEM_PURCHASED", timestamp: 190_400, participantId: 2, itemId: 1036 },
      { type: "ITEM_PURCHASED", timestamp: 190_000, participantId: 5, itemId: 1001 },
    ]);
    expect(purchasesOf(tl, 2)).toEqual([{ itemId: 1055, atSec: 11 }, { itemId: 1036, atSec: 190 }]);
    expect(purchasesOf(tl, 7)).toBeNull();
  });

  it("counts solo deaths only when no enemy assisted", () => {
    const tl = timelineWith([
      { type: "CHAMPION_KILL", timestamp: 1, victimId: 1, killerId: 6, assistingParticipantIds: [] },
      { type: "CHAMPION_KILL", timestamp: 2, victimId: 1, killerId: 6 },
      { type: "CHAMPION_KILL", timestamp: 3, victimId: 1, killerId: 7, assistingParticipantIds: [8] },
      { type: "CHAMPION_KILL", timestamp: 4, victimId: 1, killerId: 0 },
    ]);
    expect(soloDeathsOf(tl, 1)).toBe(2);
  });

  it("computes the creep-score difference at a minute", () => {
    const tl: RawTimeline = {
      metadata: { matchId: "NA1_1" },
      info: {
        frameInterval: 60_000,
        frames: [{
          timestamp: 15 * 60_000,
          events: [],
          participantFrames: {
            "1": { participantId: 1, totalGold: 0, level: 1, xp: 0, minionsKilled: 120, jungleMinionsKilled: 4 },
            "6": { participantId: 6, totalGold: 0, level: 1, xp: 0, minionsKilled: 110, jungleMinionsKilled: 0 },
          },
        }],
      },
    };
    expect(csDiffAt(tl, 1, 6, 15)).toBe(14);
    expect(csDiffAt(tl, 1, 6, 10)).toBeUndefined();
  });
});

