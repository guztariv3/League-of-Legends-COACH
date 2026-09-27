import type { MatchAnalysis } from "@coach/analysis";

/**
 * PLAYER MEMORY AND STYLE (phase 5). What keeps happening in the player's own games, read from
 * their analyses each time (nothing is guessed, nothing is stored beyond the games): recurring
 * mistakes and strengths with this champion or in general, the tempo of their first back, and
 * how they tend to play. It personalises what the coach says; it never changes a correct call.
 */

export type MemoryScope = "champion" | "role" | "all";
export interface Pattern {
  id: "early-deaths" | "lead-lost" | "farm-behind" | "late-back" | "slow-item" | "lane-strong" | "safe-early" | "closes-leads";
  kind: "mistake" | "strength";
  scope: MemoryScope;
  /** One line, the conclusion. */
  text: string;
  /** The numbers behind it. */
  why: string;
  /** Games the pattern was measured on, and in how many it showed. */
  games: number;
  hits: number;
}

export type Style = "aggressive" | "balanced" | "safe";
export interface Playstyle {
  style: Style;
  /** What it rests on, with numbers. */
  why: string;
  games: number;
}

export interface MemoryInput {
  history: MatchAnalysis[];
  champion?: string | null;
  position?: string | null;
  /** The first item Master+ players finish with this champion and the average minute (phase 4). */
  reference?: { itemId: number; name: string; avgMinute: number } | null;
}

export interface PlayerMemory {
  /** Most relevant first: at most two mistakes and one strength. */
  patterns: Pattern[];
  style: Playstyle | null;
}

/** Games a pattern needs in its scope before it is said. */
export const MIN_PATTERN_GAMES = 5;
/** Games of the main role needed to describe a style. */
export const MIN_STYLE_GAMES = 10;
/** A mistake is recurring from this share of games. */
const RECURRING = 0.4;
/** Gold held before the first back from which a component could have been bought on an earlier trip. */
export const LATE_BACK_GOLD = 1500;
/** Minutes slower than Master+ on the same first item before it is worth saying. */
const SLOW_ITEM_MIN = 2;

const pct = (x: number) => `${Math.round(x * 100)}%`;
const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length);
function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}
const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;

