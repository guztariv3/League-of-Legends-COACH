import { buildProfile, compareMeans, gameStateSplit, mean, wilson } from "@coach/analysis";
import {
  describeTarget,
  evaluateGoal,
  GOAL_METRICS,
  MAX_ACTIVE_GOALS,
  proposeTarget,
  successRate,
  suggestGoals,
  type GoalMetric,
} from "@coach/insights";
import type { KnowledgeRegistry } from "@coach/knowledge";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { AuthVars } from "./auth.js";
import { schema, type Db } from "./db/index.js";
import { search } from "./search.js";
import type { Services } from "./services.js";
import type { MatchSource } from "./sources.js";

/** Phase 2 personalisation routes: profile, goals, Coach memory, search and champion detail. */
export function personalRoutes({ db, knowledge, services }: { db: Db; source: MatchSource; knowledge: KnowledgeRegistry; services: Services }) {
  const r = new Hono<AuthVars>();
  const metricKeys = Object.keys(GOAL_METRICS) as [GoalMetric, ...GoalMetric[]];
  const uuidOk = (id: string) => z.uuid().safeParse(id).success;

  // ------------------------------------------------------------ profile

  r.get("/profile", async (c) => {
    const { analyses } = await services.profileAnalyses(c.get("userId"));
    return c.json({ profiles: buildProfile(analyses), gameState: gameStateSplit(analyses) });
  });

  // ------------------------------------------------------------ goals

  r.get("/goals", async (c) => {
    const userId = c.get("userId");
    const { analyses, insights } = await services.insightsFor(userId, 10);
    const rows = await db.select().from(schema.goals).where(eq(schema.goals.userId, userId));
    const active = rows.filter((g) => g.status === "active");
    const goals = active.map((g) => {
      const spec = { metric: g.metric as GoalMetric, target: g.target };
      const since = analyses.filter((a) => a.startedAt >= g.createdAt.getTime());
      return {
        id: g.id,
        metric: g.metric,
        target: g.target,
        title: describeTarget(spec),
        note: g.note,
        source: g.source,
        createdAt: g.createdAt,
        progress: evaluateGoal(spec, g.baselineRate, since),
      };
    });
    // Metrics with an active goal or a rejected suggestion are not suggested again.
    const taken = rows.filter((g) => g.status === "active" || g.status === "rejected").map((g) => g.metric as GoalMetric);
    const suggestions = active.length < MAX_ACTIVE_GOALS ? suggestGoals(insights, analyses, taken) : [];
    return c.json({ goals, suggestions, max: MAX_ACTIVE_GOALS, metrics: Object.entries(GOAL_METRICS).map(([id, d]) => ({ id, label: d.label })) });
  });

  r.post("/goals", async (c) => {
    const parsed = z.object({
      metric: z.enum(metricKeys),
      target: z.number().finite().optional(),
      note: z.string().trim().max(200).optional(),
      source: z.enum(["coach", "user"]).default("user"),
    }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid_body" }, 400);
    const userId = c.get("userId");
    if ((await services.activeGoals(userId)).length >= MAX_ACTIVE_GOALS) {
      return c.json({ error: "too_many_goals", message: `Puedes tener como mucho ${MAX_ACTIVE_GOALS} objetivos activos a la vez.` }, 409);
    }
    const { analyses } = await services.profileAnalyses(userId);
    let target = parsed.data.target;
    let baselineRate: number;
    if (target === undefined) {
      const proposal = proposeTarget(parsed.data.metric, analyses);
      if (!proposal) return c.json({ error: "insufficient_data", message: "Todavía no tengo suficientes partidas para proponer un objetivo medible en esta métrica." }, 422);
      target = proposal.spec.target;
      baselineRate = proposal.baselineRate;
    } else {
      baselineRate = successRate({ metric: parsed.data.metric, target }, analyses).rate;
    }
    const [goal] = await db.insert(schema.goals).values({
      userId, metric: parsed.data.metric, target, baselineRate, status: "active", source: parsed.data.source, note: parsed.data.note ?? null,
    }).returning();
    return c.json({ goal: { id: goal!.id, title: describeTarget({ metric: parsed.data.metric, target }) } }, 201);
  });

  r.post("/goals/reject", async (c) => {
    const parsed = z.object({ metric: z.enum(metricKeys) }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid_body" }, 400);
    await db.insert(schema.goals).values({ userId: c.get("userId"), metric: parsed.data.metric, target: 0, baselineRate: 0, status: "rejected", source: "coach" });
    return c.json({ ok: true });
  });

  r.patch("/goals/:id", async (c) => {
    const id = c.req.param("id");
    const parsed = z.object({ status: z.enum(["achieved", "archived"]) }).safeParse(await c.req.json().catch(() => null));
    if (!uuidOk(id) || !parsed.success) return c.json({ error: "invalid_body" }, 400);
    const updated = await db.update(schema.goals).set({ status: parsed.data.status })
      .where(and(eq(schema.goals.id, id), eq(schema.goals.userId, c.get("userId")))).returning();
    return updated.length ? c.json({ ok: true }) : c.json({ error: "not_found" }, 404);
  });

  r.delete("/goals/:id", async (c) => {
    const id = c.req.param("id");
    if (!uuidOk(id)) return c.json({ error: "not_found" }, 404);
    const deleted = await db.delete(schema.goals).where(and(eq(schema.goals.id, id), eq(schema.goals.userId, c.get("userId")))).returning();
    return deleted.length ? c.json({ ok: true }) : c.json({ error: "not_found" }, 404);
  });

  // ------------------------------------------------------------ Coach memory

  r.get("/memory", async (c) => {
    const userId = c.get("userId");
    const items = await db.select().from(schema.coachMemory).where(eq(schema.coachMemory.userId, userId));
    const prefs = await services.prefsFor(userId);
    return c.json({
      categories: prefs.memory,
      items: items
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .map((m) => ({ id: m.id, category: m.category, content: m.content, ref: m.ref, createdAt: m.createdAt })),
    });
  });

  r.post("/memory", async (c) => {
    const parsed = z.discriminatedUnion("category", [
      z.object({ category: z.literal("note"), content: z.string().trim().min(1).max(300) }),
      z.object({ category: z.literal("focus"), metric: z.enum(metricKeys) }),
    ]).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid_body" }, 400);
    const userId = c.get("userId");
    const prefs = await services.prefsFor(userId);
    if (!prefs.memory[parsed.data.category]) {
      return c.json({ error: "category_disabled", message: "Has desactivado esta categoría de memoria." }, 409);
    }
    if (parsed.data.category === "focus") {
      // One focus at a time: the new one replaces the old one.
      await db.delete(schema.coachMemory).where(and(eq(schema.coachMemory.userId, userId), eq(schema.coachMemory.category, "focus")));
      const [m] = await db.insert(schema.coachMemory).values({
        userId, category: "focus", ref: parsed.data.metric, content: `Quiero centrarme en: ${GOAL_METRICS[parsed.data.metric].label}`,
      }).returning();
      return c.json({ item: m }, 201);
    }
    const [m] = await db.insert(schema.coachMemory).values({ userId, category: "note", content: parsed.data.content }).returning();
    return c.json({ item: m }, 201);
  });

  r.delete("/memory/:id", async (c) => {
    const id = c.req.param("id");
    if (!uuidOk(id)) return c.json({ error: "not_found" }, 404);
    const deleted = await db.delete(schema.coachMemory)
      .where(and(eq(schema.coachMemory.id, id), eq(schema.coachMemory.userId, c.get("userId")))).returning();
    return deleted.length ? c.json({ ok: true }) : c.json({ error: "not_found" }, 404);
  });

  /** Deletes a whole category (or all memory) — granular control, brief §94. */
  r.delete("/memory", async (c) => {
    const category = c.req.query("category");
    const userId = c.get("userId");
    if (category && !["focus", "correction", "note"].includes(category)) return c.json({ error: "invalid_category" }, 400);
    await db.delete(schema.coachMemory).where(
      category
        ? and(eq(schema.coachMemory.userId, userId), eq(schema.coachMemory.category, category as "focus" | "correction" | "note"))
        : eq(schema.coachMemory.userId, userId),
    );
    return c.json({ ok: true });
  });

  /** "This isn't useful": stored as a correction so the insight is not shown again. */
  r.post("/coach/feedback", async (c) => {
    const parsed = z.object({ insightId: z.string().min(1).max(64), title: z.string().max(200).optional() }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid_body" }, 400);
    const userId = c.get("userId");
    const prefs = await services.prefsFor(userId);
    if (!prefs.memory.correction) return c.json({ ok: true, stored: false });
    await db.insert(schema.coachMemory).values({
      userId, category: "correction", ref: parsed.data.insightId,
      content: `No me resulta útil: ${parsed.data.title ?? parsed.data.insightId}`,
    });
    return c.json({ ok: true, stored: true });
  });

  // ------------------------------------------------------------ search

  r.get("/search", async (c) => {
    const q = (c.req.query("q") ?? "").slice(0, 120);
    const userId = c.get("userId");
    const { analyses, insights } = await services.insightsFor(userId, 10);
    const usable = analyses.filter((a) => a.analyzable);
    const playerChampions = new Map<string, number>();
    const matchups = new Map<string, number>();
    for (const a of usable) {
      playerChampions.set(a.championName, (playerChampions.get(a.championName) ?? 0) + 1);
      if (a.laneOpponentChampion) {
        const k = `${a.championName}|${a.laneOpponentChampion}`;
        matchups.set(k, (matchups.get(k) ?? 0) + 1);
      }
    }
    // Match data uses Riot's champion id; the knowledge bundle provides the display name.
    const known = knowledge.active()?.champions.map((ch) => ({ id: ch.id, name: ch.name })) ?? [];
    const champions = [
      ...known,
      ...[...playerChampions.keys()].filter((id) => !known.some((k) => k.id === id)).map((id) => ({ id, name: id })),
    ];
    const dimensions = buildProfile(analyses).flatMap((p) => p.dimensions.map((d) => ({ id: d.id, label: d.label, headline: d.headline })));
    return c.json({ results: search(q, { champions, playerChampions, matchups, dimensions, insights }) });
  });

  // ------------------------------------------------------------ champion detail (personal layer, brief §57)

  r.get("/champions/:name", async (c) => {
    const name = c.req.param("name");
    const champ = knowledge.active()?.champions.find((ch) => ch.name.toLowerCase() === name.toLowerCase() || ch.id.toLowerCase() === name.toLowerCase());
    const { analyses } = await services.profileAnalyses(c.get("userId"));
    const usable = analyses.filter((a) => a.analyzable);
    const games = usable.filter((a) => a.championName.toLowerCase() === (champ?.id ?? name).toLowerCase());
    if (!champ && !games.length) return c.json({ error: "not_found" }, 404);

    const others = usable.filter((a) => !games.includes(a) && a.mode === "summoners_rift");
    const sr = games.filter((a) => a.mode === "summoners_rift");
    const compare = (label: string, pick: (a: (typeof usable)[number]) => number | null, higherIsBetter: boolean, digits = 1) => {
      const mine = sr.map(pick).filter((v): v is number => v !== null);
      const rest = others.map(pick).filter((v): v is number => v !== null);
      if (mine.length < 3) return null;
      const cmp = compareMeans(mine, rest, 5);
      return {
        label,
        value: mean(mine).toFixed(digits),
        others: rest.length ? mean(rest).toFixed(digits) : null,
        // Only a consolidated difference earns a verdict; otherwise it is reported as "similar".
        verdict: cmp.consolidated ? ((cmp.diff > 0) === higherIsBetter ? "better" : "worse") : "similar",
        sample: mine.length,
      };
    };

    const byOpponent = new Map<string, { games: number; wins: number }>();
    for (const a of sr) {
      if (!a.laneOpponentChampion) continue;
      const m = byOpponent.get(a.laneOpponentChampion) ?? { games: 0, wins: 0 };
      m.games++;
      if (a.win) m.wins++;
      byOpponent.set(a.laneOpponentChampion, m);
    }
    const wins = games.filter((a) => a.win).length;

    return c.json({
      champion: champ ?? null,
      knowledgeVersion: knowledge.active()?.version ?? null,
      personal: {
        games: games.length,
        wins,
        interval: wilson(wins, games.length),
        comparisons: [
          compare("CS por minuto", (a) => a.csPerMin, true),
          compare("Muertes por minuto", (a) => a.deathsPerMin, false, 2),
          compare("Oro vs rival al 10", (a) => a.goldDiff10, true, 0),
          compare("Participación en kills", (a) => a.killParticipation, true, 2),
        ].filter((x) => x !== null),
        opponents: [...byOpponent.entries()]
          .map(([opponent, m]) => ({ opponent, ...m }))
          .sort((a, b) => b.games - a.games)
          .slice(0, 8),
        recent: games.slice(0, 5).map((a) => ({ matchId: a.matchId, win: a.win, kills: a.kills, deaths: a.deaths, assists: a.assists, startedAt: a.startedAt, mode: a.mode })),
      },
    });
  });

  return r;
}
