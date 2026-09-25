import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { syntheticSource as syntheticKnowledge } from "@coach/knowledge";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { openDatabase, schema, type Database } from "./db/index.js";
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

async function call(path: string, init: RequestInit & { cookie?: string; ip?: string } = {}) {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  if (init.cookie) headers.set("Cookie", init.cookie);
  headers.set("X-Forwarded-For", init.ip ?? "10.0.0.1");
  const res = await ctx.app.request(`/api${path}`, { ...init, headers });
  return { res, body: (await res.json()) as any };
}

async function player(name: string) {
  const { res } = await call("/auth/dev-login", { method: "POST", body: JSON.stringify({ displayName: name }) });
  const cookie = res.headers.get("set-cookie")!.split(";")[0]!;
  await call("/accounts", { method: "POST", cookie, body: JSON.stringify({ gameName: name, tagLine: "EUW", platform: "euw1" }) });
  return cookie;
}

const claim = (code: string, ip = "10.0.0.1") => call("/desktop/claim", { method: "POST", ip, body: JSON.stringify({ code, label: "PC de prueba" }) });
const scout = (token: string) => call("/desktop/scout", { headers: { Authorization: `Bearer ${token}` } });

describe("desktop pairing", () => {
  it("pairs with a one-time code, scouts with the device token and can be revoked", async () => {
    const cookie = await player("DeskPlayer");
    expect((await call("/desktop/pair", { method: "POST", body: "{}" })).res.status).toBe(401);

    const pair = await call("/desktop/pair", { method: "POST", cookie, body: "{}" });
    expect(pair.res.status).toBe(201);
    expect(pair.body.code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);

    // Lower-case and without the dash still works (people type it by hand).
    const c = await claim(pair.body.code.toLowerCase().replace("-", ""));
    expect(c.res.status).toBe(200);
    const token = c.body.token as string;
    expect(token.length).toBeGreaterThan(30);

    // Single use.
    expect((await claim(pair.body.code)).res.status).toBe(401);

    // Only hashes are stored.
    const rows = await database.db.select().from(schema.deviceLinks);
    expect(JSON.stringify(rows)).not.toContain(token);
    expect(JSON.stringify(rows)).not.toContain(pair.body.code);

    const s = await scout(token);
    expect(s.res.status).toBe(200);
    expect(s.body).toHaveProperty("inGame");
    expect(s.body.assets).toEqual({ cdn: null, version: expect.any(String) });

    // The token only opens /desktop/scout, never the web session routes.
    expect((await call("/me", { headers: { Authorization: `Bearer ${token}` } })).res.status).toBe(401);

    const devices = await call("/desktop/devices", { cookie });
    expect(devices.body.devices).toHaveLength(1);
    expect(devices.body.devices[0].label).toBe("PC de prueba");
    expect(devices.body.devices[0].lastUsedAt).toBeTruthy();

    // Another player cannot revoke it.
    const other = await player("DeskOther");
    expect((await call(`/desktop/devices/${devices.body.devices[0].id}`, { method: "DELETE", cookie: other })).res.status).toBe(404);

    expect((await call(`/desktop/devices/${devices.body.devices[0].id}`, { method: "DELETE", cookie })).res.status).toBe(200);
    expect((await scout(token)).res.status).toBe(401);
    expect((await call("/desktop/devices", { cookie })).body.devices).toHaveLength(0);
  }, 60_000);

  it("gives the player's own build with a champion, from their history only", async () => {
    const cookie = await player("DeskBuilder");
    const me = await call("/me", { cookie });
    await ctx.sync.start(me.body.accounts[0].id);
    const pair = await call("/desktop/pair", { method: "POST", cookie, body: "{}" });
    const token = (await claim(pair.body.code, "10.0.0.3")).body.token as string;
    const auth = { Authorization: `Bearer ${token}` };

    // The champion this player has played most on Summoner's Rift.
    const matches = (await call("/matches?mode=summoners_rift&limit=100", { cookie })).body.matches as { championName: string }[];
    const counts = new Map<string, number>();
    for (const m of matches) counts.set(m.championName, (counts.get(m.championName) ?? 0) + 1);
    const [main, played] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]!;

    const build = await call(`/desktop/build?champion=${main}&mode=summoners_rift`, { headers: auth });
    expect(build.res.status).toBe(200);
    expect(build.body.games).toBe(played);
    expect(played).toBeGreaterThanOrEqual(3);
    expect(build.body.items.length).toBeGreaterThan(0);
    for (const i of build.body.items) {
      expect(i.games).toBeGreaterThanOrEqual(2);
      expect(i.games).toBeLessThanOrEqual(played);
      expect(i.wins).toBeLessThanOrEqual(i.games);
    }

    const none = await call("/desktop/build?champion=NoSuchChampion&mode=summoners_rift", { headers: auth });
    expect(none.body).toMatchObject({ games: 0, items: [] });
    expect(none.body.note).toContain("Aún no tienes partidas");

    expect((await call("/desktop/build?champion=../x&mode=summoners_rift", { headers: auth })).res.status).toBe(400);
    expect((await call(`/desktop/build?champion=${main}&mode=summoners_rift`)).res.status).toBe(401);
  }, 60_000);

  it("rejects wrong, expired and malformed codes and tokens", async () => {
    const cookie = await player("DeskExpired");
    const pair = await call("/desktop/pair", { method: "POST", cookie, body: "{}" });
    await database.db.update(schema.deviceLinks).set({ codeExpiresAt: new Date(Date.now() - 1000) });
    expect((await claim(pair.body.code, "10.0.0.2")).res.status).toBe(401);
    expect((await claim("ZZZZ-ZZZZ", "10.0.0.2")).res.status).toBe(401);
    expect((await call("/desktop/claim", { method: "POST", ip: "10.0.0.2", body: "{}" })).res.status).toBe(400);
    expect((await scout("not-a-real-token-but-long-enough")).res.status).toBe(401);
    expect((await call("/desktop/scout")).res.status).toBe(401);
  });

  it("rate-limits code guessing per address", async () => {
    let last = 0;
    for (let i = 0; i < 11; i++) last = (await claim("AAAA-AAAA", "10.9.9.9")).res.status;
    expect(last).toBe(429);
    // A forged left-most X-Forwarded-For entry does not reset the limit.
    expect((await claim("AAAA-AAAA", "1.2.3.4, 10.9.9.9")).res.status).toBe(429);
  });
});
