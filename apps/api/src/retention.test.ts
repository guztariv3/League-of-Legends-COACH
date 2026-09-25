import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { syntheticSource as syntheticKnowledge } from "@coach/knowledge";
import { eq, sql } from "drizzle-orm";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { openDatabase, schema, type Database } from "./db/index.js";
import { bootKnowledge } from "./knowledge.js";
import { purgeUnlinkedMatches, UNLINKED_MATCH_TTL_DAYS } from "./retention.js";
import { syntheticSource } from "./sources.js";

let database: Database;
let ctx: ReturnType<typeof createApp>;

beforeAll(async () => {
  database = await openDatabase(undefined, undefined);
  const knowledge = await bootKnowledge(database.db, syntheticKnowledge());
  ctx = createApp({ cfg: loadConfig({ NODE_ENV: "test" }), db: database.db, source: syntheticSource(() => Date.UTC(2026, 5, 1)), knowledge, aiProviders: [] });
}, 30_000);
afterAll(() => database.close());

async function call(path: string, init: RequestInit & { cookie?: string } = {}) {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  if (init.cookie) headers.set("Cookie", init.cookie);
  const res = await ctx.app.request(`/api${path}`, { ...init, headers });
  return { res, body: (await res.json()) as any };
}

const count = async (table: string) =>
  Number(((await database.db.execute(sql.raw(`SELECT count(*)::int AS n FROM ${table}`))) as unknown as { rows: { n: number }[] }).rows[0]!.n);

describe("data retention", () => {
  it("keeps a linked account's games and deletes old match data no account uses", async () => {
    const { res } = await call("/auth/dev-login", { method: "POST", body: JSON.stringify({ displayName: "Keeper" }) });
    const cookie = res.headers.get("set-cookie")!.split(";")[0]!;
    const acc = await call("/accounts", { method: "POST", cookie, body: JSON.stringify({ gameName: "Keeper", tagLine: "EUW", platform: "euw1" }) });
    await ctx.sync.start(acc.body.account.id);
    const linked = await count("account_matches");
    expect(linked).toBeGreaterThan(0);

    // A rival's game fetched for scouting long ago, used by no account.
    const old = new Date(Date.now() - (UNLINKED_MATCH_TTL_DAYS + 1) * 86_400_000);
    await database.db.insert(schema.rawMatches).values({ matchId: "EUW1_SCOUTED", platform: "euw1", source: "synthetic", payload: {}, fetchedAt: old });
    await database.db.insert(schema.matchAnalyses).values({ matchId: "EUW1_SCOUTED", puuid: "rival", analysisVersion: 1, data: {}, createdAt: old });
    // And a recent one: still within the window.
    await database.db.insert(schema.rawMatches).values({ matchId: "EUW1_RECENT", platform: "euw1", source: "synthetic", payload: {} });
    // Everything else looks old too, but belongs to the linked account.
    await database.db.update(schema.rawMatches).set({ fetchedAt: old }).where(sql`match_id <> 'EUW1_RECENT'`);
    await database.db.update(schema.matchAnalyses).set({ createdAt: old });

    const before = await count("raw_matches");
    await purgeUnlinkedMatches(database.db);
    expect(await count("raw_matches")).toBe(before - 1);
    expect(await database.db.select().from(schema.rawMatches).where(eq(schema.rawMatches.matchId, "EUW1_SCOUTED"))).toHaveLength(0);
    expect(await database.db.select().from(schema.rawMatches).where(eq(schema.rawMatches.matchId, "EUW1_RECENT"))).toHaveLength(1);
    expect(await count("account_matches")).toBe(linked);
    expect((await call("/matches?limit=5", { cookie })).body.matches.length).toBeGreaterThan(0);

    // Unlinking the account removes its analyses at once and lets its games age out.
    await call(`/accounts/${acc.body.account.id}`, { method: "DELETE", cookie });
    expect(await count("match_analyses")).toBe(0);
    await purgeUnlinkedMatches(database.db);
    expect(await count("raw_matches")).toBe(1);
  }, 60_000);

  it("deleting everything also deletes the player's analyses", async () => {
    const { res } = await call("/auth/dev-login", { method: "POST", body: JSON.stringify({ displayName: "Leaver" }) });
    const cookie = res.headers.get("set-cookie")!.split(";")[0]!;
    const acc = await call("/accounts", { method: "POST", cookie, body: JSON.stringify({ gameName: "Leaver", tagLine: "EUW", platform: "euw1" }) });
    await ctx.sync.start(acc.body.account.id);
    expect(await count("match_analyses")).toBeGreaterThan(0);
    expect((await call("/me", { method: "DELETE", cookie })).res.status).toBe(200);
    expect(await count("match_analyses")).toBe(0);
    expect(await count("riot_accounts")).toBe(0);
  }, 60_000);
});
