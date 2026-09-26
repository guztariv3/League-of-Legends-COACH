import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { syntheticSource as syntheticKnowledge } from "@coach/knowledge";
import type { RiotLeagueEntry } from "@coach/riot";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { openDatabase, type Database } from "./db/index.js";
import { bootKnowledge } from "./knowledge.js";
import { ladderPoints, rankHistory } from "./rank.js";
import { syntheticSource } from "./sources.js";

describe("ladder points", () => {
  it("puts every division on one scale, with Master+ sharing a base", () => {
    expect(ladderPoints("GOLD", "IV", 0)).toBe(1200);
    expect(ladderPoints("GOLD", "I", 99)! - ladderPoints("PLATINUM", "IV", 0)!).toBe(-1);
    expect(ladderPoints("MASTER", "I", 50)).toBe(ladderPoints("CHALLENGER", "I", 50));
    expect(ladderPoints("WOOD", "I", 10)).toBeNull();
  });

  it("shows the LP change only for single-game steps, across promotions", () => {
    const row = (tier: string, rank: string, lp: number, wins: number, losses: number, minute: number) =>
      ({ id: `${minute}`, accountId: "a", queueType: "RANKED_SOLO_5x5", tier, rank, lp, wins, losses, takenAt: new Date(minute * 60_000) });
    const h = rankHistory([
      row("SILVER", "I", 80, 10, 10, 0),
      row("GOLD", "IV", 0, 11, 10, 1), // promoted: +20
      row("SILVER", "I", 78, 11, 11, 2), // demoted: −22
      row("SILVER", "I", 60, 12, 13, 3), // two games in between: unknown
    ]);
    expect(h.map((p) => p.lpChange)).toEqual([null, 20, -22, null]);
  });
});

describe("rank snapshots", () => {
  let database: Database;
  let ctx: ReturnType<typeof createApp>;
  let entries: RiotLeagueEntry[] = [];

  beforeAll(async () => {
    database = await openDatabase(undefined, undefined);
    const knowledge = await bootKnowledge(database.db, syntheticKnowledge());
    const source = Object.assign(syntheticSource(() => Date.UTC(2026, 5, 1)), { leagueEntries: async () => entries });
    ctx = createApp({ cfg: loadConfig({ NODE_ENV: "test" }), db: database.db, source, knowledge, aiProviders: [] });
  }, 30_000);
  afterAll(() => database.close());

  async function call(path: string, init: RequestInit & { cookie?: string } = {}) {
    const headers = new Headers(init.headers);
    if (init.body) headers.set("Content-Type", "application/json");
    if (init.cookie) headers.set("Cookie", init.cookie);
    const res = await ctx.app.request(`/api${path}`, { ...init, headers });
    return { res, body: (await res.json()) as any };
  }

  it("records rank after a sync only when it changed, and serves the history", async () => {
    const { res } = await call("/auth/dev-login", { method: "POST", body: JSON.stringify({ displayName: "Climber" }) });
    const cookie = res.headers.get("set-cookie")!.split(";")[0]!;
    const { body: created } = await call("/accounts", { method: "POST", cookie, body: JSON.stringify({ gameName: "Climber", tagLine: "NA1", platform: "na1" }) });
    const id = created.account.id;

    entries = [
      { queueType: "RANKED_SOLO_5x5", tier: "SILVER", rank: "II", leaguePoints: 30, wins: 138, losses: 160 },
      { queueType: "CHERRY", wins: 3, losses: 1 },
    ];
    await ctx.sync.start(id);
    await ctx.sync.start(id); // nothing changed: no new row
    entries = [{ queueType: "RANKED_SOLO_5x5", tier: "SILVER", rank: "II", leaguePoints: 51, wins: 139, losses: 160 }];
    await ctx.sync.start(id);

    const { body } = await call("/rank", { cookie });
    const solo = body.accounts[0].queues.find((q: any) => q.queueType === "RANKED_SOLO_5x5");
    expect(body.accounts[0].queues).toHaveLength(1);
    expect(solo.history).toHaveLength(2);
    expect(solo.current).toMatchObject({ tier: "SILVER", rank: "II", lp: 51, lpChange: 21 });
  }, 60_000);

  it("keeps syncing when the rank lookup fails", async () => {
    const { res } = await call("/auth/dev-login", { method: "POST", body: JSON.stringify({ displayName: "Offline" }) });
    const cookie = res.headers.get("set-cookie")!.split(";")[0]!;
    const { body: created } = await call("/accounts", { method: "POST", cookie, body: JSON.stringify({ gameName: "Offline", tagLine: "NA1", platform: "na1" }) });
    entries = null as unknown as RiotLeagueEntry[]; // a malformed answer makes recordRank throw internally
    await ctx.sync.start(created.account.id);
    const { body } = await call("/me", { cookie });
    expect(body.accounts[0].sync.status).toBe("ok");
  }, 60_000);
});
