import { z } from "zod";

/**
 * Live Client Data API (`https://127.0.0.1:2999/liveclientdata/allgamedata`),
 * the subset the Live Coach reads. It is exposed by the game itself during a
 * match and is read-only. Objects are loose and most fields optional, so a
 * missing field degrades a feature instead of breaking the Coach (verification
 * level V2, docs/01-investigacion.md).
 */

const Scores = z.looseObject({
  kills: z.number().default(0),
  deaths: z.number().default(0),
  assists: z.number().default(0),
  creepScore: z.number().default(0),
  wardScore: z.number().optional(),
});

const Item = z.looseObject({
  itemID: z.number(),
  displayName: z.string().optional(),
  price: z.number().optional(),
  count: z.number().optional(),
});

export const LivePlayer = z.looseObject({
  championName: z.string(),
  /** e.g. "game_character_displayname_MissFortune": the suffix is the Data Dragon id. */
  rawChampionName: z.string().optional(),
  riotId: z.string().optional(),
  summonerName: z.string().optional(),
  team: z.string(), // "ORDER" | "CHAOS"
  level: z.number().default(1),
  position: z.string().optional(),
  isDead: z.boolean().optional(),
  isBot: z.boolean().optional(),
  items: z.array(Item).default([]),
  scores: Scores.optional(),
});
export type LivePlayer = z.infer<typeof LivePlayer>;

export const LiveEvent = z.looseObject({
  EventID: z.number(),
  EventName: z.string(),
  EventTime: z.number(),
});
export type LiveEvent = z.infer<typeof LiveEvent>;

export const AllGameData = z.looseObject({
  activePlayer: z.looseObject({
    riotId: z.string().optional(),
    summonerName: z.string().optional(),
    level: z.number().optional(),
    currentGold: z.number().optional(),
  }),
  allPlayers: z.array(LivePlayer),
  events: z.looseObject({ Events: z.array(LiveEvent).default([]) }).default({ Events: [] }),
  gameData: z.looseObject({
    gameMode: z.string().optional(),
    gameTime: z.number(),
    mapNumber: z.number().optional(),
  }),
});
export type AllGameData = z.infer<typeof AllGameData>;
