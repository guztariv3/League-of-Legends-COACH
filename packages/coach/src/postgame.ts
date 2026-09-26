import type { MatchAnalysis } from "@coach/analysis";
import type { NormalizedMatch, NormalizedParticipant, RawTimeline } from "@coach/domain";

/**
 * Post-game achievements and the in-game ranking (F5b). Achievements are facts read from
 * the scoreboard and the timeline, each with the number behind it; nothing is awarded for
 * an interpretation. The ranking is a transparent summary of the scoreboard with a
 * published formula: it is not a measure of skill and never uses hidden data.
 */

// ------------------------------------------------------------------ ranking

export interface RankingComponent {
  id: "kp" | "deaths" | "damage" | "tanked" | "vision" | "cs";
  label: string;
  /** Weight in the score (sums to 1 for each player). */
  weight: number;
}

/** Base weights. For supports the CS weight moves to vision, since farming isn't their job. */
export const RANKING_COMPONENTS: RankingComponent[] = [
  { id: "kp", label: "Kill participation", weight: 0.25 },
  { id: "deaths", label: "Fewer deaths", weight: 0.2 },
  { id: "damage", label: "Share of team damage", weight: 0.2 },
  { id: "vision", label: "Vision score per minute", weight: 0.15 },
  { id: "tanked", label: "Share of team damage taken", weight: 0.1 },
  { id: "cs", label: "CS per minute", weight: 0.1 },
];

export const RANKING_EXPLANATION =
  "Each value is scaled from the lowest (0) to the highest (1) among the ten players, then weighted: " +
  RANKING_COMPONENTS.map((c) => `${c.label.toLowerCase()} ${Math.round(c.weight * 100)}%`).join(", ") +
  ". For supports the CS weight goes to vision. The score is out of 10. It summarizes the scoreboard; it doesn't measure decisions, and it ignores the result.";

export interface RankedPlayer {
  participantId: number;
  championName: string;
  teamId: number;
  /** 1 = best in the game. */
  rank: number;
  /** 0..10, one decimal. */
  score: number;
  /** Scaled 0..1 value per component, for "why". */
  parts: Record<RankingComponent["id"], number>;
}

function weightsFor(p: NormalizedParticipant): Record<RankingComponent["id"], number> {
  const w = Object.fromEntries(RANKING_COMPONENTS.map((c) => [c.id, c.weight])) as Record<RankingComponent["id"], number>;
  if (p.role === "UTILITY") { w.vision += w.cs; w.cs = 0; }
  return w;
}

/** Ranking of the ten players; null for games it isn't meant for (remakes, missing players). */
export function gameRanking(match: NormalizedMatch): RankedPlayer[] | null {
  if (match.remake || match.participants.length < 2) return null;
  const minutes = Math.max(1, match.durationSec / 60);
  const team = (id: number) => match.participants.filter((p) => p.teamId === id);
  const sum = (ps: NormalizedParticipant[], f: (p: NormalizedParticipant) => number) => ps.reduce((s, p) => s + f(p), 0);

  const raw = match.participants.map((p) => {
    const mates = team(p.teamId);
    const teamKills = sum(mates, (x) => x.kills);
    const teamDamage = sum(mates, (x) => x.damageToChampions);
    const teamTaken = sum(mates, (x) => x.damageTaken ?? 0);
    return {
      p,
      kp: teamKills ? (p.kills + p.assists) / teamKills : 0,
      deaths: -p.deaths,
      damage: teamDamage ? p.damageToChampions / teamDamage : 0,
      tanked: teamTaken ? (p.damageTaken ?? 0) / teamTaken : 0,
      vision: (p.visionScore ?? 0) / minutes,
      cs: p.cs / minutes,
    };
  });
  const scale = (k: RankingComponent["id"]) => {
    const xs = raw.map((r) => r[k]);
    const lo = Math.min(...xs), hi = Math.max(...xs);
    return (x: number) => (hi > lo ? (x - lo) / (hi - lo) : 0.5);
  };
  const scalers = Object.fromEntries(RANKING_COMPONENTS.map((c) => [c.id, scale(c.id)])) as Record<RankingComponent["id"], (x: number) => number>;

  const scored = raw.map((r) => {
    const parts = Object.fromEntries(RANKING_COMPONENTS.map((c) => [c.id, scalers[c.id](r[c.id])])) as RankedPlayer["parts"];
    const w = weightsFor(r.p);
    const score = RANKING_COMPONENTS.reduce((s, c) => s + parts[c.id] * w[c.id], 0) * 10;
    return { participantId: r.p.participantId, championName: r.p.championName, teamId: r.p.teamId, score: Math.round(score * 10) / 10, exact: score, parts };
  });
  return scored
    .sort((a, b) => b.exact - a.exact || a.participantId - b.participantId)
    .map(({ exact: _exact, ...s }, i) => ({ ...s, rank: i + 1 }));
}