export function playerMemory(input: MemoryInput): PlayerMemory {
  const sr = input.history.filter((a) => a.analyzable && a.mode === "summoners_rift");
  const onChamp = input.champion ? sr.filter((a) => a.championName === input.champion) : [];
  const onRole = input.position ? sr.filter((a) => a.role === input.position) : [];
  const champName = input.champion ?? "";

  /** The narrowest scope with enough games where the test can be read. */
  function scoped(test: (a: MatchAnalysis) => boolean | null, eligible: (a: MatchAnalysis) => boolean = () => true) {
    const scopes: [MemoryScope, MatchAnalysis[]][] = [["champion", onChamp], ["role", onRole], ["all", sr]];
    for (const [scope, games] of scopes) {
      const rows = games.filter(eligible).map((a) => ({ a, h: test(a) })).filter((r): r is { a: MatchAnalysis; h: boolean } => r.h !== null);
      if (rows.length >= MIN_PATTERN_GAMES) return { scope, rows, hits: rows.filter((r) => r.h).length };
    }
    return null;
  }
  /** " with Ahri", " as mid laner", or nothing when it is about all of the player's games. */
  const where = (scope: MemoryScope) =>
    scope === "champion" ? ` with ${champName}` : scope === "role" ? ` as ${roleName(input.position)}` : "";

  const mistakes: (Pattern & { rate: number })[] = [];
  const strengths: (Pattern & { rate: number })[] = [];

  // Dying twice before minute 14.
  const early = scoped((a) => (a.earlyDeaths === null ? null : a.earlyDeaths >= 2));
  if (early) {
    const rate = early.hits / early.rows.length;
    if (rate >= RECURRING) {
      mistakes.push({
        id: "early-deaths", kind: "mistake", scope: early.scope, rate, games: early.rows.length, hits: early.hits,
        text: `You often die twice before minute 14${where(early.scope)}`,
        why: `${early.hits} of your last ${early.rows.length} games${where(early.scope)}. Each early death costs gold, experience and your lane's pressure.`,
      });
    } else if (early.rows.length >= 10 && rate <= 0.1) {
      strengths.push({
        id: "safe-early", kind: "strength", scope: early.scope, rate: 1 - rate, games: early.rows.length, hits: early.rows.length - early.hits,
        text: `You rarely die early${where(early.scope)}`,
        why: `Two or more deaths before minute 14 in only ${early.hits} of ${early.rows.length} games.`,
      });
    }
  }

  // Games led at 15 (team gold +1,500) that were lost.
  const led = scoped((a) => !a.win, (a) => a.teamGoldDiff15 !== null && a.teamGoldDiff15 >= 1500);
  if (led) {
    const rate = led.hits / led.rows.length;
    const late = avg(led.rows.filter((r) => r.h).map((r) => r.a.deathsAfter15 ?? 0));
    if (rate >= RECURRING) {
      mistakes.push({
        id: "lead-lost", kind: "mistake", scope: led.scope, rate, games: led.rows.length, hits: led.hits,
        text: `Leads slip away after minute 15${where(led.scope)}`,
        why: `You lost ${led.hits} of ${led.rows.length} games where your team led by 1,500+ gold at 15, dying ${late.toFixed(1)} times after 15 in those losses. A lead is kept by taking objectives together, not by more fights.`,
      });
    } else if (rate <= 0.25) {
      strengths.push({
        id: "closes-leads", kind: "strength", scope: led.scope, rate: 1 - rate, games: led.rows.length, hits: led.rows.length - led.hits,
        text: `You close out games you lead${where(led.scope)}`,
        why: `You won ${led.rows.length - led.hits} of ${led.rows.length} games where your team led by 1,500+ gold at 15.`,
      });
    }
  }

  // Behind in farm at 15.
  const farm = scoped((a) => (a.csDiff15 === null ? null : a.csDiff15 <= -15));
  if (farm) {
    const rate = farm.hits / farm.rows.length;
    const d = median(farm.rows.map((r) => r.a.csDiff15!));
    if (rate >= RECURRING) {
      mistakes.push({
        id: "farm-behind", kind: "mistake", scope: farm.scope, rate, games: farm.rows.length, hits: farm.hits,
        text: `You fall behind in farm by minute 15${where(farm.scope)}`,
        why: `15+ creeps behind your lane opponent at 15 in ${farm.hits} of ${farm.rows.length} games (median ${Math.round(d)}).`,
      });
    }
  }

  // Lane: gold difference at 10.
  const lane = scoped((a) => (a.goldDiff10 === null ? null : a.goldDiff10 > 0));
  if (lane) {
    const gd = median(lane.rows.map((r) => r.a.goldDiff10!));
    if (gd >= 250 && lane.hits / lane.rows.length >= 0.6) {
      strengths.push({
        id: "lane-strong", kind: "strength", scope: lane.scope, rate: lane.hits / lane.rows.length, games: lane.rows.length, hits: lane.hits,
        text: `You usually win your lane early${where(lane.scope)}`,
        why: `Ahead in gold at 10 in ${lane.hits} of ${lane.rows.length} games (median +${Math.round(gd)}).`,
      });
    }
  }

  // Tempo of the first back.
  const back = scoped((a) => (a.firstBack === null ? null : a.firstBack.gold >= LATE_BACK_GOLD));
  if (back) {
    const rate = back.hits / back.rows.length;
    const withBack = back.rows.map((r) => r.a.firstBack!);
    if (rate >= RECURRING) {
      mistakes.push({
        id: "late-back", kind: "mistake", scope: back.scope, rate, games: back.rows.length, hits: back.hits,
        text: `Your first back comes late, with a lot of gold${where(back.scope)}`,
        why: `You held ${LATE_BACK_GOLD.toLocaleString("en-US")}+ gold the minute before your first back in ${back.hits} of ${back.rows.length} games (median ${Math.round(median(withBack.map((b) => b.gold))).toLocaleString("en-US")} gold at ${mmss(median(withBack.map((b) => b.atSec)))}). Gold in your pocket gives no stats: backing when you can buy a component turns it into power sooner.`,
      });
    }
  }

  // First item slower than Master+ players on the same item (needs phase 4 statistics).
  const ref = input.reference;
  if (ref && onChamp.length) {
    const times = onChamp.flatMap((a) => {
      const p = (a.purchases ?? []).find((x) => x.itemId === ref.itemId);
      return p ? [p.atSec / 60] : [];
    });
    if (times.length >= MIN_PATTERN_GAMES) {
      const mine = median(times);
      if (mine - ref.avgMinute >= SLOW_ITEM_MIN) {
        mistakes.push({
          id: "slow-item", kind: "mistake", scope: "champion", rate: 0.5 + (mine - ref.avgMinute) / 20, games: times.length, hits: times.length,
          text: `Your ${ref.name} comes ${Math.round(mine - ref.avgMinute)} minutes later than in Master+ games`,
          why: `Median minute ${mine.toFixed(1)} in your ${times.length} games with ${champName}, against ${ref.avgMinute.toFixed(1)} for Master+ players this patch. Farm, deaths and back timing all move it.`,
        });
      }
    }
  }

  mistakes.sort((a, b) => scopeRank(a.scope) - scopeRank(b.scope) || b.rate - a.rate);
  strengths.sort((a, b) => scopeRank(a.scope) - scopeRank(b.scope) || b.rate - a.rate);
  const strip = ({ rate: _r, ...p }: Pattern & { rate: number }): Pattern => p;
  return { patterns: [...mistakes.slice(0, 2), ...strengths.slice(0, 1)].map(strip), style: playstyle(onRole.length >= MIN_STYLE_GAMES ? onRole : sr) };
}

