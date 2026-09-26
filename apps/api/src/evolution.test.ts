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

describe("evolution", () => {
  it("returns inflections, anomalies, timeline and adaptability, all hedged", async () => {
    const cookie = await player("Evolver");
    const { body } = await call("/evolution", { cookie });
    expect(body.games).toBeGreaterThan(20);
    expect(Array.isArray(body.timeline)).toBe(true);
    for (const inf of body.inflections) expect(["observation", "hypothesis"]).toContain(inf.kind);
    for (const a of body.adaptation.byOpponentClass) expect(a.kind).toBe("hypothesis");
    for (const an of body.anomalies) expect(["variance", "possible_change"]).toContain(an.verdict);
  }, 60_000);
});

describe("decision history", () => {
  it("records decisions and shows outcomes with a no-causality note", async () => {
    const cookie = await player("Historian");
    await call("/goals", { method: "POST", cookie, body: JSON.stringify({ metric: "deathsPerMin", source: "coach" }) });
    await call("/goals/reject", { method: "POST", cookie, body: JSON.stringify({ metric: "visionPerMin" }) });
    await call("/coach/feedback", { method: "POST", cookie, body: JSON.stringify({ insightId: "early-deaths", title: "Muertes tempranas" }) });
    await call("/draft", { method: "POST", cookie, body: JSON.stringify({ myChampion: "Aurelith", enemies: ["Korvane"] }) });

    const { body } = await call("/history", { cookie });
    expect(body.note).toMatch(/does not prove/);
    const decisions = body.items.map((i: any) => i.decision).sort();
    expect(decisions).toEqual(["accepted", "dismissed", "none", "rejected"]);
    const accepted = body.items.find((i: any) => i.decision === "accepted");
    expect(accepted.outcome).toMatch(/games/);

    const other = await player("OtherHistorian");
    expect((await call("/history", { cookie: other })).body.items).toHaveLength(0);

    await call("/history", { method: "DELETE", cookie });
    expect((await call("/history", { cookie })).body.items).toHaveLength(0);
  }, 60_000);
});
