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
  /** Development login must be switched on explicitly (DEV_LOGIN=1); it is never available in production. */
  devLogin: boolean;
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
    devLogin: mode !== "production" && (env.DEV_LOGIN === "1" || mode === "test"),
  };
}

export type DataSource = "riot" | "synthetic";

export function dataSource(cfg: Config): DataSource {
  return cfg.riotApiKey ? "riot" : "synthetic";
}

/**
 * Decision D-01: until RSO is approved, the only login is the development
 * login. It is opt-in (DEV_LOGIN=1) and always refused in production, so a
 * deployment that forgets NODE_ENV does not open it by accident.
 */
export function devLoginAllowed(cfg: Config): boolean {
  return cfg.devLogin && cfg.env !== "production";
}
