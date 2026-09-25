import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { syntheticSource as syntheticKnowledge } from "@coach/knowledge";
import { RiotApiError } from "@coach/riot";
import { eq } from "drizzle-orm";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { openDatabase, schema, type Database } from "./db/index.js";
import { bootKnowledge } from "./knowledge.js";
import { syntheticSource, type MatchSource } from "./sources.js";

/**
 * Riot encrypts PUUIDs per API key. This source plays the server after a key change:
 * the old PUUID is rejected with a 400, the Riot ID resolves to a new PUUID, and
 * matches come back with the new one.
 */
function afterKeyChange(base: MatchSource): MatchSource {
  const renamed = (s: string) => `${s}-newkey`;
  const original = (s: string) => s.replace(/-newkey$/, "");
  const swap = <T>(value: T): T => JSON.parse(JSON.stringify(value).replace(/"(synthetic-[0-9a-f]+)"/g, (_m, id) => `"${renamed(id)}"`));
  return {
    ...base,
    async resolveAccount(platform, gameName, tagLine) {
      const acc = await base.resolveAccount(platform, gameName, tagLine);
      return acc && { ...acc, puuid: renamed(acc.puuid) };
    },
    async matchIds(platform, puuid, count, start, startTime) {
      if (!puuid.endsWith("-newkey")) throw new RiotApiError("Riot API 400 on match.ids", 400, "bad_request");
      return base.matchIds(platform, original(puuid), count, start, startTime);
    },
    match: async (platform, id) => swap(await base.match(platform, id)),
    timeline: async (platform, id) => swap(await base.timeline(platform, id)),
  };
}

let database: Database;
beforeAll(async () => { database = await openDatabase(undefined, undefined); }, 30_000);
afterAll(() => database.close());

describe("sync after the Riot API key changes", () => {
  it("renews the PUUID from the Riot ID and rebuilds the history", async () => {
    const knowledge = await bootKnowledge(database.db, syntheticKnowledge());
    const cfg = loadConfig({ NODE_ENV: "test" });
    const base = syntheticSource(() => Date.UTC(2026, 5, 1));
    const before = createApp({ cfg, db: database.db, source: base, knowledge, aiProviders: [] });

    const login = await before.app.request("/api/auth/dev-login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName: "KeySwap" }) });
    const cookie = login.headers.get("set-cookie")!.split(";")[0]!;
    const linked = await before.app.request("/api/accounts", { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ gameName: "KeySwap", tagLine: "EUW", platform: "euw1" }) });
    const accountId = ((await linked.json()) as { account: { id: string } }).account.id;
    await before.sync.start(accountId);
    const oldPuuid = (await database.db.select().from(schema.riotAccounts).where(eq(schema.riotAccounts.id, accountId)))[0]!.puuid;

    const after = createApp({ cfg, db: database.db, source: afterKeyChange(base), knowledge, aiProviders: [] });
    await after.sync.start(accountId);

    const [acc] = await database.db.select().from(schema.riotAccounts).where(eq(schema.riotAccounts.id, accountId));
    expect(acc!.puuid).toBe(`${oldPuuid}-newkey`);
    expect(acc!.syncStatus).toBe("ok");
    expect(await database.db.select().from(schema.matchAnalyses).where(eq(schema.matchAnalyses.puuid, oldPuuid))).toHaveLength(0);

    const res = await after.app.request("/api/matches?limit=5", { headers: { Cookie: cookie } });
    const { matches } = (await res.json()) as { matches: unknown[] };
    expect(matches.length).toBeGreaterThan(0);
  }, 60_000);
});
