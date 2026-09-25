import { normalizeMatch, type RawMatch, type RawTimeline } from "@coach/domain";
import { analyzeDraft } from "@coach/draft";
import type { KnowledgeRegistry } from "@coach/knowledge";
import { buildReview } from "@coach/review";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { AuthVars } from "./auth.js";
import { schema, type Db } from "./db/index.js";
import { analysesFor, userAccounts } from "./queries.js";
import { scoutForUser } from "./scout.js";
import type { Services } from "./services.js";
import type { MatchSource } from "./sources.js";

/** Phase 3 routes: match review, pre-game draft analysis and loading-screen scouting. */
export function gameRoutes({ db, source, knowledge, services }: { db: Db; source: MatchSource; knowledge: KnowledgeRegistry; services: Services }) {
  const r = new Hono<AuthVars>();

  r.get("/matches/:matchId/review", async (c) => {
    const matchId = c.req.param("matchId");
    const accounts = await userAccounts(db, c.get("userId"));
    // Ownership: only games linked to one of the user's accounts can be reviewed.
    const mine = (await analysesFor(db, accounts)).find((a) => a.matchId === matchId);
    if (!mine) return c.json({ error: "not_found" }, 404);
    const [raw] = await db.select().from(schema.rawMatches).where(eq(schema.rawMatches.matchId, matchId));
    const [tl] = await db.select().from(schema.rawTimelines).where(eq(schema.rawTimelines.matchId, matchId));
    if (!raw || !tl) {
      return c.json({ available: false, message: "No tenemos la línea temporal de esta partida, así que no podemos reconstruirla." });
    }
    const match = normalizeMatch(raw.payload as RawMatch);
    if (match.mode !== "summoners_rift" || match.remake) {
      return c.json({ available: false, message: "La revisión por mapa solo está disponible para partidas completas de la Grieta." });
    }
    const review = buildReview(match, tl.payload as RawTimeline, mine.puuid);
    return review ? c.json({ available: true, dataSource: raw.source, review }) : c.json({ error: "not_found" }, 404);
  });

  r.post("/draft", async (c) => {
    const champIds = z.array(z.string().min(1).max(40)).max(5);
    const parsed = z.object({
      myChampion: z.string().min(1).max(40),
      allies: champIds.default([]),
      enemies: champIds.default([]),
      laneOpponent: z.string().min(1).max(40).optional(),
    }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid_body" }, 400);
    const { analyses } = await services.profileAnalyses(c.get("userId"));
    const draft = analyzeDraft(parsed.data, knowledge.active()?.champions ?? [], analyses);
    await services.logDecision({
      userId: c.get("userId"), kind: "draft", title: `Preparación con ${parsed.data.myChampion}`,
      context: { input: parsed.data, keyPoints: draft.keyPoints.map((p) => p.title) }, decision: "none",
    });
    return c.json(draft);
  });

  r.get("/game/scout", async (c) => {
    const accounts = (await userAccounts(db, c.get("userId"))).filter((a) => a.includeInProfile);
    const accountId = c.req.query("accountId");
    const candidates = accountId ? accounts.filter((a) => a.id === accountId) : accounts;
    if (!candidates.length) return c.json({ error: "not_found" }, 404);
    const { analyses } = await services.profileAnalyses(c.get("userId"));
    return c.json(await scoutForUser({ db, source, knowledge }, accountId ? `${c.get("userId")}:${accountId}` : c.get("userId"), candidates, analyses));
  });

  return r;
}
