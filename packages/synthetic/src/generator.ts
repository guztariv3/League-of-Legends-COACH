import type { RawMatch, RawTimeline } from "@coach/domain";
import { SYNTHETIC_CHAMPIONS, SYNTHETIC_ITEMS, type SyntheticChampion } from "./catalog.js";

/**
 * Deterministic synthetic match generator that produces match-v5-shaped
 * payloads (match + timeline). Every stat is derived from a per-minute
 * simulation, so final totals stay consistent with timeline events.
 *
 * Bump SYNTHETIC_DATASET_VERSION whenever the output for a given seed changes.
 */
export const SYNTHETIC_DATASET_VERSION = "syn-1";

export type Scenario =
  | "normal"
  | "stomp_win"
  | "stomp_loss"
  | "comeback"
  | "throw"
  | "remake"
  | "aram"
  | "missing_timeline"
  | "unsupported_mode";

type LaneRole = "TOP" | "JUNGLE" | "MIDDLE" | "BOTTOM" | "UTILITY";
const LANE_ROLES: readonly LaneRole[] = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];

export interface PlayerTraits {
  mainRole: LaneRole;
  mainChampions: string[];
  /** Typical CS per minute for the player's role. */
  csPerMin: number;
  /** 0..1, how likely the player is to die before minute 14. */
  earlyDeathRisk: number;
}

export interface GenerateOptions {
  seed: number;
  puuid: string;
  gameName: string;
  tagLine: string;
  platform: string;
  count: number;
  traits?: Partial<PlayerTraits>;
  /** Scenarios cycled by weight; defaults to a realistic mix. */
  scenarios?: Partial<Record<Scenario, number>>;
  /** Epoch ms of the most recent game. */
  now?: number;
}

export interface SyntheticGame {
  scenario: Scenario;
  match: RawMatch;
  timeline: RawTimeline | null;
}

export const DEFAULT_SCENARIO_WEIGHTS: Record<Scenario, number> = {
  normal: 20,
  stomp_win: 4,
  stomp_loss: 4,
  comeback: 3,
  throw: 3,
  remake: 1,
  aram: 6,
  missing_timeline: 1,
  unsupported_mode: 1,
};

