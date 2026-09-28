import { analyzeMatch } from "@coach/analysis";
import { normalizeMatch, type RawMatch, type RawTimeline, type SkillSlot } from "@coach/domain";

/**
 * Phase 4: turns one ranked game into counters per champion and position. Nothing about the
 * players is kept; only what each champion did (items and when, skills, runes, spells, lane
 * opponent) and whether it won. The coach uses these as evidence, never as the decision.
 */

export const SOLO_QUEUE = 420;
export const POSITIONS = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"] as const;

export type StatKind =
  | "rune_page" // primaryTree>secondaryTree>six perks>three shards
  | "matchup_rune_page"
  | "matchup_spells"
  | "games"      // key "": every game of the champion in that position
  | "first_item" // key item id: the first completed item, with the minute it was completed
  | "core"       // key "id>id>id": the first three completed items in order
  | "skill_max"  // key "Q>W>E": the order the basic abilities reached their last rank
  | "skill_seq"  // key "1,2,3,…": the first 9 level-ups (slots 1–4)
  | "keystone"   // key "keystoneId:secondaryStyleId"
  | "spells"     // key "4+14" (sorted summoner spell ids)
  | "matchup_first_item" // key "opponent|item": first completed item in this lane matchup
  | "matchup_core" // key "opponent|id>id>id": completed core in this lane matchup
  | "matchup";   // key lane opponent's champion

export interface StatRow { champion: string; position: string; kind: StatKind; key: string; win: boolean; minute: number | null }

const SLOT = { 1: "Q", 2: "W", 3: "E" } as const;

/** The order the basic abilities (Q, W, E) reached 5 ranks; null when fewer than two did. */
export function maxOrder(order: SkillSlot[]): string | null {
  const n: Record<number, number> = { 1: 0, 2: 0, 3: 0 };
  const reached: (1 | 2 | 3)[] = [];
  for (const s of order) {
    if (s === 4) continue;
    n[s] = (n[s] ?? 0) + 1;
    if (n[s] === 5) reached.push(s);
  }
  if (reached.length < 2) return null;
  const third = ([1, 2, 3] as const).find((x) => !reached.includes(x));
  return [...reached.slice(0, 2), ...(third && reached.length === 2 ? [third] : reached.slice(2))].map((s) => SLOT[s]).join(">");
}

/**
 * Counters for every player of a solo-queue game on Summoner's Rift. `completed` is the set of
 * finished item ids for the game's patch (from the patch data), so components are not counted.
 */
export function statRows(raw: RawMatch, timeline: RawTimeline | null, completed: Set<number>): { patch: string; rows: StatRow[] } {
  const match = normalizeMatch(raw);
  const rows: StatRow[] = [];
  if (match.queueId !== SOLO_QUEUE || match.mode !== "summoners_rift" || match.remake) return { patch: match.patch, rows };
  for (const p of match.participants) {
    const a = analyzeMatch(match, timeline, p.puuid);
    if (!a || !a.analyzable || !(POSITIONS as readonly string[]).includes(a.role)) continue;
    const base = { champion: a.championName, position: a.role, win: a.win };
    rows.push({ ...base, kind: "games", key: "", minute: null });
    if (a.purchases) {
      const done: { id: number; min: number }[] = [];
      for (const b of a.purchases) if (completed.has(b.itemId) && !done.some((d) => d.id === b.itemId)) done.push({ id: b.itemId, min: b.atSec / 60 });
      if (done[0]) rows.push({ ...base, kind: "first_item", key: String(done[0].id), minute: done[0].min });
      if (a.laneOpponentChampion && done[0]) rows.push({...base,kind:"matchup_first_item",key:`${a.laneOpponentChampion}|${done[0].id}`,minute:done[0].min});
      if (a.laneOpponentChampion && done.length>=3) rows.push({...base,kind:"matchup_core",key:`${a.laneOpponentChampion}|${done.slice(0,3).map(d=>d.id).join(">")}`,minute:done[2]!.min});
      if (done.length >= 3) rows.push({ ...base, kind: "core", key: done.slice(0, 3).map((d) => d.id).join(">"), minute: done[2]!.min });
    }
    if (a.skillOrder) {
      const m = maxOrder(a.skillOrder);
      if (m) rows.push({ ...base, kind: "skill_max", key: m, minute: null });
      if (a.skillOrder.length >= 9) rows.push({ ...base, kind: "skill_seq", key: a.skillOrder.slice(0, 9).join(","), minute: null });
    }
    // Store actual full pages, preserving row order and all three shards.
    if (p.runes.primary && p.runes.secondary && p.perks.length === 6 && p.shards.length === 3) {
      const key = [p.runes.primary, p.runes.secondary, ...p.perks, ...p.shards].join(">");
      rows.push({ ...base, kind: "rune_page", key, minute: null });
      if (a.laneOpponentChampion) rows.push({ ...base, kind: "matchup_rune_page", key: `${a.laneOpponentChampion}|${key}`, minute: null });
    }
    if (a.laneOpponentChampion && a.spells.length === 2) rows.push({ ...base, kind: "matchup_spells", key: `${a.laneOpponentChampion}|${[...a.spells].sort((x,y)=>x-y).join("+")}`, minute: null });
    if (a.runes.keystone !== null) rows.push({ ...base, kind: "keystone", key: `${a.runes.keystone}:${a.runes.secondary ?? ""}`, minute: null });
    if (a.spells.length === 2) rows.push({ ...base, kind: "spells", key: [...a.spells].sort((x, y) => x - y).join("+"), minute: null });
    if (a.laneOpponentChampion) rows.push({ ...base, kind: "matchup", key: a.laneOpponentChampion, minute: null });
  }
  return { patch: match.patch, rows };
}
