import type { RawTimeline } from "./raw.js";

/**
 * Per-player facts read from a match-v5 timeline: skill order, purchases and
 * lane stats at a given minute. Each helper returns null when the timeline
 * doesn't carry the data, so callers never mistake "missing" for "zero".
 */

type Event = RawTimeline["info"]["frames"][number]["events"][number];

function events(timeline: RawTimeline): Event[] {
  return timeline.info.frames.flatMap((f) => f.events);
}

/** Ability slot: 1 = Q, 2 = W, 3 = E, 4 = R. */
export type SkillSlot = 1 | 2 | 3 | 4;

/**
 * Abilities in the order they were levelled. Riot has sent identical duplicate
 * SKILL_LEVEL_UP events since patch 15.17 (developer-relations #1100), so an event
 * with the same slot and timestamp as an earlier one is dropped. "EVOLVE" events
 * (Kha'Zix, Viktor…) are upgrades, not levels, and are skipped.
 */
export function skillOrderOf(timeline: RawTimeline, participantId: number): SkillSlot[] | null {
  const seen = new Set<string>();
  const order: SkillSlot[] = [];
  for (const e of events(timeline)) {
    if (e.type !== "SKILL_LEVEL_UP" || e["participantId"] !== participantId) continue;
    if (e["levelUpType"] !== undefined && e["levelUpType"] !== "NORMAL") continue;
    const slot = e["skillSlot"];
    if (slot !== 1 && slot !== 2 && slot !== 3 && slot !== 4) continue;
    const key = `${slot}@${e.timestamp}`;
    if (seen.has(key)) continue;
    seen.add(key);
    order.push(slot);
  }
  return order.length ? order.slice(0, 18) : null;
}

export interface Purchase {
  itemId: number;
  /** Seconds since the game started. */
  atSec: number;
}

/**
 * Items bought, in order, with undone purchases removed. An ITEM_UNDO with a
 * beforeId and no afterId reverts the latest purchase of that item.
 */
export function purchasesOf(timeline: RawTimeline, participantId: number): Purchase[] | null {
  const bought: Purchase[] = [];
  let any = false;
  for (const e of events(timeline)) {
    if (e["participantId"] !== participantId) continue;
    if (e.type === "ITEM_PURCHASED" && typeof e["itemId"] === "number") {
      any = true;
      bought.push({ itemId: e["itemId"], atSec: Math.round(e.timestamp / 1000) });
    } else if (e.type === "ITEM_UNDO" && typeof e["beforeId"] === "number" && !e["afterId"]) {
      const i = bought.map((p) => p.itemId).lastIndexOf(e["beforeId"]);
      if (i >= 0) bought.splice(i, 1);
    }
  }
  return any ? bought : null;
}

/** Deaths where the killer had no assisting champions. */
export function soloDeathsOf(timeline: RawTimeline, participantId: number): number {
  return events(timeline).filter((e) => {
    if (e.type !== "CHAMPION_KILL" || e["victimId"] !== participantId) return false;
    const killer = e["killerId"];
    const assists = (e["assistingParticipantIds"] as number[] | undefined) ?? [];
    return typeof killer === "number" && killer >= 1 && killer <= 10 && assists.length === 0;
  }).length;
}

/** Frame closest to a given minute, if the timeline reaches it. */
function frameAt(timeline: RawTimeline, minute: number) {
  return timeline.info.frames.find((f) => Math.round(f.timestamp / timeline.info.frameInterval) === minute);
}

/** Creep score (lane + jungle minions) difference, me − opponent, at a given minute. */
export function csDiffAt(timeline: RawTimeline, meId: number, oppId: number, minute: number): number | undefined {
  const frame = frameAt(timeline, minute);
  const a = frame?.participantFrames[String(meId)];
  const b = frame?.participantFrames[String(oppId)];
  return a && b ? a.minionsKilled + a.jungleMinionsKilled - (b.minionsKilled + b.jungleMinionsKilled) : undefined;
}

/** Purchases before this second are the starting items, not a back. */
export const FIRST_BACK_AFTER_SEC = 150;

/**
 * The first trip back to base: the first purchase after the starting items, with the gold the
 * player held at the last timeline frame before it (frames are one minute apart, so it is the
 * gold "in the minute before", a slight underestimate). Null without purchases or gold frames.
 */
export function firstBackOf(timeline: RawTimeline, participantId: number): { atSec: number; gold: number } | null {
  const buy = (purchasesOf(timeline, participantId) ?? []).find((p) => p.atSec >= FIRST_BACK_AFTER_SEC);
  if (!buy) return null;
  const frame = [...timeline.info.frames].reverse().find((f) => f.timestamp <= buy.atSec * 1000);
  const gold = frame?.participantFrames[String(participantId)]?.currentGold;
  return gold === undefined ? null : { atSec: buy.atSec, gold };
}
