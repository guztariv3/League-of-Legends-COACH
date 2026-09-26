import {
  adaptationByOpponentClass,
  adaptationToLead,
  buildTimeline,
  detectAnomalies,
  findInflections,
} from "@coach/analysis";
import { describeTarget, evaluateGoal, type GoalMetric } from "@coach/insights";
import type { KnowledgeRegistry } from "@coach/knowledge";
import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { AuthVars } from "./auth.js";
import { schema, type Db } from "./db/index.js";
import type { Services } from "./services.js";

/** Phase 5: evolution (inflections, anomalies, timeline), adaptability and the decision history. */
export function evolutionRoutes({ db, knowledge, services }: { db: Db; knowledge: KnowledgeRegistry; services: Services }) {
  const r = new Hono<AuthVars>();

  r.get("/evolution", async (c) => {
    const userId = c.get("userId");
    const { analyses } = await services.profileAnalyses(userId);
    const inflections = findInflections(analyses);
    const timeline = buildTimeline(analyses, inflections);
    // Goals marked as achieved also belong to the player's evolution.
    const achieved = await db.select().from(schema.goals).where(eq(schema.goals.userId, userId));
    for (const g of achieved.filter((x) => x.status === "achieved" && x.closedAt)) {
      timeline.push({ at: g.closedAt!.getTime(), type: "inflection", title: `Goal achieved: ${describeTarget({ metric: g.metric as GoalMetric, target: g.target })}`, detail: "Marked as achieved once it consolidated." });
    }
    timeline.sort((a, b) => a.at - b.at);
    const tags = new Map((knowledge.active()?.champions ?? []).map((ch) => [ch.id, ch.tags]));
    return c.json({
      inflections,
      anomalies: detectAnomalies(analyses),
      timeline,
      adaptation: {
        byOpponentClass: adaptationByOpponentClass(analyses, (id) => tags.get(id)),
        lead: adaptationToLead(analyses),
      },
      games: analyses.filter((a) => a.analyzable).length,
    });
  });

  r.get("/history", async (c) => {
    const userId = c.get("userId");
    const rows = await db.select().from(schema.recommendationLog).where(eq(schema.recommendationLog.userId, userId)).orderBy(desc(schema.recommendationLog.createdAt)).limit(50);
    const goals = new Map((await db.select().from(schema.goals).where(eq(schema.goals.userId, userId))).map((g) => [g.id, g]));
    const { analyses } = await services.profileAnalyses(userId);
    return c.json({
      note: "We show what happened afterwards, but that does not prove the recommendation caused it.",
      items: rows.map((r) => {
        let outcome: string | null = null;
        if (r.kind === "goal_suggestion" && r.decision === "accepted" && r.ref) {
          const g = goals.get(r.ref);
          if (g) {
            const progress = evaluateGoal({ metric: g.metric as GoalMetric, target: g.target }, g.baselineRate, analyses.filter((a) => a.startedAt >= g.createdAt.getTime()));
            outcome = `${g.status === "achieved" ? "Achieved. " : g.status === "archived" ? "Archived. " : ""}${progress.summary}`;
          } else outcome = "The goal no longer exists.";
        }
        return { id: r.id, kind: r.kind, title: r.title, decision: r.decision, createdAt: r.createdAt, outcome };
      }),
    });
  });

  r.delete("/history", async (c) => {
    await db.delete(schema.recommendationLog).where(eq(schema.recommendationLog.userId, c.get("userId")));
    return c.json({ ok: true });
  });

  return r;
}
