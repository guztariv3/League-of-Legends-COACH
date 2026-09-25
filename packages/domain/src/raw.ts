import { z } from "zod";

/**
 * Subset of Riot match-v5 payloads that the app reads. Objects are "loose",
 * so unknown fields are kept and the raw layer stores Riot's payload
 * untouched. Fields whose presence varies across patches are optional.
 */

const num = z.number();

export const RawParticipant = z.looseObject({
  puuid: z.string(),
  participantId: num,
  teamId: num,
  championId: num,
  championName: z.string(),
  teamPosition: z.string().optional(),
  individualPosition: z.string().optional(),
  win: z.boolean(),
  kills: num,
  deaths: num,
  assists: num,
  totalMinionsKilled: num,
  neutralMinionsKilled: num,
  goldEarned: num,
  totalDamageDealtToChampions: num,
  visionScore: num.optional(),
  champLevel: num,
  item0: num, item1: num, item2: num, item3: num, item4: num, item5: num, item6: num,
  summoner1Id: num,
  summoner2Id: num,
  // Runes: styles[0] is the primary path (its first selection is the keystone), styles[1] the secondary.
  perks: z.looseObject({
    styles: z.array(z.looseObject({ style: num, selections: z.array(z.looseObject({ perk: num })) })),
  }).optional(),
  riotIdGameName: z.string().optional(),
  riotIdTagline: z.string().optional(),
  gameEndedInEarlySurrender: z.boolean().optional(),
  timePlayed: num.optional(),
});
export type RawParticipant = z.infer<typeof RawParticipant>;

export const RawTeam = z.looseObject({
  teamId: num,
  win: z.boolean(),
});

export const RawMatch = z.looseObject({
  metadata: z.looseObject({
    matchId: z.string(),
    participants: z.array(z.string()),
  }),
  info: z.looseObject({
    gameCreation: num,
    gameDuration: num,
    gameEndTimestamp: num.optional(),
    gameMode: z.string(),
    gameVersion: z.string(),
    mapId: num,
    queueId: num,
    platformId: z.string(),
    participants: z.array(RawParticipant),
    teams: z.array(RawTeam),
  }),
});
export type RawMatch = z.infer<typeof RawMatch>;

export const RawPosition = z.object({ x: num, y: num });

export const RawParticipantFrame = z.looseObject({
  participantId: num,
  totalGold: num,
  currentGold: num.optional(),
  level: num,
  xp: num,
  minionsKilled: num,
  jungleMinionsKilled: num,
  position: RawPosition.optional(),
});

export const RawTimelineEvent = z.looseObject({
  type: z.string(),
  timestamp: num,
});

export const RawTimeline = z.looseObject({
  metadata: z.looseObject({ matchId: z.string() }),
  info: z.looseObject({
    frameInterval: num,
    frames: z.array(
      z.looseObject({
        timestamp: num,
        participantFrames: z.record(z.string(), RawParticipantFrame),
        events: z.array(RawTimelineEvent),
      }),
    ),
  }),
});
export type RawTimeline = z.infer<typeof RawTimeline>;
