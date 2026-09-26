import { boolean, doublePrecision, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/**
 * Data layers are kept separate (docs/02-arquitectura.md §5):
 * identity (users, sessions) · riot accounts · raw · derived (analyses) · knowledge · preferences.
 * Must match migrations/*.sql.
 */

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  displayName: text("display_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const riotAccounts = pgTable(
  "riot_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    puuid: text("puuid").notNull(),
    gameName: text("game_name").notNull(),
    tagLine: text("tag_line").notNull(),
    platform: text("platform").notNull(),
    /** true only when ownership was proven via RSO. */
    verified: boolean("verified").notNull().default(false),
    includeInProfile: boolean("include_in_profile").notNull().default(true),
    source: text("source").$type<"riot" | "synthetic">().notNull(),
    syncStatus: text("sync_status").$type<"never" | "syncing" | "ok" | "error">().notNull().default("never"),
    syncError: text("sync_error"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("riot_accounts_user_puuid").on(t.userId, t.puuid)],
);

export const rawMatches = pgTable("raw_matches", {
  matchId: text("match_id").primaryKey(),
  platform: text("platform").notNull(),
  source: text("source").$type<"riot" | "synthetic">().notNull(),
  payload: jsonb("payload").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
});

export const rawTimelines = pgTable("raw_timelines", {
  matchId: text("match_id").primaryKey(),
  payload: jsonb("payload").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
});

export const accountMatches = pgTable(
  "account_matches",
  {
    accountId: uuid("account_id").notNull().references(() => riotAccounts.id, { onDelete: "cascade" }),
    matchId: text("match_id").notNull().references(() => rawMatches.matchId),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.matchId] })],
);

export const matchAnalyses = pgTable(
  "match_analyses",
  {
    matchId: text("match_id").notNull().references(() => rawMatches.matchId),
    puuid: text("puuid").notNull(),
    analysisVersion: integer("analysis_version").notNull(),
    data: jsonb("data").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.matchId, t.puuid, t.analysisVersion] })],
);

export const knowledgeBundles = pgTable("knowledge_bundles", {
  version: text("version").primaryKey(),
  source: text("source").notNull(),
  status: text("status").notNull(),
  errors: jsonb("errors").notNull().default([]),
  payload: jsonb("payload").notNull(),
  installedAt: timestamp("installed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const preferences = pgTable("preferences", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  data: jsonb("data").notNull(),
});

/** Goals (brief §52). status: active | achieved | archived | rejected (rejected = declined suggestion). */
export const goals = pgTable("goals", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  metric: text("metric").notNull(),
  target: doublePrecision("target").notNull(),
  /** Share of pre-goal games that already met the target. */
  baselineRate: doublePrecision("baseline_rate").notNull(),
  status: text("status").$type<"active" | "achieved" | "archived" | "rejected">().notNull(),
  source: text("source").$type<"coach" | "user">().notNull(),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  /** When the goal was marked achieved or archived. */
  closedAt: timestamp("closed_at", { withTimezone: true }),
});

/** Coach memory (brief §48): small, categorised, fully user-controlled. */
export const coachMemory = pgTable("coach_memory", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  category: text("category").$type<"focus" | "correction" | "note">().notNull(),
  content: text("content").notNull(),
  /** Metric id (focus) or insight id (correction). */
  ref: text("ref"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Recommendation → context → player decision (brief §40, §79). Outcomes are
 * shown next to it later, but never as proof that following (or ignoring)
 * the recommendation caused them.
 */
export const recommendationLog = pgTable("recommendation_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").$type<"goal_suggestion" | "insight" | "draft">().notNull(),
  ref: text("ref"),
  title: text("title").notNull(),
  context: jsonb("context").notNull().default({}),
  decision: text("decision").$type<"accepted" | "rejected" | "dismissed" | "none">(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Desktop app pairing: a one-time code (10 min) is exchanged for a device token.
 * Only hashes are stored; a device can be revoked from the web at any time.
 */
export const deviceLinks = pgTable("device_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  label: text("label").notNull().default("App de escritorio"),
  codeHash: text("code_hash"),
  codeExpiresAt: timestamp("code_expires_at", { withTimezone: true }),
  tokenHash: text("token_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

/**
 * Rank and LP per ranked queue, recorded after each sync when anything changed.
 * Riot keeps no rank history, so this is the only source for LP graphs.
 */
export const rankSnapshots = pgTable("rank_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull().references(() => riotAccounts.id, { onDelete: "cascade" }),
  queueType: text("queue_type").notNull(),
  tier: text("tier").notNull(),
  rank: text("rank").notNull(),
  lp: integer("lp").notNull(),
  wins: integer("wins").notNull(),
  losses: integer("losses").notNull(),
  takenAt: timestamp("taken_at", { withTimezone: true }).notNull().defaultNow(),
});
