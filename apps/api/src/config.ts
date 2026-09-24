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
    webOrigin: env.WEB_ORIGIN ?? "http://localhost:5173",
  };
}

export type DataSource = "riot" | "synthetic";

export function dataSource(cfg: Config): DataSource {
  return cfg.riotApiKey ? "riot" : "synthetic";
}

/**
 * Decision D-01: until RSO is approved, the only login is the development
 * login, and it is refused in production.
 */
export function devLoginAllowed(cfg: Config): boolean {
  return cfg.env !== "production";
}
