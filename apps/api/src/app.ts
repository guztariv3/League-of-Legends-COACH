import { explainInsight, type AiProvider, type ExplanationLevel } from "@coach/ai";
import { mean, summarize } from "@coach/analysis";
import { isPlatformId, normalizeMatch, PLATFORMS, queueLabel, type RawMatch, type RawTimeline } from "@coach/domain";
import { gameAchievements, gameRanking, RANKING_EXPLANATION } from "@coach/coach";
import { MERAKI_ATTRIBUTION } from "@coach/knowledge";
import { matchHeadline } from "@coach/insights";
import type { KnowledgeRegistry, WikiSource } from "@coach/knowledge";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { createSession, csrfGuard, destroySession, requireUser, type AuthVars } from "./auth.js";
import { devLoginAllowed, type Config } from "./config.js";
import { schema, type Db } from "./db/index.js";
import { analysesFor, applyFilters, userAccounts, type AccountAnalysis } from "./queries.js";
import type { MatchSource } from "./sources.js";
import { riotFailure } from "./errors.js";
import { SyncService } from "./sync.js";
import { makeServices, Preferences } from "./services.js";
import { personalRoutes } from "./personal.js";
import { gameRoutes } from "./game.js";
import { forgetPlayers } from "./retention.js";
import { desktopDeviceRoutes, desktopSessionRoutes } from "./desktop.js";
import { evolutionRoutes } from "./evolution.js";
import { rankRoutes } from "./rank.js";
import { improveRoutes } from "./improve.js";

export interface AppDeps {
  cfg: Config;
  db: Db;
  source: MatchSource;
  knowledge: KnowledgeRegistry;
  aiProviders: AiProvider[];
  /** League of Legends Wiki data via Meraki (D-15); absent in tests and offline. */
  wiki?: WikiSource;
}



