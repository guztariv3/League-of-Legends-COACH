import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";

export { schema };

/** Both drivers expose the same query builder; typed as the node-postgres flavour. */
export type Db = NodePgDatabase<typeof schema>;

interface RawExec {
  exec(sql: string): Promise<unknown>;
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
  close(): Promise<void>;
}

export interface Database {
  db: Db;
  close(): Promise<void>;
}

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "migrations");

async function migrate(raw: RawExec): Promise<void> {
  await raw.exec("CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
  const applied = new Set(
    (await raw.query("SELECT name FROM schema_migrations")).rows.map((r) => (r as { name: string }).name),
  );
  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort()) {
    if (applied.has(file)) continue;
    await raw.exec(`BEGIN;\n${readFileSync(join(MIGRATIONS_DIR, file), "utf8")}\nINSERT INTO schema_migrations (name) VALUES ('${file}');\nCOMMIT;`);
  }
}

/**
 * DATABASE_URL (postgres://…) → real Postgres. Otherwise embedded PGlite:
 * a data directory for local development, or in-memory for tests.
 */
export async function openDatabase(url?: string, pgliteDir?: string): Promise<Database> {
  if (url) {
    const pool = new pg.Pool({ connectionString: url });
    await migrate({
      exec: async (sql) => { await pool.query(sql); },
      query: (sql, params) => pool.query(sql, params as unknown[]),
      close: () => pool.end(),
    });
    return { db: drizzlePg(pool, { schema }), close: () => pool.end() };
  }
  const client = new PGlite(pgliteDir);
  await migrate({
    exec: async (sql) => { await client.exec(sql); },
    query: (sql, params) => client.query(sql, params as unknown[]),
    close: () => client.close(),
  });
  return { db: drizzlePglite(client, { schema }) as unknown as Db, close: () => client.close() };
}
