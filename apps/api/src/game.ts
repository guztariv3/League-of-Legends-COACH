import { normalizeMatch, type RawMatch, type RawTimeline } from "@coach/domain";
import { coachReview, gamePlan } from "@coach/coach";
import { analyzeDraft, type DraftInput } from "@coach/draft";
import { fetchCatalog } from "@coach/itemization";
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
/** The draft read and the Coach's game plan for the same champions (web pre-game and desktop). */
export function prepareGame(input: DraftInput, analyses: Parameters<typeof analyzeDraft>[2], bundle: ReturnType<KnowledgeRegistry["active"]>) {
  const draft = analyzeDraft(input, bundle?.champions ?? [], analyses);
  const plan = gamePlan({ myChampion: input.myChampion, laneOpponent: input.laneOpponent, enemies: input.enemies, draft, history: analyses, bundle });
  return { draft, plan };
}

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
      return c.json({ available: false, message: "We do not have this game's timeline, so we cannot reconstruct it." });
    }
    const match = normalizeMatch(raw.payload as RawMatch);
    if (match.mode !== "summoners_rift" || match.remake) {
      return c.json({ available: false, message: "The map review is only available for complete Summoner's Rift games." });
    }
    const timeline = tl.payload as RawTimeline;
    const review = buildReview(match, timeline, mine.puuid);
    if (!review) return c.json({ error: "not_found" }, 404);
    // Coach Review: this game against the player's own games; item data only with the real catalog.
    const { analyses } = await services.profileAnalyses(c.get("userId"));
    const bundle = knowledge.active();
    const catalog = bundle?.source === "ddragon" ? await fetchCatalog(bundle.version) : null;
    const coach = coachReview({ game: mine, history: analyses, review, match, timeline, catalog });
    return c.json({ available: true, dataSource: raw.source, review, coach });
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
    const { draft, plan } = prepareGame(parsed.data, analyses, knowledge.active());
    await services.logDecision({
      userId: c.get("userId"), kind: "draft", title: `Prep with ${parsed.data.myChampion}`,
      context: { input: parsed.data, keyPoints: draft.keyPoints.map((p) => p.title) }, decision: "none",
    });
    return c.json({ ...draft, plan });
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
