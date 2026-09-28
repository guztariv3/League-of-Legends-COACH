import { z } from "zod";
const text = z.string().max(1600);
const short = z.string().max(160);
const item = z.object({id:z.number().int().positive(),name:short,gold:z.number().nonnegative(),reason:text.optional(),targetId:z.number().int().positive().optional(),targetName:short.optional()}).strict();
const recipeBase = {id:z.number().int().positive(),name:short,gold:z.number().nonnegative(),remaining:z.number().nonnegative(),owned:z.boolean()};
// Explicit depth/size bounds: clients cannot submit unbounded recursive recipe trees.
const leaf = z.object({...recipeBase,children:z.array(z.never()).max(0)}).strict();
const branch = z.object({...recipeBase,children:z.array(leaf).max(6)}).strict();
const branch2 = z.object({...recipeBase,children:z.array(branch).max(6)}).strict();
const recipe = z.object({...recipeBase,children:z.array(branch2).max(6)}).strict();
const player = z.object({spells:z.array(short).max(2).optional(),runes:z.array(z.object({id:z.number().int(),name:short}).strict()).max(12).optional(),champion:short,name:short.nullable(),role:short.nullable(),level:z.number().nullable(),kills:z.number().nullable(),deaths:z.number().nullable(),assists:z.number().nullable(),cs:z.number().nullable(),items:z.array(z.number().int()).max(8),isMe:z.boolean(),rank:short.nullable(),history:z.array(text).max(8)}).strict();
const detail = z.object({
 source:z.enum(["contextual","limited","synthetic"]),players:z.object({allies:z.array(player).max(5),enemies:z.array(player).max(5)}).strict(),
 buyNow:z.array(item).max(8),spent:z.number().nonnegative(),leftover:z.number().nonnegative().nullable(),deferred:z.array(short).max(6),
 recipes:z.array(recipe).max(6),targets:z.array(z.object({id:z.number().int(),name:short,remaining:z.number().nonnegative(),at:z.number().nullable()}).strict()).max(6),
 starter:z.array(item).max(8),alternatives:z.array(item).max(6),
 runes:z.array(z.object({id:z.number().int(),name:short,why:text,group:short}).strict()).max(12),spells:z.array(z.object({name:short,key:z.number().int().nullable(),why:text}).strict()).max(2),
 equippedRunes:z.array(z.object({id:z.number().int(),name:short}).strict()).max(12),equippedSpells:z.array(short).max(2),
 skillOrder:z.array(short).max(4),skillSequence:z.array(z.number().int().min(1).max(4)).max(18),skillRanks:z.array(z.number().int().min(0).max(6)).max(4),nextSkill:text.nullable(),
 teamNotes:z.array(text).max(12),enemyNotes:z.array(text).max(12),playerNotes:z.array(text).max(12),damage:z.object({physical:z.number(),magic:z.number(),true:z.number()}).strict().nullable(),
}).strict();
export const LiveFrameSchema = z.object({
  version: z.literal(1), streamId: z.uuid(), sequence: z.number().int().min(0).max(2147483647),
  capturedAt: z.number().int().positive(),
  phase: z.enum(["idle", "draft", "pregame", "loading", "live", "paused", "reconnecting", "ended"]),
  champion: z.string().max(50).nullable(), position: z.string().max(30).nullable(),
  patch: z.string().max(30).nullable(), time: z.number().min(0).max(30000).nullable(), gold: z.number().min(0).max(100000).nullable(),
  allies: z.array(z.string().max(50)).max(5), enemies: z.array(z.string().max(50)).max(5),
  detail: detail.optional(),
  headline: text,
  sections: z.array(z.object({ title: z.string().max(100), lines: z.array(text).max(24), primary: z.boolean().optional() }).strict()).max(16),
}).strict();
export const LIVE_TTL_MS = 15_000;
export function freshFrame(capturedAt: number, now: number) { return capturedAt <= now + 5000 && now-capturedAt <= LIVE_TTL_MS; }