export function createApp(deps: AppDeps) {
  const { cfg, db, source, knowledge, wiki } = deps;
  const sync = new SyncService(db, source);
  const services = makeServices(db, source);
  const { prefsFor, profileAnalyses, insightsFor } = services;
  const app = new Hono<AuthVars>().basePath("/api");
  const secureCookies = cfg.env === "production";

  app.use("*", csrfGuard(cfg.webOrigin));
  app.onError((err, c) => {
    console.error(err);
    const riot = riotFailure(err);
    if (riot) return c.json({ error: "riot_unavailable", message: riot.message }, riot.status);
    return c.json({ error: "internal", message: "Something went wrong on the server. Please try again." }, 500);
  });

  // ------------------------------------------------------------ public

  app.get("/health", (c) => c.json({ ok: true }));

  app.get("/config", (c) =>
    c.json({
      dataSource: source.kind,
      auth: { rso: false, devLogin: devLoginAllowed(cfg) },
      aiEnabled: deps.aiProviders.length > 0,
      knowledgeVersion: knowledge.active()?.version ?? null,
      platforms: PLATFORMS.filter((p) => p.enabled).map((p) => ({ id: p.id, label: p.label })),
    }),
  );

  /**
   * Static game data for icons and splash art. Images come straight from Riot's Data Dragon CDN, so they
   * only exist for real bundles: the synthetic catalog (fictional champions) returns `cdn: null` and the
   * web falls back to lettered medallions.
   */
  app.get("/assets", (c) => {
    const b = knowledge.active();
    c.header("Cache-Control", "private, max-age=3600");
    return c.json({
      version: b?.version ?? null,
      cdn: b?.source === "ddragon" ? "https://ddragon.leagueoflegends.com" : null,
      champions: (b?.champions ?? []).map((ch) => ({ key: ch.key, id: ch.id, name: ch.name })),
      spells: (b?.spells ?? []).map((sp) => ({ key: sp.key, id: sp.id, name: sp.name })),
      runes: b?.runes ?? [],
      items: (b?.items ?? []).map((i) => ({ id: i.id, name: i.name })),
    });
  });

  app.post("/auth/dev-login", async (c) => {
    if (!devLoginAllowed(cfg)) return c.json({ error: "dev_login_disabled" }, 403);
    const body = z.object({ displayName: z.string().trim().min(1).max(40).default("Jugador") }).safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) return c.json({ error: "invalid_body" }, 400);
    // Development identity: same display name → same local user, so data survives logout.
    const [existing] = await db.select().from(schema.users).where(eq(schema.users.displayName, body.data.displayName));
    const [user] = existing ? [existing] : await db.insert(schema.users).values({ displayName: body.data.displayName }).returning();
    await createSession(db, c, user!.id, secureCookies);
    return c.json({ user: { id: user!.id, displayName: user!.displayName } });
  });

  app.post("/auth/logout", async (c) => {
    await destroySession(db, c);
    return c.json({ ok: true });
  });

  // ------------------------------------------------------------ authenticated

  const authed = new Hono<AuthVars>();
  authed.use("*", requireUser(db));

  const accountView = (a: Awaited<ReturnType<typeof userAccounts>>[number]) => ({
    id: a.id,
    riotId: `${a.gameName}#${a.tagLine}`,
    platform: a.platform,
    verified: a.verified,
    includeInProfile: a.includeInProfile,
    source: a.source,
    sync: { status: a.syncStatus, error: a.syncError, lastSyncedAt: a.lastSyncedAt, progress: sync.status(a.id) ?? null },
  });

  authed.get("/me", async (c) => {
    const userId = c.get("userId");
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
    const accounts = await userAccounts(db, userId);
    return c.json({ user: { id: user!.id, displayName: user!.displayName }, accounts: accounts.map(accountView), preferences: await prefsFor(userId) });
  });

  authed.delete("/me", async (c) => {
    // Deletes identity, accounts, links, preferences and sessions (cascade), then the analyses.
    const accounts = await db.select({ puuid: schema.riotAccounts.puuid }).from(schema.riotAccounts).where(eq(schema.riotAccounts.userId, c.get("userId")));
    await db.delete(schema.users).where(eq(schema.users.id, c.get("userId")));
    await forgetPlayers(db, accounts.map((a) => a.puuid));
    await destroySession(db, c);
    return c.json({ ok: true });
  });

  /** Partial update: only the fields sent are changed. */
  authed.put("/preferences", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== "object") return c.json({ error: "invalid_body" }, 400);
    const current = await prefsFor(c.get("userId"));
    const parsed = Preferences.safeParse({ ...current, ...body, memory: { ...current.memory, ...(body.memory ?? {}) } });
    if (!parsed.success) return c.json({ error: "invalid_body" }, 400);
    await db.insert(schema.preferences).values({ userId: c.get("userId"), data: parsed.data })
      .onConflictDoUpdate({ target: schema.preferences.userId, set: { data: parsed.data } });
    return c.json(parsed.data);
  });

  // accounts

  authed.post("/accounts", async (c) => {
    const parsed = z.object({
      gameName: z.string().trim().min(3).max(16),
      tagLine: z.string().trim().min(2).max(5),
      platform: z.string().refine(isPlatformId, "unsupported platform"),
    }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid_body", issues: parsed.error.issues.map((i) => i.message) }, 400);
    const { gameName, tagLine, platform } = parsed.data;

    const resolved = await source.resolveAccount(platform, gameName, tagLine);
    if (!resolved) return c.json({ error: "account_not_found", message: "We could not find that Riot ID in the selected region." }, 404);

    const userId = c.get("userId");
    const [existing] = await db.select().from(schema.riotAccounts)
      .where(and(eq(schema.riotAccounts.userId, userId), eq(schema.riotAccounts.puuid, resolved.puuid)));
    if (existing) return c.json({ account: accountView(existing) });

    const [account] = await db.insert(schema.riotAccounts).values({
      userId,
      puuid: resolved.puuid,
      gameName: resolved.gameName,
      tagLine: resolved.tagLine,
      platform,
      verified: false, // D-01: ownership is only proven once RSO is available
      source: source.kind,
    }).returning();
    await sync.markSyncing([account!.id]);
    void sync.start(account!.id);
    return c.json({ account: accountView({ ...account!, syncStatus: "syncing" }) }, 201);
  });

  const ownAccount = async (userId: string, id: string) => {
    if (!z.uuid().safeParse(id).success) return undefined;
    const [a] = await db.select().from(schema.riotAccounts)
      .where(and(eq(schema.riotAccounts.id, id), eq(schema.riotAccounts.userId, userId)));
    return a;
  };

  authed.patch("/accounts/:id", async (c) => {
    const acc = await ownAccount(c.get("userId"), c.req.param("id"));
    if (!acc) return c.json({ error: "not_found" }, 404);
    const parsed = z.object({ includeInProfile: z.boolean() }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid_body" }, 400);
    const [updated] = await db.update(schema.riotAccounts).set(parsed.data).where(eq(schema.riotAccounts.id, acc.id)).returning();
    return c.json({ account: accountView(updated!) });
  });

  authed.delete("/accounts/:id", async (c) => {
    const acc = await ownAccount(c.get("userId"), c.req.param("id"));
    if (!acc) return c.json({ error: "not_found" }, 404);
    await db.delete(schema.riotAccounts).where(eq(schema.riotAccounts.id, acc.id));
    await forgetPlayers(db, [acc.puuid]);
    return c.json({ ok: true });
  });

  authed.post("/accounts/:id/sync", async (c) => {
    const acc = await ownAccount(c.get("userId"), c.req.param("id"));
    if (!acc) return c.json({ error: "not_found" }, 404);
    await sync.markSyncing([acc.id]);
    void sync.start(acc.id);
    return c.json({ started: true }, 202);
  });

  /** Sync on app open (brief §14): only accounts not synced in the last 10 minutes. */
  authed.post("/sync", async (c) => {
    const accounts = await userAccounts(db, c.get("userId"));
    // A "syncing" account with no job in memory was interrupted (e.g. a server restart): resume it.
    const stale = accounts.filter((a) =>
      a.syncStatus === "syncing"
        ? !sync.isRunning(a.id)
        : !a.lastSyncedAt || Date.now() - a.lastSyncedAt.getTime() > 10 * 60_000,
    );
    await sync.markSyncing(stale.map((a) => a.id));
    for (const a of stale) void sync.start(a.id);
    return c.json({ started: stale.map((a) => a.id) }, 202);
  });

  // analysis views

  const averages = (list: AccountAnalysis[]) => {
    const usable = list.filter((a) => a.analyzable);
    return { deathsPerMin: mean(usable.map((a) => a.deathsPerMin)) || 0, kda: mean(usable.map((a) => a.kda)) || 0 };
  };

  const matchRow = (a: AccountAnalysis, avg: ReturnType<typeof averages>) => ({
    matchId: a.matchId,
    accountId: a.accountId,
    startedAt: a.startedAt,
    durationSec: a.durationSec,
    mode: a.mode,
    queue: queueLabel(a.queueId, a.mode),
    patch: a.patch,
    analyzable: a.analyzable,
    win: a.win,
    championName: a.championName,
    championId: a.championId,
    role: a.role,
    kills: a.kills,
    deaths: a.deaths,
    assists: a.assists,
    kda: a.kda,
    csPerMin: a.csPerMin,
    goldDiff15: a.goldDiff15,
    headline: matchHeadline(a, avg),
    // Scoreboard loadout (analysis v3).
    level: a.level,
    gold: a.gold,
    cs: a.cs,
    items: a.items,
    spells: a.spells,
    runes: a.runes,
  });

  authed.get("/dashboard", async (c) => {
    const { accounts, analyses, insights, insufficientData } = await insightsFor(c.get("userId"));
    const avg = averages(analyses);
    return c.json({
      dataSource: source.kind,
      syncing: accounts.some((a) => a.syncStatus === "syncing"),
      summary: summarize(analyses),
      insights,
      insufficientData,
      recent: analyses.slice(0, 5).map((a) => matchRow(a, avg)),
    });
  });

  authed.get("/matches", async (c) => {
    const q = c.req.query();
    const num = (v?: string) => (v !== undefined && v !== "" && Number.isFinite(Number(v)) ? Number(v) : undefined);
    const accounts = await userAccounts(db, c.get("userId"));
    const scoped = q.accountId ? accounts : accounts.filter((a) => a.includeInProfile);
    const all = await analysesFor(db, scoped);
    const filtered = applyFilters(all, {
      accountId: q.accountId,
      champion: q.champion,
      opponent: q.opponent,
      role: q.role,
      result: q.result === "win" || q.result === "loss" ? q.result : undefined,
      patch: q.patch,
      mode: q.mode,
      from: num(q.from),
      to: num(q.to),
      minDurationMin: num(q.minDuration),
      maxDurationMin: num(q.maxDuration),
    });
    const limit = Math.min(100, num(q.limit) ?? 30);
    const offset = num(q.offset) ?? 0;
    const avg = averages(all);
    return c.json({
      total: filtered.length,
      matches: filtered.slice(offset, offset + limit).map((a) => matchRow(a, avg)),
      facets: {
        champions: [...new Set(all.map((a) => a.championName))].sort(),
        patches: [...new Set(all.map((a) => a.patch))].sort().reverse(),
        modes: [...new Set(all.map((a) => a.mode))],
      },
    });
  });

  authed.get("/matches/:matchId", async (c) => {
    const matchId = c.req.param("matchId");
    const accounts = await userAccounts(db, c.get("userId"));
    const all = await analysesFor(db, accounts);
    const mine = all.find((a) => a.matchId === matchId);
    if (!mine) return c.json({ error: "not_found" }, 404);
    const [raw] = await db.select().from(schema.rawMatches).where(eq(schema.rawMatches.matchId, matchId));
    const [tl] = await db.select().from(schema.rawTimelines).where(eq(schema.rawTimelines.matchId, matchId));
    const match = normalizeMatch(raw!.payload as RawMatch);
    const me = match.participants.find((p) => p.puuid === mine.puuid)!;
    const timeline = (tl?.payload ?? null) as RawTimeline | null;

    let goldCurve: { minute: number; me: number; opponent: number | null }[] | null = null;
    let myEvents: { minute: number; type: "kill" | "death" | "assist" }[] | null = null;
    if (timeline) {
      const opp = match.participants.find((p) => p.teamId !== me.teamId && p.role === me.role && me.role !== "NONE");
      goldCurve = timeline.info.frames.map((f) => ({
        minute: Math.round(f.timestamp / 60_000),
        me: f.participantFrames[String(me.participantId)]?.totalGold ?? 0,
        opponent: opp ? f.participantFrames[String(opp.participantId)]?.totalGold ?? null : null,
      }));
      myEvents = timeline.info.frames.flatMap((f) => f.events)
        .filter((e) => e.type === "CHAMPION_KILL")
        .flatMap((e): { minute: number; type: "kill" | "death" | "assist" }[] => {
          const minute = Math.floor(e.timestamp / 60_000);
          if (e["killerId"] === me.participantId) return [{ minute, type: "kill" }];
          if (e["victimId"] === me.participantId) return [{ minute, type: "death" }];
          if ((e["assistingParticipantIds"] as number[] | undefined)?.includes(me.participantId)) return [{ minute, type: "assist" }];
          return [];
        });
    }

    const ranking = match.mode === "unsupported" ? null : gameRanking(match);
    const rankOf = new Map((ranking ?? []).map((r) => [r.participantId, r]));
    return c.json({
      dataSource: raw!.source,
      analysis: mine,
      achievements: gameAchievements({ match, timeline, puuid: mine.puuid, game: mine, history: all }),
      ranking: ranking ? { explanation: RANKING_EXPLANATION } : null,
      headline: matchHeadline(mine, averages(all)),
      teams: [100, 200].map((teamId) => ({
        teamId,
        win: match.participants.find((p) => p.teamId === teamId)?.win ?? false,
        players: match.participants.filter((p) => p.teamId === teamId).map((p) => ({
          championName: p.championName,
          riotId: p.riotId,
          role: p.role,
          kills: p.kills,
          deaths: p.deaths,
          assists: p.assists,
          cs: p.cs,
          gold: p.gold,
          damage: p.damageToChampions,
          championId: p.championId,
          items: p.items.map((id) => ({ id, name: knowledge.active()?.items.find((i) => i.id === id)?.name ?? `#${id}` })),
          spells: p.spells,
          runes: p.runes,
          isMe: p.puuid === mine.puuid,
          rank: rankOf.get(p.participantId)?.rank ?? null,
          score: rankOf.get(p.participantId)?.score ?? null,
        })),
      })),
      goldCurve,
      myEvents,
    });
  });

  authed.get("/champions", async (c) => {
    const { analyses } = await profileAnalyses(c.get("userId"));
    const bundle = knowledge.active();
    const mine = new Map<string, { games: number; wins: number }>();
    for (const a of analyses.filter((x) => x.analyzable)) {
      const m = mine.get(a.championName) ?? { games: 0, wins: 0 };
      m.games++;
      if (a.win) m.wins++;
      mine.set(a.championName, m);
    }
    // Lanes from the Wiki, for the position filter (the server only provides it with real data; brief wait on a cold start).
    const lanes = await wiki?.get(2000) ?? null;
    return c.json({
      version: bundle?.version ?? null,
      source: bundle?.source ?? null,
      positionsSource: lanes ? MERAKI_ATTRIBUTION : null,
      champions: (bundle?.champions ?? []).map((ch) => ({
        ...ch,
        positions: lanes?.get(ch.id)?.positions ?? [],
        personal: mine.get(ch.id) ?? { games: 0, wins: 0 },
      })).sort((a, b) => b.personal.games - a.personal.games || a.name.localeCompare(b.name)),
    });
  });

  authed.post("/coach/explain", async (c) => {
    const parsed = z.object({ insightId: z.string() }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid_body" }, 400);
    const userId = c.get("userId");
    const insight = (await insightsFor(userId, 10)).insights.find((i) => i.id === parsed.data.insightId);
    if (!insight) {
      return c.json({ text: "I do not have enough reliable information to explain this right now.", source: "deterministic" });
    }
    const prefs = await prefsFor(userId);
    return c.json(await explainInsight(deps.aiProviders, { insight, level: prefs.level as ExplanationLevel, language: "en" }));
  });

  authed.route("/", personalRoutes({ db, source, knowledge, services, wiki }));
  authed.route("/", gameRoutes({ db, source, knowledge, services }));
  authed.route("/", evolutionRoutes({ db, knowledge, services }));
  authed.route("/", rankRoutes({ db }));
  authed.route("/", improveRoutes({ db, services }));
  authed.route("/", desktopSessionRoutes({ db }));
  // Device routes authenticate with a pairing code or a device token, not the session cookie.
  app.route("/", desktopDeviceRoutes({ db, source, knowledge, services }));
  app.route("/", authed);
  return { app, sync };
}
