import { afterAll, beforeAll, expect, it } from "vitest";
import { syntheticSource as syntheticKnowledge } from "@coach/knowledge";
import { RiotApiError } from "@coach/riot";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { openDatabase, type Database } from "./db/index.js";
import { bootKnowledge } from "./knowledge.js";
import { syntheticSource } from "./sources.js";

let database: Database;
let app: ReturnType<typeof createApp>["app"];
const ORIGIN = "http://localhost:5173";

beforeAll(async () => {
  database = await openDatabase(undefined, undefined);
  const cfg = { ...loadConfig({ NODE_ENV: "test" }), webOrigin: ORIGIN };
  const knowledge = await bootKnowledge(database.db, syntheticKnowledge());
  // A source whose Riot key is rejected, as when the key expired or was pasted wrongly.
  const source = { ...syntheticSource(), resolveAccount: async () => { throw new RiotApiError("Riot API key rejected (missing, invalid or expired)", 403, "auth"); } };
  app = createApp({ cfg, db: database.db, source, knowledge, aiProviders: [] }).app;
}, 30_000);

afterAll(async () => {
  await database.close();
});

it("tells the player when Riot rejects the API key instead of a generic server error", async () => {
  const json = { "Content-Type": "application/json" };
  const login = await app.request("/api/auth/dev-login", { method: "POST", headers: json, body: JSON.stringify({ displayName: "KeyTest" }) });
  const cookie = login.headers.get("set-cookie")!.split(";")[0]!;
  const res = await app.request("/api/accounts", {
    method: "POST",
    headers: { ...json, Cookie: cookie },
    body: JSON.stringify({ gameName: "GuzGuzR", tagLine: "NA1", platform: "na1" }),
  });
  expect(res.status).toBe(503);
  const body = (await res.json()) as { error: string; message: string };
  expect(body.error).toBe("riot_unavailable");
  expect(body.message).toContain("clave");
});
