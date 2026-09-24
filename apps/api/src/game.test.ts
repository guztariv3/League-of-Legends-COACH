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

describe("match review", () => {
  it("reconstructs SR games and refuses others honestly", async () => {
    const cookie = await player("Reviewer");
    const sr = (await call("/matches?mode=summoners_rift&limit=1", { cookie })).body.matches[0];
    const r = await call(`/matches/${sr.matchId}/review`, { cookie });
    expect(r.body.available).toBe(true);
    expect(r.body.review.frames.length).toBeGreaterThan(10);
    expect(r.body.review.limits.length).toBeGreaterThan(0);

    const aram = (await call("/matches?mode=aram&limit=1", { cookie })).body.matches[0];
    if (aram) expect((await call(`/matches/${aram.matchId}/review`, { cookie })).body.available).toBe(false);

    const other = await player("OtherReviewer");
    expect((await call(`/matches/${sr.matchId}/review`, { cookie: other })).res.status).toBe(404);
  }, 60_000);
});

describe("draft", () => {
  it("analyses a manual draft with the player's own history", async () => {
    const cookie = await player("Drafter");
    const { body } = await call("/draft", {
      method: "POST", cookie,
      body: JSON.stringify({ myChampion: "Aurelith", allies: ["Brannoc", "Oshra", "Sylvaine", "Harrow"], enemies: ["Veyl", "Myrr", "Nimue", "Korvane", "Talgrim"], laneOpponent: "Korvane" }),
    });
    expect(body.keyPoints.length).toBeGreaterThan(0);
    expect(body.keyPoints.length).toBeLessThanOrEqual(3);
    expect(body.personal.withChampion.games).toBeGreaterThanOrEqual(0);
    expect((await call("/draft", { method: "POST", cookie, body: JSON.stringify({ allies: [] }) })).res.status).toBe(400);
  }, 60_000);
});

describe("scouting", () => {
  it("scouts the (simulated) game in progress with sample sizes and no rank", async () => {
    const cookie = await player("Scouter");
    const { body } = await call("/game/scout", { cookie });
    expect(body.inGame).toBe(true);
    expect(body.simulated).toBe(true);
    expect(body.enemies).toHaveLength(5);
    for (const e of body.enemies) {
      expect(e.games).toBeLessThanOrEqual(10);
      expect(typeof e.smallSample).toBe("boolean");
      expect(e).not.toHaveProperty("rank");
    }
    expect(body.draft.keyPoints.length).toBeLessThanOrEqual(3);
  }, 60_000);
});
