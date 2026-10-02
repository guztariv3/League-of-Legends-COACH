import { afterAll, beforeAll, expect, it } from "vitest";
import { syntheticSource as syntheticKnowledge } from "@coach/knowledge";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { openDatabase, type Database } from "./db/index.js";
import { bootKnowledge } from "./knowledge.js";
import { syntheticSource } from "./sources.js";
import { AttemptLimiter } from "./limits.js";

let database: Database;
let app: ReturnType<typeof createApp>["app"];
beforeAll(async () => {
  database = await openDatabase(process.env.BACKFILL_TEST_DATABASE_URL, undefined);
  const knowledge = await bootKnowledge(database.db, syntheticKnowledge());
  app = createApp({ cfg: loadConfig({ NODE_ENV: "test" }), db: database.db, source: syntheticSource(), knowledge, aiProviders: [] }).app;
}, 30_000);
afterAll(() => database.close());
async function user() {
  const r = await app.request("/api/auth/dev-login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName: crypto.randomUUID(), token: "a".repeat(64) }) });
  expect(r.status).toBe(200);
  return r.headers.get("set-cookie")!.split(";")[0]!;
}
function call(cookie: string, path: string, method: string, data?: unknown) {
  return app.request(`/api${path}`, { method, headers: { Cookie: cookie, "Content-Type": "application/json" }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
}
it("preserves concurrent partial preferences, including the first insert", async () => {
  const cookie = await user();
  const rs = await Promise.all([
    call(cookie, "/preferences", "PUT", { level: "expert", memory: { focus: false } }),
    call(cookie, "/preferences", "PUT", { language: "es", memory: { patterns: false } }),
  ]);
  expect(rs.map(r => r.status)).toEqual([200, 200]);
  const me = await (await call(cookie, "/me", "GET")).json();
  expect(me.preferences).toMatchObject({ level: "expert", language: "es", memory: { focus: false, patterns: false, note: true } });
});
it("never exceeds three active goals under concurrent requests", async () => {
  const cookie = await user();
  const rs = await Promise.all(Array.from({ length: 8 }, () => call(cookie, "/goals", "POST", { metric: "deathsPerMin", target: 0.2 })));
  expect(rs.filter(r => r.status === 201)).toHaveLength(3);
  expect(rs.filter(r => r.status === 409)).toHaveLength(5);
  const data = await (await call(cookie, "/goals", "GET")).json();
  expect(data.goals).toHaveLength(3);
});
it("limits costly pairing operations per user without blocking live reads or another user", async () => {
  const a = await user(), b = await user();
  for (let i = 0; i < 20; i++) expect((await call(a, "/desktop/pair", "POST", {})).status).toBe(201);
  const limited = await call(a, "/desktop/pair", "POST", {});
  expect(limited.status).toBe(429);
  expect(limited.headers.get("retry-after")).toBe("60");
  expect((await call(a, "/live", "GET")).status).toBe(200);
  expect((await call(b, "/desktop/pair", "POST", {})).status).toBe(201);
});
it("rejects oversized bodies before parsing", async () => {
  expect((await call(await user(), "/preferences", "PUT", { padding: "x".repeat(100_000) })).status).toBe(413);
});
it("bounds limiter memory without evicting active counters and recovers after expiry", () => {
  const l = new AttemptLimiter(2, 1000, 2);
  expect(l.allow("a", 0)).toBe(true);
  expect(l.allow("a", 1)).toBe(true);
  expect(l.allow("a", 2)).toBe(false);
  expect(l.allow("b", 3)).toBe(true);
  expect(l.allow("c", 4)).toBe(false);
  expect(l.allow("a", 5)).toBe(false);
  expect(l.allow("c", 1000)).toBe(true);
  expect(l.allow("b", 1000)).toBe(true);
});
