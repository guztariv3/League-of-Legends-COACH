import { z } from "zod";
const text = z.string().max(1600);
export const LiveFrameSchema = z.object({
  version: z.literal(1), streamId: z.uuid(), sequence: z.number().int().min(0).max(2147483647),
  capturedAt: z.number().int().positive(),
  phase: z.enum(["idle", "draft", "pregame", "loading", "live", "paused", "reconnecting", "ended"]),
  champion: z.string().max(50).nullable(), position: z.string().max(30).nullable(),
  patch: z.string().max(30).nullable(), time: z.number().min(0).max(30000).nullable(), gold: z.number().min(0).max(100000).nullable(),
  allies: z.array(z.string().max(50)).max(5), enemies: z.array(z.string().max(50)).max(5),
  headline: text,
  sections: z.array(z.object({ title: z.string().max(100), lines: z.array(text).max(24), primary: z.boolean().optional() }).strict()).max(16),
}).strict();
export const LIVE_TTL_MS = 15_000;
export function freshFrame(capturedAt: number, now: number) { return capturedAt <= now + 5000 && now-capturedAt <= LIVE_TTL_MS; }
