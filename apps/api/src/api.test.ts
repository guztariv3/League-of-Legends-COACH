import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fetchBundle, syntheticSource as syntheticKnowledge } from "@coach/knowledge";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { openDatabase, type Database } from "./db/index.js";
import { bootKnowledge } from "./knowledge.js";
import { syntheticSource } from "./sources.js";

let database: Database;
let ctx: ReturnType<typeof createApp>;
const ORIGIN = "http://localhost:5173";

beforeAll(async () => {
  database = await openDatabase(undefined, undefined);
  const cfg = { ...loadConfig({ NODE_ENV: "test" }), webOrigin: ORIGIN };
  const knowledge = await bootKnowledge(database.db, syntheticKnowledge());
  ctx = createApp({ cfg, db: database.db, source: syntheticSource(() => Date.UTC(2026, 5, 1)), knowledge, aiProviders: [] });
}, 30_000);

afterAll(async () => {
  await database.close();
});

async function call(path: string, init: RequestInit & { cookie?: string } = {}) {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  if (init.cookie) headers.set("Cookie", init.cookie);
  const res = await ctx.app.request(`/api${path}`, { ...init, headers });
  return { res, body: (await res.json()) as any };
}

async function login(name = "Tester") {
  const { res } = await call("/auth/dev-login", { method: "POST", body: JSON.stringify({ displayName: name }) });
  return res.headers.get("set-cookie")!.split(";")[0]!;
}

describe("API (synthetic mode)", () => {
  it("exposes config without auth and rejects anonymous access", async () => {
    const { body } = await call("/config");
    expect(body.dataSource).toBe("synthetic");
    expect(body.auth.rso).toBe(false);
    expect(body.knowledgeVersion).toContain("synthetic");
    expect((await call("/me")).res.status).toBe(401);
  });

  it("blocks cross-origin writes", async () => {
    const { res } = await call("/auth/dev-login", { method: "POST", body: "{}", headers: { Origin: "https://evil.example" } });
    expect(res.status).toBe(403);
  });

  it("runs onboarding: login → link account → sync 50 → dashboard", async () => {
    const cookie = await login();
    const bad = await call("/accounts", { method: "POST", cookie, body: JSON.stringify({ gameName: "Faker", tagLine: "KR1", platform: "zz9" }) });
    expect(bad.res.status).toBe(400);

    const created = await call("/accounts", { method: "POST", cookie, body: JSON.stringify({ gameName: "Tester", tagLine: "EUW", platform: "euw1" }) });
    expect(created.res.status).toBe(201);
    expect(created.body.account.verified).toBe(false);
    await ctx.sync.start(created.body.account.id);

    const me = await call("/me", { cookie });
    expect(me.body.accounts[0].sync.status).toBe("ok");

    const matches = await call("/matches?limit=100", { cookie });
    expect(matches.body.total).toBe(50);

    const dash = await call("/dashboard", { cookie });
    expect(dash.body.dataSource).toBe("synthetic");
    expect(dash.body.recent).toHaveLength(5);
    expect(dash.body.insights.length).toBeLessThanOrEqual(3);
    expect(dash.body.summary.analyzableGames).toBeGreaterThan(30);

    // Incremental sync does not duplicate games
    await ctx.sync.start(created.body.account.id);
    expect((await call("/matches?limit=100", { cookie })).body.total).toBe(50);
  }, 60_000);

  it("filters matches and returns a detail view with timeline data", async () => {
    const cookie = await login("Filter");
    const { body: acc } = await call("/accounts", { method: "POST", cookie, body: JSON.stringify({ gameName: "Filterer", tagLine: "EUW", platform: "euw1" }) });
    await ctx.sync.start(acc.account.id);

    const wins = await call("/matches?result=win&limit=100", { cookie });
    expect(wins.body.matches.every((m: any) => m.win)).toBe(true);
    const aram = await call("/matches?mode=aram&limit=100", { cookie });
    expect(aram.body.matches.every((m: any) => m.mode === "aram" && m.csPerMin === null)).toBe(true);

    const sr = (await call("/matches?mode=summoners_rift&limit=1", { cookie })).body.matches[0];
    const detail = await call(`/matches/${sr.matchId}`, { cookie });
    expect(detail.res.status).toBe(200);
    expect(detail.body.teams).toHaveLength(2);
    expect(detail.body.teams.flatMap((t: any) => t.players).filter((p: any) => p.isMe)).toHaveLength(1);
  }, 60_000);

  it("isolates users: no access to another user's matches or accounts", async () => {
    const a = await login("A");
    const { body } = await call("/accounts", { method: "POST", cookie: a, body: JSON.stringify({ gameName: "Owner", tagLine: "EUW", platform: "euw1" }) });
    await ctx.sync.start(body.account.id);
    const matchId = (await call("/matches?limit=1", { cookie: a })).body.matches[0].matchId;

    const b = await login("B");
    expect((await call(`/matches/${matchId}`, { cookie: b })).res.status).toBe(404);
    expect((await call(`/accounts/${body.account.id}`, { method: "DELETE", cookie: b })).res.status).toBe(404);
  }, 60_000);

  it("excluded accounts disappear from the profile, and data deletion works", async () => {
    const cookie = await login("Del");
    const { body } = await call("/accounts", { method: "POST", cookie, body: JSON.stringify({ gameName: "Deleter", tagLine: "EUW", platform: "euw1" }) });
    await ctx.sync.start(body.account.id);
    await call(`/accounts/${body.account.id}`, { method: "PATCH", cookie, body: JSON.stringify({ includeInProfile: false }) });
    expect((await call("/dashboard", { cookie })).body.summary.totalGames).toBe(0);

    expect((await call("/me", { method: "DELETE", cookie })).res.status).toBe(200);
    expect((await call("/me", { cookie })).res.status).toBe(401);
  }, 60_000);

  it("explains insights deterministically when no AI provider is configured", async () => {
    const cookie = await login("Coach");
    const { body } = await call("/accounts", { method: "POST", cookie, body: JSON.stringify({ gameName: "Coached", tagLine: "EUW", platform: "euw1" }) });
    await ctx.sync.start(body.account.id);
    const dash = await call("/dashboard", { cookie });
    const id = dash.body.insights[0]?.id ?? "unknown";
    const exp = await call("/coach/explain", { method: "POST", cookie, body: JSON.stringify({ insightId: id }) });
    expect(exp.body.source).toBe("deterministic");
    expect(exp.body.text.length).toBeGreaterThan(10);
  }, 60_000);

  it("keeps the active knowledge version when a newer bundle is broken", async () => {
    const good = await fetchBundle(syntheticKnowledge());
    const brokenSource = {
      ...syntheticKnowledge(),
      latestVersion: async () => "9.9.9-broken",
      championFile: async () => ({ version: "9.9.9-broken", data: {} }),
      itemFile: async () => ({ version: "9.9.9-broken", data: {} }),
    };
    const reg = await bootKnowledge(database.db, brokenSource);
    expect(reg.active()?.version).toBe(good.version);
  });
});
