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
