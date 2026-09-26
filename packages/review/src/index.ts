import type { NormalizedMatch, RawTimeline, Role } from "@coach/domain";

/**
 * Match Review (the "Replay", decision D-05): a reconstruction built only from
 * the match-v5 timeline. Positions are one snapshot per minute; events have
 * exact timestamps. Every key moment states its epistemic kind and
 * confidence. Intentions are never inferred, and correlation is never
 * presented as causation.
 */
export const REVIEW_VERSION = 1;

export type MomentCategory = "error" | "opportunity" | "good" | "event";
export type MomentKind = "fact" | "observation" | "hypothesis";

export interface ReviewParticipant {
  id: number;
  championName: string;
  teamId: number;
  role: Role;
  isMe: boolean;
  isAlly: boolean;
}

export interface ReviewFrame {
  minute: number;
  positions: { id: number; x: number; y: number }[];
  /** My team's total gold minus the enemy team's. */
  teamGoldDiff: number;
}

export interface ReviewEvent {
  /** Milliseconds since game start. */
  t: number;
  type: "kill" | "objective" | "structure";
  label: string;
  position: { x: number; y: number } | null;
  /** "ally" = my team did it, "enemy" = the enemy team did it. */
  side: "ally" | "enemy";
  myInvolvement: "killer" | "victim" | "assist" | null;
}

export interface KeyMoment {
  id: string;
  t: number;
  category: MomentCategory;
  kind: MomentKind;
  confidence: number;
  title: string;
  detail: string;
  evidence: { label: string; value: string }[];
  /** Change in team gold difference around the moment (my team's view). */
  goldSwing: number;
  position: { x: number; y: number } | null;
}

export interface MatchReview {
  version: number;
  matchId: string;
  me: number;
  durationSec: number;
  participants: ReviewParticipant[];
  frames: ReviewFrame[];
  events: ReviewEvent[];
  moments: KeyMoment[];
  /** Ids of the most educational moments, best first (max 3). */
  highlights: string[];
  /** What this reconstruction cannot tell (always shown to the player). */
  limits: string[];
}

export const REVIEW_LIMITS = [
  "Positions are one snapshot per minute: we do not know where anyone moved in between.",
  "With this data a bad decision cannot be told apart from bad execution.",
  "We do not know what information each player had at each moment, or what they intended.",
];

const MAP_MAX = 15000;
/** Distance (map units) beyond which the nearest ally is considered far. Product heuristic. */
export const ISOLATION_DISTANCE = 4000;
/** Window after a moment in which a follow-up objective is linked to it. */
const FOLLOW_UP_MS = 90_000;

const fmtTime = (t: number) => `${Math.floor(t / 60_000)}:${String(Math.floor((t % 60_000) / 1000)).padStart(2, "0")}`;
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

function num(e: Record<string, unknown>, k: string): number | undefined {
  const v = e[k];
  return typeof v === "number" ? v : undefined;
}

function pos(e: Record<string, unknown>): { x: number; y: number } | null {
  const p = e["position"] as { x?: unknown; y?: unknown } | undefined;
  return p && typeof p.x === "number" && typeof p.y === "number"
    ? { x: Math.max(0, Math.min(MAP_MAX, p.x)), y: Math.max(0, Math.min(MAP_MAX, p.y)) }
    : null;
}

const MONSTER_LABEL: Record<string, string> = {
  DRAGON: "Dragon",
  BARON_NASHOR: "Baron Nashor",
  RIFTHERALD: "Rift Herald",
  HORDE: "Voidgrubs",
  ATAKHAN: "Atakhan",
};

