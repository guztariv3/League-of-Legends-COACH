import { mkdirSync } from "node:fs";
import { serve } from "@hono/node-server";
import { anthropicProvider, type AiProvider } from "@coach/ai";
import { dataDragonSource, syntheticSource as syntheticKnowledge } from "@coach/knowledge";
import { RiotClient } from "@coach/riot";
import { createApp } from "./app.js";
import { dataSource, loadConfig } from "./config.js";
import { openDatabase } from "./db/index.js";
import { bootKnowledge } from "./knowledge.js";
import { riotSource, syntheticSource } from "./sources.js";

const cfg = loadConfig();
if (cfg.pgliteDir && !cfg.databaseUrl) mkdirSync(cfg.pgliteDir, { recursive: true });
const { db } = await openDatabase(cfg.databaseUrl, cfg.pgliteDir);

const mode = dataSource(cfg);
const source = mode === "riot" ? riotSource(new RiotClient({ apiKey: cfg.riotApiKey! })) : syntheticSource();
const knowledge = await bootKnowledge(db, mode === "riot" ? dataDragonSource() : syntheticKnowledge());
const aiProviders: AiProvider[] = cfg.anthropicApiKey
  ? [anthropicProvider({ apiKey: cfg.anthropicApiKey, model: cfg.aiModel })]
  : [];

const { app } = createApp({ cfg, db, source, knowledge, aiProviders });
serve({ fetch: app.fetch, port: cfg.port });
console.log(`[api] listening on :${cfg.port} · data=${mode} · ai=${aiProviders.length ? "on" : "off"} · knowledge=${knowledge.active()?.version ?? "none"}`);