const scopeRank = (s: MemoryScope) => (s === "champion" ? 0 : s === "role" ? 1 : 2);
const ROLE_NAME: Record<string, string> = { TOP: "top laner", JUNGLE: "jungler", MIDDLE: "mid laner", BOTTOM: "bot laner", UTILITY: "support" };
const roleName = (p: string | null | undefined) => ROLE_NAME[p ?? ""] ?? "this role";

/**
 * How the player tends to play, from kill participation and deaths before 14 in their games
 * (supports and junglers join more fights by design, so their bar is higher). Only said with
 * enough games, always with the numbers.
 */
export function playstyle(games: MatchAnalysis[]): Playstyle | null {
  const rows = games.filter((a) => a.killParticipation !== null && a.earlyDeaths !== null);
  if (rows.length < MIN_STYLE_GAMES) return null;
  const roles = new Map<string, number>();
  for (const a of rows) roles.set(a.role, (roles.get(a.role) ?? 0) + 1);
  const main = [...roles].sort((a, b) => b[1] - a[1])[0]![0];
  const roaming = main === "JUNGLE" || main === "UTILITY";
  const kp = avg(rows.map((a) => a.killParticipation!));
  const ed = avg(rows.map((a) => a.earlyDeaths!));
  const numbers = `${pct(kp)} kill participation and ${ed.toFixed(1)} deaths before minute 14 on average (${rows.length} games)`;
  const high = roaming ? 0.65 : 0.55;
  const low = roaming ? 0.55 : 0.45;
  if (kp >= high && ed >= 1) return { style: "aggressive", games: rows.length, why: `You look for fights: ${numbers}.` };
  if (kp < low && ed <= 0.5) return { style: "safe", games: rows.length, why: `You play for a safe game: ${numbers}.` };
  return { style: "balanced", games: rows.length, why: `Neither especially aggressive nor especially safe: ${numbers}.` };
}

/**
 * On a close call between two items (phase 3), which one is nearer to how the player plays.
 * Only a note beside the recommendation: both options are valid, and nothing changes when the
 * call is not close. `defense` is how much the item protects (health and resistances).
 */
export function styleNote(
  style: Playstyle | null,
  first: { name: string; defense: number },
  alternative: { name: string; defense: number } | null,
): string | null {
  if (!style || !alternative || style.style === "balanced") return null;
  const safer = alternative.defense > first.defense ? alternative : first.defense > alternative.defense ? first : null;
  if (!safer) return null;
  const riskier = safer === first ? alternative : first;
  const pick = style.style === "safe" ? safer : riskier;
  const how = style.style === "safe" ? "you usually play for a safe game" : "you usually look for fights";
  const what = pick === safer ? "keeps you alive longer" : "puts more into damage";
  return `Both are valid here; ${pick.name} ${what}, which fits how you play (${how}).`;
}
