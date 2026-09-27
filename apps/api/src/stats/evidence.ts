import type { BuildRecommendation, SetupRecommendation } from "@coach/build";
import type { GameFacts } from "@coach/knowledge";
import type { ChampionStats, StatOption } from "./store.js";

/**
 * Phase 4: what Master+ players do with a champion this patch, as evidence next to the coach's
 * own recommendation. It never replaces it: popularity and win rate don't know this game's
 * enemies, so every figure carries its sample, the patch it comes from, and when the coach
 * suggests something else, a line saying so and why.
 */

type Share = { games: number; share: number; winRate: number };
export interface StatsEvidence {
  patch: string;
  /** "current" = the patch the game data is on; "previous" = too few games yet on the current one. */
  patchLabel: "current" | "previous";
  position: string;
  games: number;
  firstItem: ({ id: number; name: string; avgMinute: number | null } & Share) | null;
  core: ({ items: { id: number; name: string }[] } & Share) | null;
  keystone: ({ id: number; name: string; secondaryTree: string | null } & Share) | null;
  spells: ({ names: string[] } & Share) | null;
  /** Most common order the basic abilities are maxed, and the most common first nine level-ups (1–4 = Q–R). */
  skills: ({ max: ("Q" | "W" | "E")[]; sequence: number[] | null } & Share) | null;
  /** Games against the lane opponent (both win rates are from the champion's side). */
  matchup: { opponent: string; games: number; winRate: number } | null;
  /** How the coach's picks compare with the common ones; informative, never an order. */
  notes: string[];
}

/** Lower-cases a reason's first word after a colon when it is an ordinary word, never a name ("Zed"). */
const lower = (t: string) => (/^(It|Its|Gives|Against|Your|The|This|Fits|No|Every|Each|Hitting|Bonus)\b/.test(t) ? t[0]!.toLowerCase() + t.slice(1) : t);
const pct = (x: number) => `${Math.round(x * 100)}%`;
const top = (xs: StatOption[] | undefined) => xs?.[0] ?? null;
const share = (o: StatOption): Share => ({ games: o.games, share: o.share, winRate: o.winRate });

export function statsEvidence(
  stats: ChampionStats,
  facts: GameFacts,
  coach: { build: BuildRecommendation | null; setup: SetupRecommendation | null; opponent?: string },
): StatsEvidence {
  const items = new Map(facts.items.map((i) => [i.id, i.name]));
  const runes = new Map(facts.runes.runes.map((r) => [r.id, r.name]));
  const trees = new Map(facts.runes.trees.map((t) => [t.id, t.name]));
  const spells = new Map(facts.spells.map((s) => [s.key, s.name]));
  const k = stats.byKind;

  const f = top(k.first_item);
  const firstItem = f && items.has(Number(f.key)) ? { id: Number(f.key), name: items.get(Number(f.key))!, avgMinute: f.avgMinute, ...share(f) } : null;
  const c = top(k.core);
  const coreIds = c ? c.key.split(">").map(Number) : [];
  const core = c && coreIds.every((id) => items.has(id)) ? { items: coreIds.map((id) => ({ id, name: items.get(id)! })), ...share(c) } : null;
  const ks = top(k.keystone);
  const [ksId, secId] = ks ? ks.key.split(":").map((x) => (x ? Number(x) : null)) : [];
  const keystone = ks && ksId && runes.has(ksId) ? { id: ksId, name: runes.get(ksId)!, secondaryTree: (secId && trees.get(secId)) || null, ...share(ks) } : null;
  const sp = top(k.spells);
  const spellNames = sp ? sp.key.split("+").map((x) => spells.get(Number(x))) : [];
  const spellPair = sp && spellNames.every((n) => n) ? { names: spellNames as string[], ...share(sp) } : null;
  const mx = top(k.skill_max);
  const sq = top(k.skill_seq);
  const skills = mx ? { max: mx.key.split(">") as ("Q" | "W" | "E")[], sequence: sq ? sq.key.split(",").map(Number) : null, ...share(mx) } : null;
  const mu = coach.opponent ? k.matchup?.find((o) => o.key === coach.opponent) : undefined;
  const matchup = mu && coach.opponent ? { opponent: coach.opponent, games: mu.games, winRate: mu.winRate } : null;

  const notes: string[] = [];
  const b = coach.build;
  if (firstItem && b?.first) {
    if (b.first.id === firstItem.id) {
      notes.push(`The coach's first item, ${firstItem.name}, is also the one Master+ players finish first most often (${pct(firstItem.share)} of ${stats.games} games).`);
    } else {
      // The engine's reasons go from generic to specific: the last one is about this game.
      const why = b.first.why.at(-1);
      notes.push(`Master+ players finish ${firstItem.name} first most often (${pct(firstItem.share)}); the coach suggests ${b.first.name} for this game${why ? `: ${lower(why).replace(/\.$/, "")}` : ""}.`);
    }
  }
  const myKs = coach.setup?.runes?.keystone;
  if (keystone && myKs && myKs.id !== keystone.id) {
    notes.push(`${keystone.name} is the most common keystone (${pct(keystone.share)}); the coach suggests ${myKs.name}: ${lower(myKs.why).replace(/\.$/, "")}.`);
  }
  if (matchup) {
    notes.push(`Against ${matchup.opponent}: ${pct(matchup.winRate)} win rate in ${matchup.games} Master+ games. A win rate describes the matchup; it doesn't decide your build.`);
  }
  return { patch: stats.patch, patchLabel: stats.patchLabel, position: stats.position, games: stats.games, firstItem, core, keystone, spells: spellPair, skills, matchup, notes };
}
