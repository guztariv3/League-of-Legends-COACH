import { activity, championPool, matchupPool } from "@coach/coach";
import { Hono } from "hono";
import type { AuthVars } from "./auth.js";
import type { Services } from "./services.js";

/** How far back the activity calendar goes. */
export const ACTIVITY_DAYS = 182;

/** Phase 6 "Improve": champion pool, matchup pool and activity, from the player's own games. */
export function improveRoutes({ services, now = () => Date.now() }: { services: Services; now?: () => number }) {
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
  return r;
}
