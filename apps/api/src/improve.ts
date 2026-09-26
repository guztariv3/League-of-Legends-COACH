import { activity, championPool, matchupPool } from "@coach/coach";
import {
  challengeTitle, evaluateChallenge, GOAL_METRICS, MAX_ACTIVE_CHALLENGES, suggestChallenges,
  type ChallengeKind, type GoalMetric,
} from "@coach/insights";
import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { AuthVars } from "./auth.js";
import { schema, type Db } from "./db/index.js";
import type { Services } from "./services.js";

/** How far back the activity calendar goes. */
export const ACTIVITY_DAYS = 182;

type ChallengeRow = typeof schema.challenges.$inferSelect;

/** Phase 6 "Improve": champion pool, matchup pool, activity and challenges, from the player's own games. */
export function improveRoutes({ db, services, now = () => Date.now() }: { db: Db; services: Services; now?: () => number }) {
  const r = new Hono<AuthVars>();

  r.get("/improve", async (c) => {
    const { analyses } = await services.profileAnalyses(c.get("userId"));
    const champion = c.req.query("champion")?.slice(0, 40) || undefined;
    return c.json({
      champions: championPool(analyses),
      matchups: matchupPool(analyses, champion),
      matchupChampion: champion ?? null,
      activity: activity(analyses, now() - ACTIVITY_DAYS * 86_400_000),
      activityDays: ACTIVITY_DAYS,
    });
  });

  // ------------------------------------------------------------ challenges
  const view = (row: ChallengeRow, analyses: Parameters<typeof evaluateChallenge>[1]) => {
    const spec = { metric: row.metric as GoalMetric, target: row.target, kind: row.kind as ChallengeKind };
    return {
      id: row.id, metric: row.metric, kind: row.kind, target: row.target,
      title: challengeTitle(spec), createdAt: row.createdAt.toISOString(),
      closedAt: row.closedAt?.toISOString() ?? null,
      progress: evaluateChallenge(spec, analyses, row.createdAt.getTime(), now()),
      status: row.status,
    };
  };

  r.get("/challenges", async (c) => {
    const userId = c.get("userId");
    const { analyses } = await services.profileAnalyses(userId);
    const rows = await db.select().from(schema.challenges).where(eq(schema.challenges.userId, userId)).orderBy(desc(schema.challenges.createdAt));
    // Settle finished challenges, so they leave the active list.
    for (const row of rows.filter((x) => x.status === "active")) {
      const v = view(row, analyses);
      if (v.progress.status !== "in_progress") {
        row.status = v.progress.status;
        row.closedAt = new Date(now());
        await db.update(schema.challenges).set({ status: row.status, closedAt: row.closedAt }).where(eq(schema.challenges.id, row.id));
      }
    }
    const active = rows.filter((x) => x.status === "active");
    const [focus] = await db.select().from(schema.coachMemory)
      .where(and(eq(schema.coachMemory.userId, userId), eq(schema.coachMemory.category, "focus")));
    const suggestions = active.length >= MAX_ACTIVE_CHALLENGES ? [] : suggestChallenges(analyses, {
      focus: focus?.ref ?? null, exclude: active.map((x) => x.metric), max: MAX_ACTIVE_CHALLENGES - active.length,
    });
    return c.json({
      active: active.map((x) => view(x, analyses)),
      recent: rows.filter((x) => x.status === "completed" || x.status === "failed").slice(0, 6).map((x) => view(x, analyses)),
      completedCount: rows.filter((x) => x.status === "completed").length,
      suggestions,
      max: MAX_ACTIVE_CHALLENGES,
    });
  });

  r.post("/challenges", async (c) => {
    const parsed = z.object({
      metric: z.enum(Object.keys(GOAL_METRICS) as [GoalMetric, ...GoalMetric[]]),
      kind: z.enum(["next5", "week"]),
    }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid_body" }, 400);
    const userId = c.get("userId");
    const active = await db.select().from(schema.challenges).where(and(eq(schema.challenges.userId, userId), eq(schema.challenges.status, "active")));
    if (active.length >= MAX_ACTIVE_CHALLENGES) {
      return c.json({ error: "too_many_challenges", message: `You can have at most ${MAX_ACTIVE_CHALLENGES} challenges at a time.` }, 409);
    }
    if (active.some((x) => x.metric === parsed.data.metric)) {
      return c.json({ error: "duplicate_challenge", message: "You already have a challenge on this." }, 409);
    }
    // The target is always the server's, from the player's recent games (not sent by the client).
    const { analyses } = await services.profileAnalyses(userId);
    const s = suggestChallenges(analyses, { focus: parsed.data.metric, max: 1 })[0];
    if (!s || s.metric !== parsed.data.metric) {
      return c.json({ error: "not_enough_data", message: "Not enough recent games to set a fair target for this." }, 409);
    }
    const [row] = await db.insert(schema.challenges).values({
      userId, metric: s.metric, target: s.target, kind: parsed.data.kind, status: "active", createdAt: new Date(now()),
    }).returning();
    return c.json({ challenge: view(row!, analyses) }, 201);
  });

  r.delete("/challenges/:id", async (c) => {
    const id = c.req.param("id");
    if (!z.uuid().safeParse(id).success) return c.json({ error: "not_found" }, 404);
    const [row] = await db.update(schema.challenges).set({ status: "abandoned", closedAt: new Date(now()) })
      .where(and(eq(schema.challenges.id, id), eq(schema.challenges.userId, c.get("userId")), eq(schema.challenges.status, "active")))
      .returning();
    return row ? c.json({ ok: true }) : c.json({ error: "not_found" }, 404);
  });

  return r;
}
