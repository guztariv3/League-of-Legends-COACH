import { isPlatformId } from "@coach/domain";

export interface Config {
  env: "development" | "test" | "production";
  port: number;
  databaseUrl?: string;
  pgliteDir?: string;
  /** Without a Riot key the app runs entirely on synthetic data. */
  riotApiKey?: string;
  anthropicApiKey?: string;
  aiModel?: string;
  /** Allowed browser origin for state-changing requests. */
  webOrigin: string;
  /** Development login must be switched on explicitly (DEV_LOGIN=1). */
  devLogin: boolean;
  /**
   * Shared password that gates the whole site (HTTP Basic auth). It is the only
   * way to open the development login in production, for the private prototype
   * that Riot's production-key review requires before RSO exists (D-01, D-08).
   */
  prototypePassword?: string;
  /** Built web app to serve from the same origin (production). */
  webDist?: string;
  /**
   * Phase 4: count Master+ solo-queue games through the Riot API into champion statistics.
   * On by default with a Riot key (STATS_CRAWL=0 turns it off); never with synthetic data.
   */
  statsCrawl: boolean;
  /** Platforms whose Master+ ladders are read (STATS_PLATFORMS=EUW1,KR,NA1). */
  statsPlatforms: string[];
  /** Milliseconds between two crawler steps; each step makes at most three Riot calls. */
  statsIntervalMs: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const mode = env.NODE_ENV === "production" ? "production" : env.NODE_ENV === "test" ? "test" : "development";
  return {
    env: mode,
    port: Number(env.PORT ?? 8787),
    databaseUrl: env.DATABASE_URL || undefined,
    pgliteDir: env.PGLITE_DIR || (mode === "development" ? ".data/pglite" : undefined),
    riotApiKey: env.RIOT_API_KEY || undefined,
    anthropicApiKey: env.ANTHROPIC_API_KEY || undefined,
    aiModel: env.AI_MODEL || undefined,
    // Render sets RENDER_EXTERNAL_URL for web services; used as the allowed origin when WEB_ORIGIN is not set.
    webOrigin: env.WEB_ORIGIN ?? env.RENDER_EXTERNAL_URL ?? "http://localhost:5173",
    devLogin: env.DEV_LOGIN === "1" || mode === "test",
    prototypePassword: env.PROTOTYPE_PASSWORD || undefined,
    webDist: env.WEB_DIST || undefined,
    statsCrawl: Boolean(env.RIOT_API_KEY) && env.STATS_CRAWL !== "0" && mode !== "test",
    statsPlatforms: (env.STATS_PLATFORMS || "EUW1,KR,NA1").split(",").map((p) => p.trim().toUpperCase()).filter(isPlatformId),
    statsIntervalMs: Math.max(1000, Number(env.STATS_INTERVAL_MS) || 3000),
  };
}

export type DataSource = "riot" | "synthetic";

export function dataSource(cfg: Config): DataSource {
  return cfg.riotApiKey ? "riot" : "synthetic";
}

/**
 * Decision D-01: until RSO is approved, the only login is the development
 * login. It is opt-in (DEV_LOGIN=1). In production it additionally requires
 * the whole site to be behind PROTOTYPE_PASSWORD, so a public deployment can
 * never expose it.
 */
export function devLoginAllowed(cfg: Config): boolean {
  if (!cfg.devLogin) return false;
  return cfg.env !== "production" || Boolean(cfg.prototypePassword && cfg.prototypePassword.length >= 12);
}
