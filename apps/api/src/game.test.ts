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
  it("scouts the (simulated) game in progress; without mastery/ranked data it says so and uses recent games", async () => {
    const cookie = await player("Scouter");
    const { body } = await call("/game/scout", { cookie });
    expect(body.inGame).toBe(true);
    expect(body.simulated).toBe(true);
    expect(body.enemies).toHaveLength(5);
    for (const e of body.enemies) {
      expect(e.games).toBeLessThanOrEqual(10);
      expect(typeof e.smallSample).toBe("boolean");
      expect(e.rankStatus).toBe("unavailable");
      expect(e.rank).toBeNull();
      expect(e.topChampions.length).toBeLessThanOrEqual(3);
      if (e.games) expect(e.topSource).toBe("recent");
    }
    expect(body.draft.keyPoints.length).toBeLessThanOrEqual(3);
  }, 60_000);

  it("shows ranked records and mastery top 3, and marks unranked / failing players honestly", async () => {
    const base = syntheticSource(() => Date.UTC(2026, 5, 1));
    let n = 0;
    const source = {
      ...base,
      topMasteries: async () => [9001, 9002, 9003].map((championId, i) => ({ championId, championLevel: 7, championPoints: 300000 - i * 1000 })),
      leagueEntries: async () => {
        const i = n++ % 3;
        if (i === 0) return [{ queueType: "RANKED_FLEX_SR", wins: 1, losses: 1 }, { queueType: "RANKED_SOLO_5x5", tier: "GOLD", rank: "II", leaguePoints: 40, wins: 30, losses: 25 }];
        if (i === 1) return [];
        throw new Error("403 from Riot");
      },
    };
    const knowledge = await bootKnowledge(database.db, syntheticKnowledge());
    const app = createApp({ cfg: loadConfig({ NODE_ENV: "test" }), db: database.db, source, knowledge, aiProviders: [] });
    const login = await app.app.request("/api/auth/dev-login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName: "RankScout" }) });
    const cookie = login.headers.get("set-cookie")!.split(";")[0]!;
    const acc = await app.app.request("/api/accounts", { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ gameName: "RankScout", tagLine: "EUW", platform: "euw1" }) });
    await app.sync.start(((await acc.json()) as any).account.id);
    const body = (await (await app.app.request("/api/game/scout", { headers: { Cookie: cookie } })).json()) as any;
    expect(body.inGame).toBe(true);
    const statuses = body.enemies.map((e: any) => e.rankStatus);
    expect(statuses).toContain("ranked");
    expect(statuses).toContain("unranked");
    expect(statuses).toContain("unavailable");
    const ranked = body.enemies.find((e: any) => e.rankStatus === "ranked");
    expect(ranked.rank).toEqual({ queue: "solo", tier: "GOLD", division: "II", lp: 40, wins: 30, losses: 25 });
    for (const e of body.enemies) {
      expect(e.topSource).toBe("mastery");
      expect(e.topChampions.map((c: any) => c.id)).toEqual(["Aurelith", "Korvane", "Brannoc"]);
      expect(e.topChampions[0].points).toBe(300000);
    }
  }, 60_000);
});

describe("scouting with several accounts", () => {
  it("finds the game on whichever linked account is playing", async () => {
    const base = syntheticSource(() => Date.UTC(2026, 5, 1));
    const playing = new Set<string>();
    // Only the account whose PUUID is in `playing` is in a game.
    const source = { ...base, activeGame: (platform: string, puuid: string) => (playing.has(puuid) ? base.activeGame(platform, puuid) : Promise.resolve(null)) };
    const knowledge = await bootKnowledge(database.db, syntheticKnowledge());
    const app = createApp({ cfg: loadConfig({ NODE_ENV: "test" }), db: database.db, source, knowledge, aiProviders: [] });
    const req = async (path: string, init: RequestInit & { cookie?: string } = {}) => {
      const headers = new Headers(init.headers);
      if (init.body) headers.set("Content-Type", "application/json");
      if (init.cookie) headers.set("Cookie", init.cookie);
      const res = await app.app.request(`/api${path}`, { ...init, headers });
      return (await res.json()) as any;
    };
    const login = await app.app.request("/api/auth/dev-login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName: "MultiScout" }) });
    const cookie = login.headers.get("set-cookie")!.split(";")[0]!;
    const a = await req("/accounts", { method: "POST", cookie, body: JSON.stringify({ gameName: "MainAcc", tagLine: "EUW", platform: "euw1" }) });
    const b = await req("/accounts", { method: "POST", cookie, body: JSON.stringify({ gameName: "SmurfAcc", tagLine: "EUW", platform: "euw1" }) });
    await app.sync.start(a.account.id);
    await app.sync.start(b.account.id);

    expect((await req("/game/scout", { cookie })).inGame).toBe(false);
    const puuid = (await base.resolveAccount("euw1", "SmurfAcc", "EUW"))!.puuid;
    playing.add(puuid);
    const res = await req("/game/scout", { cookie });
    expect(res.inGame).toBe(true);
    expect(res.account).toBe("SmurfAcc#EUW");
  }, 60_000);
});
