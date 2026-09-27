import { mkdirSync } from "node:fs";
import { serve } from "@hono/node-server";
import { anthropicProvider, type AiProvider } from "@coach/ai";
import { dataDragonSource, gameFactsSource, syntheticSource as syntheticKnowledge, wikiSource } from "@coach/knowledge";
import { RiotClient } from "@coach/riot";
import { createSite } from "./site.js";
import { dataSource, loadConfig } from "./config.js";
import { openDatabase } from "./db/index.js";
import { bootKnowledge } from "./knowledge.js";
import { riotSource, syntheticSource } from "./sources.js";
import { scheduleRetention } from "./retention.js";
import { patchInfoOf, StatsCrawler } from "./stats/crawler.js";

const cfg = loadConfig();
if (cfg.pgliteDir && !cfg.databaseUrl) mkdirSync(cfg.pgliteDir, { recursive: true });
const { db } = await openDatabase(cfg.databaseUrl, cfg.pgliteDir);

const mode = dataSource(cfg);
const riot = mode === "riot" ? new RiotClient({ apiKey: cfg.riotApiKey! }) : undefined;
const source = riot ? riotSource(riot) : syntheticSource();
const knowledge = await bootKnowledge(db, mode === "riot" ? dataDragonSource() : syntheticKnowledge());
const aiProviders: AiProvider[] = cfg.anthropicApiKey
  ? [anthropicProvider({ apiKey: cfg.anthropicApiKey, model: cfg.aiModel })]
  : [];

// League of Legends Wiki data (Meraki, D-15): only with real game data; warmed in the background.
const wiki = mode === "riot" ? wikiSource() : undefined;
void wiki?.get();
// Full item and champion facts for the build engine (Data Dragon + Meraki), for the active patch.
const gameFacts = mode === "riot" ? gameFactsSource({ version: () => knowledge.active()?.version ?? null }) : undefined;
void gameFacts?.get();
const { site, sync } = createSite({ cfg, db, source, knowledge, aiProviders, wiki, gameFacts });
// After an ANALYSIS_VERSION bump, rebuild analyses from stored games in the background.
void sync.reanalyzeAll().then((n) => n && console.log(`[sync] analyses up to date for ${n} account(s)`));
scheduleRetention(db);
// Phase 4: Master+ statistics from the official Riot API (counters only), slowly, in the background.
if (cfg.statsCrawl && riot && gameFacts && cfg.statsPlatforms.length) {
  new StatsCrawler({ db, riot, platforms: cfg.statsPlatforms, patch: async () => { const f = await gameFacts.get(0); return f ? patchInfoOf(f) : null; } })
    .start(cfg.statsIntervalMs);
}
serve({ fetch: site.fetch, port: cfg.port });
console.log(
  `[api] listening on :${cfg.port} · env=${cfg.env} · data=${mode} · ai=${aiProviders.length ? `on (${cfg.aiModel ?? "claude-opus-5"})` : "off"}` +
    ` · web=${cfg.webDist ? "served" : "separate"} · gate=${cfg.prototypePassword ? "on" : "off"} · stats=${cfg.statsCrawl && riot ? cfg.statsPlatforms.join("+") : "off"} · knowledge=${knowledge.active()?.version ?? "none"}`,
);
