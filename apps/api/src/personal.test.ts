import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { syntheticSource as syntheticKnowledge } from "@coach/knowledge";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { openDatabase, type Database } from "./db/index.js";
import { bootKnowledge } from "./knowledge.js";
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

async function player(name: string) {
  const { res } = await call("/auth/dev-login", { method: "POST", body: JSON.stringify({ displayName: name }) });
  const cookie = res.headers.get("set-cookie")!.split(";")[0]!;
  const { body } = await call("/accounts", { method: "POST", cookie, body: JSON.stringify({ gameName: name, tagLine: "EUW", platform: "euw1" }) });
  await ctx.sync.start(body.account.id);
  return cookie;
}

describe("profile", () => {
  it("returns dimensions per mode and a game-state split without an overall score", async () => {
    const cookie = await player("Profiler");
    const { body } = await call("/profile", { cookie });
    expect(body.profiles.length).toBeGreaterThan(0);
    expect(body.gameState.map((b: any) => b.state)).toEqual(["ahead", "even", "behind"]);
    expect(JSON.stringify(body)).not.toMatch(/"score"/);
  }, 60_000);
});

describe("goals", () => {
  it("creates measurable goals, caps them at 3 and tracks progress", async () => {
    const cookie = await player("Goaler");
    for (const metric of ["deathsPerMin", "killParticipation", "earlyDeaths"]) {
      const r = await call("/goals", { method: "POST", cookie, body: JSON.stringify({ metric }) });
      expect(r.res.status).toBe(201);
    }
    const fourth = await call("/goals", { method: "POST", cookie, body: JSON.stringify({ metric: "visionPerMin" }) });
    expect(fourth.res.status).toBe(409);

    const list = await call("/goals", { cookie });
    expect(list.body.goals).toHaveLength(3);
    expect(list.body.suggestions).toHaveLength(0); // no room for more
    // Games before acceptance don't count as progress.
    expect(list.body.goals[0].progress.status).toBe("collecting");

    await call(`/goals/${list.body.goals[0].id}`, { method: "PATCH", cookie, body: JSON.stringify({ status: "archived" }) });
    expect((await call("/goals", { cookie })).body.goals).toHaveLength(2);
  }, 60_000);

  it("does not re-suggest a rejected goal", async () => {
    const cookie = await player("Rejecter");
    const first = await call("/goals", { cookie });
    const s = first.body.suggestions[0];
    if (!s) return; // nothing important enough to suggest for this synthetic player
    await call("/goals/reject", { method: "POST", cookie, body: JSON.stringify({ metric: s.metric }) });
    const after = await call("/goals", { cookie });
    expect(after.body.suggestions.map((x: any) => x.metric)).not.toContain(s.metric);
  }, 60_000);

  it("isolates goals between users", async () => {
    const a = await player("GoalA");
    const { body } = await call("/goals", { method: "POST", cookie: a, body: JSON.stringify({ metric: "deathsPerMin" }) });
    const b = await player("GoalB");
    expect((await call(`/goals/${body.goal.id}`, { method: "DELETE", cookie: b })).res.status).toBe(404);
  }, 60_000);
});

describe("Coach memory", () => {
  it("stores focus (one at a time), notes and corrections, and honours them", async () => {
    const cookie = await player("Memo");
    await call("/memory", { method: "POST", cookie, body: JSON.stringify({ category: "focus", metric: "csPerMin" }) });
    await call("/memory", { method: "POST", cookie, body: JSON.stringify({ category: "focus", metric: "deathsPerMin" }) });
    await call("/memory", { method: "POST", cookie, body: JSON.stringify({ category: "note", content: "Juego con mando" }) });
    let mem = await call("/memory", { cookie });
    expect(mem.body.items.filter((i: any) => i.category === "focus")).toHaveLength(1);
    expect(mem.body.items.find((i: any) => i.category === "focus").ref).toBe("deathsPerMin");

    const dash = await call("/dashboard", { cookie });
    const first = dash.body.insights[0];
    if (first) {
      await call("/coach/feedback", { method: "POST", cookie, body: JSON.stringify({ insightId: first.id, title: first.title }) });
      const after = await call("/dashboard", { cookie });
      expect(after.body.insights.map((i: any) => i.id)).not.toContain(first.id);
    }

    // Disabling a category stops storing it; deleting a category removes it.
    await call("/preferences", { method: "PUT", cookie, body: JSON.stringify({ memory: { note: false } }) });
    expect((await call("/memory", { method: "POST", cookie, body: JSON.stringify({ category: "note", content: "x" }) })).res.status).toBe(409);
    expect((await call("/me", { cookie })).body.preferences.level).toBe("intermediate"); // partial update kept other prefs
    await call("/memory?category=correction", { method: "DELETE", cookie });
    mem = await call("/memory", { cookie });
    expect(mem.body.items.some((i: any) => i.category === "correction")).toBe(false);
  }, 60_000);
});

describe("search", () => {
  it("understands champions, matchups, 'last N' and topics — and only navigates", async () => {
    const cookie = await player("Searcher");
    const s = async (q: string) => (await call(`/search?q=${encodeURIComponent(q)}`, { cookie })).body.results as any[];

    const vs = await s("Aurelith vs Korvane");
    expect(vs[0]).toMatchObject({ type: "matchup", href: "/matches?champion=Aurelith&opponent=Korvane" });

    const last = await s("mis últimas 10 partidas con Aurelith");
    expect(last.find((r) => r.type === "matches").href).toBe("/matches?champion=Aurelith&limit=10");

    const lane = await s("¿por qué pierdo la línea?");
    expect(lane.some((r) => r.type === "profile" && r.href === "/profile#lane")).toBe(true);

    expect(await s("x")).toEqual([]);
    for (const r of [...vs, ...last, ...lane]) expect(r.href.startsWith("/")).toBe(true);
  }, 60_000);
});

describe("champion detail", () => {
  it("returns the personal layer with hedged comparisons", async () => {
    const cookie = await player("Champer");
    const { body } = await call("/champions/Aurelith", { cookie });
    expect(body.champion.name).toBe("Aurelith");
    expect(body.personal.games).toBeGreaterThan(0);
    for (const cmp of body.personal.comparisons) expect(["better", "worse", "similar"]).toContain(cmp.verdict);
    expect((await call("/champions/NoSuchChamp", { cookie })).res.status).toBe(404);
  }, 60_000);
});