// ---------------------------------------------------------------- PRNG

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Rng {
  constructor(private readonly next: () => number) {}
  float(min = 0, max = 1) { return min + (max - min) * this.next(); }
  int(min: number, max: number) { return Math.floor(this.float(min, max + 1)); }
  chance(p: number) { return this.next() < p; }
  pick<T>(xs: readonly T[]): T {
    const x = xs[Math.floor(this.next() * xs.length)];
    if (x === undefined) throw new Error("pick from empty list");
    return x;
  }
  normal(mean: number, sd: number) {
    const u = Math.max(this.next(), 1e-9);
    const v = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  weighted<K extends string>(weights: Record<K, number>): K {
    const entries = Object.entries(weights) as [K, number][];
    const total = entries.reduce((s, [, w]) => s + w, 0);
    let r = this.next() * total;
    for (const [k, w] of entries) {
      r -= w;
      if (r <= 0) return k;
    }
    return entries[entries.length - 1]![0];
  }
}

// ---------------------------------------------------------------- simulation

interface SimPlayer {
  participantId: number;
  puuid: string;
  gameName: string;
  teamId: 100 | 200;
  role: LaneRole | null;
  champ: SyntheticChampion;
  csRate: number;
  gold: number;
  cs: number;
  kills: number;
  deaths: number;
  assists: number;
  items: number[];
  nextItemAt: number;
}

const ROLE_ANCHORS: Record<LaneRole, [number, number]> = {
  TOP: [2000, 12500],
  JUNGLE: [5000, 6500],
  MIDDLE: [7400, 7400],
  BOTTOM: [12500, 2200],
  UTILITY: [12000, 2600],
};

function advantageCurve(s: Scenario, t: number, rng: Rng, prev: number): number {
  // Advantage for the player's team, roughly in [-1, 1]; t is 0..1 progress.
  const drift = rng.normal(0, 0.08);
  switch (s) {
    case "stomp_win": return 0.2 + 0.7 * t + drift * 0.3;
    case "stomp_loss": return -0.2 - 0.7 * t + drift * 0.3;
    case "comeback": return t < 0.6 ? -0.5 * (t / 0.6) - 0.1 : -0.6 + 1.6 * ((t - 0.6) / 0.4);
    case "throw": return t < 0.6 ? 0.5 * (t / 0.6) + 0.1 : 0.6 - 1.6 * ((t - 0.6) / 0.4);
    default: return Math.max(-1, Math.min(1, prev + drift));
  }
}

function hashSeed(...parts: (string | number)[]): number {
  let h = 2166136261;
  for (const ch of parts.join("|")) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function generateGame(
  opts: GenerateOptions,
  traits: PlayerTraits,
  index: number,
  scenario: Scenario,
  startedAt: number,
): SyntheticGame {
  const rng = new Rng(mulberry32(hashSeed(opts.seed, opts.puuid, index)));
  const isAram = scenario === "aram";
  const isOther = scenario === "unsupported_mode";
  const lanes = !isAram && !isOther;

  const durationMin =
    scenario === "remake" ? rng.int(3, 4)
    : isAram ? rng.int(14, 22)
    : scenario.startsWith("stomp") ? rng.int(20, 26)
    : rng.int(24, 38);

  // Teams and champions
  const playerTeam: 100 | 200 = rng.chance(0.5) ? 100 : 200;
  const used = new Set<string>();
  const champFor = (role: LaneRole | null, preferred?: string[]): SyntheticChampion => {
    if (preferred && rng.chance(0.75)) {
      const options = SYNTHETIC_CHAMPIONS.filter((c) => preferred.includes(c.id) && !used.has(c.id));
      if (options.length) { const c = rng.pick(options); used.add(c.id); return c; }
    }
    let pool = SYNTHETIC_CHAMPIONS.filter((c) => !used.has(c.id) && (!role || c.roles.includes(role)));
    if (!pool.length) pool = SYNTHETIC_CHAMPIONS.filter((c) => !used.has(c.id));
    const c = rng.pick(pool);
    used.add(c.id);
    return c;
  };

  const players: SimPlayer[] = [];
  for (const teamId of [100, 200] as const) {
    LANE_ROLES.forEach((role, i) => {
      const participantId = (teamId === 100 ? 0 : 5) + i + 1;
      const isMe = teamId === playerTeam && role === traits.mainRole;
      const r = lanes ? role : null;
      const baseCs = role === "UTILITY" ? 1.2 : role === "JUNGLE" ? 5.5 : 6.8;
      players.push({
        participantId,
        puuid: isMe ? opts.puuid : `synthetic-puuid-${hashSeed(opts.seed, index, participantId).toString(16)}`,
        gameName: isMe ? opts.gameName : `Synth Player ${participantId}`,
        teamId,
        role: r,
        champ: champFor(r, isMe ? traits.mainChampions : undefined),
        csRate: Math.max(0.3, isMe ? rng.normal(traits.csPerMin, 0.6) : rng.normal(isAram ? 4 : baseCs, 0.8)),
        gold: 500,
        cs: 0,
        kills: 0,
        deaths: 0,
        assists: 0,
        items: [],
        nextItemAt: 1300,
      });
    });
  }
  const me = players.find((p) => p.puuid === opts.puuid)!;

  // Per-minute simulation
  type Frame = RawTimeline["info"]["frames"][number];
  const frames: Frame[] = [];
  const snapshot = (minute: number, events: Frame["events"]): Frame => ({
    timestamp: minute * 60_000,
    participantFrames: Object.fromEntries(
      players.map((p) => {
        const [ax, ay] = p.role ? ROLE_ANCHORS[p.role] : [7400, 7400];
        return [
          String(p.participantId),
          {
            participantId: p.participantId,
            totalGold: Math.round(p.gold),
            currentGold: Math.round(p.gold % 1300),
            level: Math.min(18, 1 + Math.floor(minute * (isAram ? 0.9 : 0.62))),
            xp: Math.round(minute * 420),
            minionsKilled: Math.round(p.role === "JUNGLE" ? p.cs * 0.15 : p.cs),
            jungleMinionsKilled: Math.round(p.role === "JUNGLE" ? p.cs * 0.85 : 0),
            position: {
              x: Math.round(Math.max(0, Math.min(14800, ax + rng.normal(0, 900)))),
              y: Math.round(Math.max(0, Math.min(14800, ay + rng.normal(0, 900)))),
            },
          },
        ];
      }),
    ),
    events,
  });

  frames.push(snapshot(0, []));
  let adv = rng.normal(0, 0.15);
  const killRate = isAram ? 1.6 : 0.75;

  for (let minute = 1; minute <= durationMin; minute++) {
    const t = minute / durationMin;
    adv = advantageCurve(scenario, t, rng, adv);
    const events: Frame["events"] = [];
    const ts = () => (minute - 1) * 60_000 + rng.int(1_000, 59_000);

    for (const p of players) {
      const edge = p.teamId === playerTeam ? adv : -adv;
      const cs = scenario === "remake" ? 0 : p.csRate * (1 + 0.12 * edge) * (minute < 2 ? 0.2 : 1);
      p.cs += Math.max(0, cs);
      p.gold += 125 + cs * 21;
    }

    const kills = scenario === "remake" ? 0 : Math.round(Math.max(0, rng.normal(killRate * (0.6 + t), 0.8)));
    for (let k = 0; k < kills; k++) {
      const pMyTeam = 1 / (1 + Math.exp(-3 * adv));
      const killerTeam = rng.chance(pMyTeam) ? playerTeam : playerTeam === 100 ? 200 : 100;
      const victims = players.filter((p) => p.teamId !== killerTeam);
      let victim = rng.pick(victims);
      if (killerTeam !== playerTeam && minute < 14 && rng.chance(traits.earlyDeathRisk * 0.35)) victim = me;
      const killer = rng.pick(players.filter((p) => p.teamId === killerTeam));
      const assisters = players
        .filter((p) => p.teamId === killerTeam && p !== killer)
        .filter(() => rng.chance(isAram ? 0.6 : 0.4));
      killer.kills++;
      killer.gold += 300;
      victim.deaths++;
      for (const a of assisters) { a.assists++; a.gold += 75; }
      const [vx, vy] = victim.role ? ROLE_ANCHORS[victim.role] : [7400, 7400];
      events.push({
        type: "CHAMPION_KILL",
        timestamp: ts(),
        killerId: killer.participantId,
        victimId: victim.participantId,
        assistingParticipantIds: assisters.map((a) => a.participantId),
        position: { x: Math.round(vx + rng.normal(0, 700)), y: Math.round(vy + rng.normal(0, 700)) },
      });
    }

    if (lanes && minute >= 5 && minute % 5 === 0) {
      const pMyTeam = 1 / (1 + Math.exp(-3 * adv));
      const team = rng.chance(pMyTeam) ? playerTeam : playerTeam === 100 ? 200 : 100;
      const killer = players.find((p) => p.teamId === team && p.role === "JUNGLE")!;
      events.push({ type: "ELITE_MONSTER_KILL", timestamp: ts(), killerId: killer.participantId, killerTeamId: team, monsterType: "DRAGON" });
    }
    if (lanes && minute >= 12 && rng.chance(0.35)) {
      const pMyTeam = 1 / (1 + Math.exp(-3 * adv));
      const team = rng.chance(pMyTeam) ? playerTeam : playerTeam === 100 ? 200 : 100;
      events.push({ type: "BUILDING_KILL", timestamp: ts(), teamId: team === 100 ? 200 : 100, buildingType: "TOWER_BUILDING" });
    }

    for (const p of players) {
      while (p.gold >= p.nextItemAt && p.items.length < 6) {
        const item = rng.pick(SYNTHETIC_ITEMS.filter((i) => !p.items.includes(i.id)));
        p.items.push(item.id);
        p.nextItemAt += item.gold + 200;
        events.push({ type: "ITEM_PURCHASED", timestamp: ts(), participantId: p.participantId, itemId: item.id });
      }
    }

    events.sort((a, b) => a.timestamp - b.timestamp);
    frames.push(snapshot(minute, events));
  }

  // Result
  const myTeamWins =
    scenario === "stomp_win" || scenario === "comeback" ? true
    : scenario === "stomp_loss" || scenario === "throw" ? false
    : adv + rng.normal(0, 0.2) > 0;
  const winner: 100 | 200 = myTeamWins ? playerTeam : playerTeam === 100 ? 200 : 100;
  const durationSec = durationMin * 60 - rng.int(0, 50);

  const match: RawMatch = {
    metadata: {
      matchId: `${opts.platform.toUpperCase()}_${9_000_000_000 + (hashSeed(opts.seed, opts.puuid) % 1_000_000) * 100 + index}`,
      participants: players.map((p) => p.puuid),
    },
    info: {
      gameCreation: startedAt,
      gameDuration: durationSec,
      gameEndTimestamp: startedAt + durationSec * 1000,
      gameMode: isAram ? "ARAM" : isOther ? "SYNTHETIC_OTHER" : "CLASSIC",
      gameVersion: index < opts.count / 2 ? "0.2.100.1" : "0.1.100.1",
      mapId: isAram ? 12 : isOther ? 0 : 11,
      queueId: isAram ? 450 : isOther ? 0 : 420,
      platformId: opts.platform.toUpperCase(),
      participants: players.map((p) => {
        const dmgFactor = p.champ.tags.includes("Tank") || p.champ.tags.includes("Support") ? 0.55 : 1;
        const items = [...p.items, 0, 0, 0, 0, 0, 0].slice(0, 6);
        return {
          puuid: p.puuid,
          participantId: p.participantId,
          teamId: p.teamId,
          championId: p.champ.key,
          championName: p.champ.id,
          teamPosition: p.role ?? "",
          individualPosition: p.role ?? "Invalid",
          win: p.teamId === winner,
          kills: p.kills,
          deaths: p.deaths,
          assists: p.assists,
          totalMinionsKilled: Math.round(p.role === "JUNGLE" ? p.cs * 0.15 : p.cs),
          neutralMinionsKilled: Math.round(p.role === "JUNGLE" ? p.cs * 0.85 : 0),
          goldEarned: Math.round(p.gold),
          totalDamageDealtToChampions: Math.round(p.gold * dmgFactor * rng.float(1.1, 1.8)),
          visionScore: isAram ? 0 : Math.round(durationMin * (p.role === "UTILITY" ? 2.2 : p.role === "JUNGLE" ? 1.2 : 0.7) * rng.float(0.7, 1.3)),
          champLevel: Math.min(18, 1 + Math.floor(durationMin * (isAram ? 0.9 : 0.62))),
          item0: items[0]!, item1: items[1]!, item2: items[2]!, item3: items[3]!, item4: items[4]!, item5: items[5]!, item6: 0,
          summoner1Id: 4,
          summoner2Id: p.role === "JUNGLE" ? 11 : 14,
          riotIdGameName: p.gameName,
          riotIdTagline: p.puuid === opts.puuid ? opts.tagLine : "SYN",
          gameEndedInEarlySurrender: scenario === "remake",
          timePlayed: durationSec,
        };
      }),
      teams: [
        { teamId: 100, win: winner === 100 },
        { teamId: 200, win: winner === 200 },
      ],
    },
  };

  const timeline: RawTimeline | null =
    scenario === "missing_timeline" || isOther
      ? null
      : { metadata: { matchId: match.metadata.matchId }, info: { frameInterval: 60_000, frames } };

  return { scenario, match, timeline };
}

/** Newest-first synthetic match history for one player. */
export function generateHistory(opts: GenerateOptions): SyntheticGame[] {
  const traits: PlayerTraits = {
    mainRole: "MIDDLE",
    mainChampions: ["Aurelith", "Veyl"],
    csPerMin: 6.4,
    earlyDeathRisk: 0.4,
    ...opts.traits,
  };
  const weights = { ...DEFAULT_SCENARIO_WEIGHTS, ...opts.scenarios } as Record<Scenario, number>;
  const scenarioRng = new Rng(mulberry32(hashSeed(opts.seed, "scenarios", opts.puuid)));
  const now = opts.now ?? Date.UTC(2026, 0, 15, 20, 0, 0);
  const games: SyntheticGame[] = [];
  let t = now;
  for (let i = 0; i < opts.count; i++) {
    const scenario = scenarioRng.weighted(weights);
    t -= Math.round(scenarioRng.float(0.6, 20) * 3_600_000);
    games.push(generateGame(opts, traits, i, scenario, t));
  }
  return games;
}