export function buildReview(match: NormalizedMatch, timeline: RawTimeline, puuid: string): MatchReview | null {
  const me = match.participants.find((p) => p.puuid === puuid);
  if (!me) return null;
  const myTeam = me.teamId;
  const byId = new Map(match.participants.map((p) => [p.participantId, p]));
  const name = (id: number | undefined) => (id !== undefined ? byId.get(id)?.championName ?? `#${id}` : "—");
  const interval = timeline.info.frameInterval || 60_000;

  const participants: ReviewParticipant[] = match.participants.map((p) => ({
    id: p.participantId,
    championName: p.championName,
    teamId: p.teamId,
    role: p.role,
    isMe: p.participantId === me.participantId,
    isAlly: p.teamId === myTeam,
  }));

  const frames: ReviewFrame[] = timeline.info.frames.map((f) => {
    let diff = 0;
    const positions: ReviewFrame["positions"] = [];
    for (const [key, pf] of Object.entries(f.participantFrames)) {
      const id = pf.participantId ?? Number(key);
      const p = byId.get(id);
      if (!p) continue;
      diff += p.teamId === myTeam ? pf.totalGold : -pf.totalGold;
      if (pf.position) positions.push({ id, x: pf.position.x, y: pf.position.y });
    }
    return { minute: Math.round(f.timestamp / interval), positions, teamGoldDiff: diff };
  });

  const diffAt = (t: number) => {
    const m = Math.max(0, Math.min(frames.length - 1, Math.round(t / interval)));
    return frames[m]?.teamGoldDiff ?? 0;
  };
  /** Gold swing from the frame before t to two frames after it (clamped to the game). */
  const swingAround = (t: number) => {
    const before = frames[Math.max(0, Math.floor(t / interval))]?.teamGoldDiff ?? 0;
    return diffAt(t + 2 * interval) - before;
  };

  // ---------------------------------------------------------------- events
  const events: ReviewEvent[] = [];
  const raw = timeline.info.frames.flatMap((f) => f.events).sort((a, b) => a.timestamp - b.timestamp);
  for (const e of raw) {
    if (e.type === "CHAMPION_KILL") {
      const killer = num(e, "killerId");
      const victim = num(e, "victimId");
      const assists = (e["assistingParticipantIds"] as number[] | undefined) ?? [];
      const victimP = victim !== undefined ? byId.get(victim) : undefined;
      if (!victimP) continue;
      events.push({
        t: e.timestamp,
        type: "kill",
        label: killer && byId.get(killer) ? `${name(killer)} kills ${name(victim)}` : `${name(victim)} dies`,
        position: pos(e),
        side: victimP.teamId === myTeam ? "enemy" : "ally",
        myInvolvement:
          killer === me.participantId ? "killer" : victim === me.participantId ? "victim" : assists.includes(me.participantId) ? "assist" : null,
      });
    } else if (e.type === "ELITE_MONSTER_KILL") {
      const team = num(e, "killerTeamId") ?? byId.get(num(e, "killerId") ?? -1)?.teamId;
      if (team === undefined) continue;
      const monster = String(e["monsterType"] ?? "");
      events.push({
        t: e.timestamp,
        type: "objective",
        label: `${team === myTeam ? "Your team" : "The enemy"} takes ${MONSTER_LABEL[monster] ?? "an objective"}`,
        position: pos(e),
        side: team === myTeam ? "ally" : "enemy",
        myInvolvement: num(e, "killerId") === me.participantId ? "killer" : null,
      });
    } else if (e.type === "BUILDING_KILL") {
      // In match-v5, BUILDING_KILL.teamId is the team that *lost* the building.
      const lost = num(e, "teamId");
      if (lost === undefined) continue;
      const ally = lost !== myTeam;
      events.push({
        t: e.timestamp,
        type: "structure",
        label: ally ? "Your team destroys a structure" : "The enemy destroys one of your structures",
        position: pos(e),
        side: ally ? "ally" : "enemy",
        myInvolvement: num(e, "killerId") === me.participantId ? "killer" : null,
      });
    }
  }

  // ---------------------------------------------------------------- key moments
  const moments: KeyMoment[] = [];
  const objectivesAfter = (t: number, side: "ally" | "enemy") =>
    events.filter((ev) => ev.t > t && ev.t <= t + FOLLOW_UP_MS && ev.side === side && ev.type !== "kill");

  for (const ev of events.filter((x) => x.myInvolvement === "victim")) {
    const frameBefore = frames[Math.max(0, Math.floor(ev.t / interval))];
    const allyPositions = frameBefore?.positions.filter((p) => byId.get(p.id)?.teamId === myTeam && p.id !== me.participantId) ?? [];
    const nearest = ev.position && allyPositions.length ? Math.min(...allyPositions.map((p) => dist(p, ev.position!))) : null;
    const lost = objectivesAfter(ev.t, "enemy");
    const isolated = nearest !== null && nearest > ISOLATION_DISTANCE;
    const evidence = [
      { label: "Time", value: fmtTime(ev.t) },
      ...(nearest !== null ? [{ label: "Nearest ally (last snapshot)", value: `${Math.round(nearest)} units` }] : []),
      ...lost.map((o) => ({ label: "After", value: `${o.label} (${fmtTime(o.t)})` })),
    ];
    const swing = swingAround(ev.t);
    if (isolated || lost.length) {
      moments.push({
        id: `death-${ev.t}`,
        t: ev.t,
        category: "error",
        kind: "hypothesis",
        // Positions are up to a minute old, so isolation is only a hypothesis.
        confidence: isolated && lost.length ? 0.6 : 0.45,
        title: isolated ? `You died far from your team (${fmtTime(ev.t)})` : `After your death, the enemy took an objective (${fmtTime(ev.t)})`,
        detail:
          (isolated ? "In the last snapshot before you died, your nearest ally was far away. " : "") +
          (lost.length ? `In the next 90 s: ${lost.map((o) => o.label.toLowerCase()).join(", ")}. ` : "") +
          "This is a moment to review, not a conclusion: we do not know what information you had.",
        evidence,
        goldSwing: swing,
        position: ev.position,
      });
    } else {
      moments.push({
        id: `death-${ev.t}`,
        t: ev.t,
        category: "event",
        kind: "fact",
        confidence: 1,
        title: `Death (${fmtTime(ev.t)})`,
        detail: ev.label,
        evidence,
        goldSwing: swing,
        position: ev.position,
      });
    }
  }

  // Fights I took part in, converted into an objective by my team.
  for (const ev of events.filter((x) => x.type === "kill" && (x.myInvolvement === "killer" || x.myInvolvement === "assist"))) {
    const gained = objectivesAfter(ev.t, "ally");
    if (!gained.length || moments.some((m) => m.category === "good" && Math.abs(m.t - ev.t) < FOLLOW_UP_MS)) continue;
    moments.push({
      id: `convert-${ev.t}`,
      t: ev.t,
      category: "good",
      kind: "fact",
      confidence: 0.9,
      title: `You took part in a fight your team turned into an objective (${fmtTime(ev.t)})`,
      detail: `${ev.label}; then: ${gained.map((g) => g.label.toLowerCase()).join(", ")}.`,
      evidence: gained.map((g) => ({ label: "After", value: `${g.label} (${fmtTime(g.t)})` })),
      goldSwing: swingAround(ev.t),
      position: ev.position,
    });
  }

  // Won fights (2+ enemy deaths within 30 s) with no objective afterwards.
  const allyKills = events.filter((x) => x.type === "kill" && x.side === "ally");
  let lastFightEnd = -Infinity;
  for (let i = 0; i < allyKills.length; i++) {
    const start = allyKills[i]!;
    if (start.t <= lastFightEnd) continue;
    const fight = allyKills.filter((k) => k.t >= start.t && k.t <= start.t + 30_000);
    if (fight.length < 2) continue;
    const end = fight[fight.length - 1]!.t;
    lastFightEnd = end;
    const lostInFight = events.filter((x) => x.type === "kill" && x.side === "enemy" && x.t >= start.t && x.t <= end).length;
    if (fight.length <= lostInFight || objectivesAfter(end, "ally").length) continue;
    moments.push({
      id: `fight-${start.t}`,
      t: start.t,
      category: "opportunity",
      kind: "hypothesis",
      confidence: 0.5,
      title: `Won fight with no objective after (${fmtTime(start.t)})`,
      detail: `Your team killed ${fight.length} enemies (losing ${lostInFight}) and took no objective in the next 90 s. There may have been none available; check whether there was.`,
      evidence: [
        { label: "Enemies killed", value: String(fight.length) },
        { label: "Own losses", value: String(lostInFight) },
      ],
      goldSwing: swingAround(start.t),
      position: start.position,
    });
  }

  // Objectives and structures as context events.
  for (const ev of events.filter((x) => x.type !== "kill")) {
    moments.push({
      id: `obj-${ev.t}-${ev.side}`,
      t: ev.t,
      category: "event",
      kind: "fact",
      confidence: 1,
      title: `${ev.label} (${fmtTime(ev.t)})`,
      detail: ev.label,
      evidence: [],
      goldSwing: swingAround(ev.t),
      position: ev.position,
    });
  }

  moments.sort((a, b) => a.t - b.t);

  // Educational value: focus on the player, weigh by impact and confidence, prefer variety.
  const scored = moments
    .filter((m) => m.category !== "event")
    .map((m) => ({ m, score: (Math.abs(m.goldSwing) + 500) * m.confidence }))
    .sort((a, b) => b.score - a.score);
  const highlights: string[] = [];
  const perCategory = new Map<MomentCategory, number>();
  for (const { m } of scored) {
    if (highlights.length >= 3) break;
    if ((perCategory.get(m.category) ?? 0) >= 2) continue;
    highlights.push(m.id);
    perCategory.set(m.category, (perCategory.get(m.category) ?? 0) + 1);
  }

  return {
    version: REVIEW_VERSION,
    matchId: match.matchId,
    me: me.participantId,
    durationSec: match.durationSec,
    participants,
    frames,
    events,
    moments,
    highlights,
    limits: REVIEW_LIMITS,
  };
}
