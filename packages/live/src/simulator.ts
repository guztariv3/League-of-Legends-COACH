/**
 * Builds Live Client Data-shaped snapshots from a match-v5 match + timeline,
 * to replay a game "as if live" (development, tests, the desktop demo mode).
 * Only fields the Live Client Data API exposes are produced.
 */
import type { AllGameData } from "./schema.js";

interface MatchLike {
  info: {
    gameMode: string;
    mapId: number;
    participants: {
      participantId: number;
      puuid: string;
      teamId: number;
      championName: string;
      teamPosition?: string;
      riotIdGameName?: string;
      riotIdTagline?: string;
    }[];
  };
}

interface TimelineLike {
  info: {
    frameInterval: number;
    frames: {
      timestamp: number;
      participantFrames: Record<string, { participantId: number; level: number; minionsKilled: number; jungleMinionsKilled: number }>;
      events: { type: string; timestamp: number; [k: string]: unknown }[];
    }[];
  };
}

export function snapshotAt(match: MatchLike, timeline: TimelineLike, puuid: string, gameTimeSec: number, itemPrices: Map<number, number> = new Map()): AllGameData {
  const tMs = gameTimeSec * 1000;
  const frames = timeline.info.frames;
  const frame = [...frames].reverse().find((f) => f.timestamp <= tMs) ?? frames[0]!;
  const events = frames.flatMap((f) => f.events).filter((e) => e.timestamp <= tMs).sort((a, b) => a.timestamp - b.timestamp);
  const name = (p: MatchLike["info"]["participants"][number]) => `${p.riotIdGameName ?? `P${p.participantId}`}#${p.riotIdTagline ?? "SYN"}`;
  const byId = new Map(match.info.participants.map((p) => [p.participantId, p]));

  const allPlayers = match.info.participants.map((p) => {
    const pf = frame.participantFrames[String(p.participantId)];
    const kills = events.filter((e) => e.type === "CHAMPION_KILL" && e["killerId"] === p.participantId).length;
    const deaths = events.filter((e) => e.type === "CHAMPION_KILL" && e["victimId"] === p.participantId).length;
    const assists = events.filter((e) => e.type === "CHAMPION_KILL" && ((e["assistingParticipantIds"] as number[] | undefined) ?? []).includes(p.participantId)).length;
    const items = events
      .filter((e) => e.type === "ITEM_PURCHASED" && e["participantId"] === p.participantId)
      .map((e) => Number(e["itemId"]))
      .slice(-6)
      .map((itemID) => ({ itemID, price: itemPrices.get(itemID), count: 1 }));
    return {
      championName: p.championName,
      riotId: name(p),
      team: p.teamId === 100 ? "ORDER" : "CHAOS",
      level: pf?.level ?? 1,
      position: p.teamPosition || "",
      items,
      scores: { kills, deaths, assists, creepScore: (pf?.minionsKilled ?? 0) + (pf?.jungleMinionsKilled ?? 0) },
    };
  });

  const liveEvents: AllGameData["events"]["Events"] = [];
  let id = 0;
  for (const e of events) {
    const at = e.timestamp / 1000;
    if (e.type === "CHAMPION_KILL") {
      liveEvents.push({ EventID: id++, EventName: "ChampionKill", EventTime: at, KillerName: byId.get(e["killerId"] as number) ? name(byId.get(e["killerId"] as number)!) : "", VictimName: byId.get(e["victimId"] as number) ? name(byId.get(e["victimId"] as number)!) : "" });
    } else if (e.type === "ELITE_MONSTER_KILL") {
      const killer = byId.get(e["killerId"] as number);
      const monster = String(e["monsterType"] ?? "");
      const eventName = monster === "DRAGON" ? "DragonKill" : monster === "BARON_NASHOR" ? "BaronKill" : monster === "RIFTHERALD" ? "HeraldKill" : null;
      if (eventName) liveEvents.push({ EventID: id++, EventName: eventName, EventTime: at, KillerName: killer ? name(killer) : "" });
    }
  }

  const me = match.info.participants.find((p) => p.puuid === puuid)!;
  return {
    activePlayer: { riotId: name(me), level: frame.participantFrames[String(me.participantId)]?.level ?? 1 },
    allPlayers,
    events: { Events: liveEvents },
    gameData: { gameMode: match.info.gameMode, gameTime: gameTimeSec, mapNumber: match.info.mapId },
  };
}