// ------------------------------------------------------------------ achievements

export interface Achievement {
  id: string;
  title: string;
  /** The fact behind it. */
  detail: string;
  /** "game" = among all ten players, "personal" = against your own history, "moment" = something that happened. */
  scope: "game" | "personal" | "moment";
}

type Ev = RawTimeline["info"]["frames"][number]["events"][number];

const fmtTime = (ms: number) => `${Math.floor(ms / 60_000)}:${String(Math.floor((ms % 60_000) / 1000)).padStart(2, "0")}`;
const MULTI: Record<number, string> = { 2: "Double kill", 3: "Triple kill", 4: "Quadra kill", 5: "Penta kill" };
const MONSTER: Record<string, string> = { DRAGON: "a dragon", BARON_NASHOR: "Baron Nashor", RIFTHERALD: "the Rift Herald", ATAKHAN: "Atakhan", ELDER_DRAGON: "the Elder Dragon" };

export interface AchievementInput {
  match: NormalizedMatch;
  timeline: RawTimeline | null;
  puuid: string;
  /** This game's analysis and your other games, for personal bests. */
  game: MatchAnalysis;
  history: MatchAnalysis[];
}

/** Minimum games on the champion before "your best" means anything. */
export const MIN_GAMES_FOR_BEST = 5;

export function gameAchievements(input: AchievementInput): Achievement[] {
  const { match, timeline, puuid, game } = input;
  const me = match.participants.find((p) => p.puuid === puuid);
  if (!me || match.remake) return [];
  const out: Achievement[] = [];
  const minutes = Math.max(1, match.durationSec / 60);
  const others = match.participants.filter((p) => p !== me);
  const top = (f: (p: NormalizedParticipant) => number | null) => {
    const mine = f(me);
    return mine !== null && mine > 0 && others.every((p) => (f(p) ?? -Infinity) < mine);
  };

  // Among all ten players (strictly the highest).
  if (top((p) => p.damageToChampions)) out.push({ id: "most-damage", title: "Most damage in the game", detail: `${me.damageToChampions.toLocaleString("en-US")} damage to champions`, scope: "game" });
  if (top((p) => p.visionScore)) out.push({ id: "most-vision", title: "Highest vision score", detail: `Vision score ${me.visionScore}`, scope: "game" });
  if (match.mode === "summoners_rift" && me.role !== "UTILITY" && top((p) => p.cs)) out.push({ id: "most-cs", title: "Most CS in the game", detail: `${me.cs} CS (${(me.cs / minutes).toFixed(1)} per minute)`, scope: "game" });
  if (top((p) => p.kills)) out.push({ id: "most-kills", title: "Most kills in the game", detail: `${me.kills} kills`, scope: "game" });
  if (top((p) => p.damageTaken)) out.push({ id: "most-tanked", title: "Took the most damage", detail: `${(me.damageTaken ?? 0).toLocaleString("en-US")} damage taken`, scope: "game" });

  // Your own game.
  if (me.deaths === 0 && match.durationSec >= 15 * 60) out.push({ id: "deathless", title: "Deathless", detail: `0 deaths in ${Math.round(minutes)} minutes`, scope: "game" });
  if (game.killParticipation !== null && game.killParticipation >= 0.7 && me.kills + me.assists >= 5) {
    out.push({ id: "kp70", title: "Involved in most of your team's kills", detail: `${Math.round(game.killParticipation * 100)}% kill participation`, scope: "game" });
  }
  if (game.goldDiff15 !== null && game.goldDiff15 >= 1000 && game.laneOpponentChampion) {
    out.push({ id: "lane-lead", title: "Won the lane on gold", detail: `+${Math.round(game.goldDiff15).toLocaleString("en-US")} gold on ${game.laneOpponentChampion} at 15:00`, scope: "game" });
  }

  // From the timeline.
  if (timeline) {
    const events: Ev[] = timeline.info.frames.flatMap((f) => f.events).sort((a, b) => a.timestamp - b.timestamp);
    const kills = events.filter((e) => e.type === "CHAMPION_KILL");
    const first = kills[0];
    if (first && (first["killerId"] === me.participantId || (first["assistingParticipantIds"] as number[] | undefined)?.includes(me.participantId))) {
      out.push({ id: "first-blood", title: first["killerId"] === me.participantId ? "First blood" : "First blood assist", detail: `At ${fmtTime(first.timestamp)}`, scope: "moment" });
    }
    const solo = kills.filter((e) => e["killerId"] === me.participantId && !((e["assistingParticipantIds"] as number[] | undefined)?.length));
    if (solo.length) out.push({ id: "solo-kills", title: solo.length === 1 ? "Solo kill" : `${solo.length} solo kills`, detail: `No ally helped: ${solo.slice(0, 3).map((e) => fmtTime(e.timestamp)).join(", ")}`, scope: "moment" });
    const multi = events.filter((e) => e.type === "CHAMPION_SPECIAL_KILL" && e["killerId"] === me.participantId && e["killType"] === "KILL_MULTI")
      .map((e) => ({ n: Number(e["multiKillLength"]) || 0, t: e.timestamp })).sort((a, b) => b.n - a.n)[0];
    if (multi && MULTI[Math.min(5, multi.n)]) out.push({ id: `multikill-${multi.n}`, title: MULTI[Math.min(5, multi.n)]!, detail: `At ${fmtTime(multi.t)}`, scope: "moment" });
    for (const e of events.filter((x) => x.type === "ELITE_MONSTER_KILL" && x["killerId"] === me.participantId)) {
      const name = e["monsterSubType"] === "ELDER_DRAGON" ? MONSTER.ELDER_DRAGON : MONSTER[String(e["monsterType"])];
      if (!name) continue;
      out.push({ id: `secured-${e.timestamp}`, title: `Secured ${name}`, detail: `Last hit at ${fmtTime(e.timestamp)}`, scope: "moment" });
    }
  }

  // Personal bests on this champion (only with enough games to mean something).
  const same = input.history.filter((a) => a.analyzable && a.championName === game.championName && a.mode === game.mode && a.matchId !== game.matchId);
  if (same.length + 1 >= MIN_GAMES_FOR_BEST && game.analyzable) {
    const best = (label: string, id: string, f: (a: MatchAnalysis) => number | null, fmt: (x: number) => string) => {
      const v = f(game);
      if (v === null) return;
      const prev = same.map(f).filter((x): x is number => x !== null);
      if (prev.length + 1 >= MIN_GAMES_FOR_BEST && prev.every((x) => x < v)) {
        out.push({ id: `best-${id}`, title: `Your best ${label} on ${game.championName}`, detail: `${fmt(v)}, over ${prev.length + 1} games`, scope: "personal" });
      }
    };
    best("KDA", "kda", (a) => a.kda, (x) => x.toFixed(1));
    best("CS per minute", "cs", (a) => (a.role === "UTILITY" ? null : a.csPerMin), (x) => x.toFixed(1));
    best("damage per minute", "dpm", (a) => a.damagePerMin, (x) => Math.round(x).toLocaleString("en-US"));
  }
  return out;
}
