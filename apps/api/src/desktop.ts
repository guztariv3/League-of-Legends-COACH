import { buildEvidence } from "./stats/build-evidence.js";
import { economyBaseline } from "./economy-baseline.js";
import { bodyLimit } from "hono/body-limit";
import { LiveFrameSchema, LIVE_TTL_MS, freshFrame } from "./live-frame.js";
import { sql } from "drizzle-orm";
import { randomBytes, randomInt } from "node:crypto";
import { GAME_DATA_ATTRIBUTION, type GameFactsSource, type KnowledgeRegistry } from "@coach/knowledge";
import { recommendBuild, recommendSetup, teamNeeds, draftRead, itemTiming } from "@coach/build";
import { championPool, styleNote } from "@coach/coach";
import { patchFromVersion } from "@coach/domain";
import { challengeTitle, evaluateChallenge, type ChallengeKind, type GoalMetric } from "@coach/insights";
import { and, asc, desc, eq, gt, inArray, isNull } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { z } from "zod";
import { hashToken, type AuthVars } from "./auth.js";
import { AttemptLimiter, clientIp } from "./limits.js";
import { schema, type Db } from "./db/index.js";
import { userAccounts } from "./queries.js";
import { personalBuild } from "./build.js";
import { prepareGame } from "./game.js";
import { RANKED_QUEUES, rankHistory } from "./rank.js";
import { scoutForUser } from "./scout.js";
import type { Services } from "./services.js";
import type { MatchSource } from "./sources.js";
import { statsEvidence } from "./stats/evidence.js";
import { championStats } from "./stats/store.js";

/**
 * Desktop app pairing (security decision: one-time code → revocable device token).
 *
 * 1. Signed in on the web, the player asks for a code (valid 10 minutes, single use).
 * 2. The desktop app exchanges it at /desktop/claim for a device token.
 * 3. With `Authorization: Bearer <token>` the app can only read /desktop/scout, /desktop/build, /desktop/plan, /desktop/items and /desktop/home.
 * Only SHA-256 hashes are stored; the player can revoke a device from the web at any time.
 * /desktop/claim, /desktop/scout, /desktop/build, /desktop/plan, /desktop/items and /desktop/home are the only API routes the site's password gate lets through,
 * because they carry their own authentication.
 */
export const PAIRING_CODE_TTL_MS = 10 * 60_000;
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I/L
const normalizeCode = (raw: string) => raw.toUpperCase().replace(/[^A-Z0-9]/g, "");

function newCode(): string {
  let s = "";
  for (let i = 0; i < 8; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

/** Routes that need a web session (mounted under the authenticated router). */
export function desktopSessionRoutes({ db }: { db: Db }) {
  const r = new Hono<AuthVars>();

  // Several open tabs polling every second stay well inside this; a runaway client does not.
  const liveReads = new AttemptLimiter(240, 60_000);
  r.get("/live", async c => {
    c.header("Cache-Control", "no-store");
    if (!liveReads.allow(c.get("userId"))) { c.header("Retry-After", "10"); return c.json({ error: "rate_limited" }, 429); }
    const [row] = await db.select({ deviceId: schema.liveFrames.deviceId, payload: schema.liveFrames.payload, receivedAt: schema.liveFrames.receivedAt, capturedAt: schema.liveFrames.capturedAt })
      .from(schema.liveFrames).innerJoin(schema.deviceLinks, eq(schema.deviceLinks.id, schema.liveFrames.deviceId))
      .where(and(eq(schema.liveFrames.userId, c.get("userId")), isNull(schema.deviceLinks.revokedAt), gt(schema.liveFrames.receivedAt,new Date(Date.now()-86400000))))
      .orderBy(sql`CASE WHEN ${schema.liveFrames.receivedAt} > ${new Date(Date.now()-LIVE_TTL_MS)} AND ${schema.liveFrames.payload}->>'phase' NOT IN ('idle','ended') THEN 0 WHEN ${schema.liveFrames.payload}->>'phase' = 'ended' THEN 1 ELSE 2 END`, desc(schema.liveFrames.receivedAt)).limit(1);
    if (!row) return c.json({ frame: null, stale: false });
    const parsed = LiveFrameSchema.safeParse(row.payload);
    if (!parsed.success) return c.json({ frame: null, stale: true });
    const stale = Date.now()-row.receivedAt.getTime()>LIVE_TTL_MS || !freshFrame(row.capturedAt.getTime(),Date.now());
    // A stale frame is never presented as live advice. Completed summaries expire after one day.
    const ended = parsed.data.phase === "ended" && Date.now()-row.receivedAt.getTime()<86400000;
    // A stale frame can never be shown again, and live frames name the other players in the game:
    // it is deleted now rather than kept (exactly this row, so a newer frame is never lost).
    if (stale && !ended) await db.delete(schema.liveFrames).where(and(eq(schema.liveFrames.deviceId, row.deviceId), eq(schema.liveFrames.receivedAt, row.receivedAt), eq(schema.liveFrames.capturedAt, row.capturedAt)));
    // How much longer this frame stays current, so the page can drop it on time even while it
    // cannot read again (e.g. rate-limited); relative, so the browser's clock does not matter.
    const expiresInMs = stale || ended ? null : Math.max(0, Math.min(row.receivedAt.getTime(), row.capturedAt.getTime()) + LIVE_TTL_MS - Date.now());
    return c.json({ frame: stale && !ended ? null : parsed.data, stale: stale && !ended, expiresInMs });
  });

  r.post("/desktop/pair", async (c) => {
    const code = newCode();
    await db.insert(schema.deviceLinks).values({
      userId: c.get("userId"),
      codeHash: hashToken(normalizeCode(code)),
      codeExpiresAt: new Date(Date.now() + PAIRING_CODE_TTL_MS),
    });
    return c.json({ code, expiresInSec: PAIRING_CODE_TTL_MS / 1000 }, 201);
  });

  r.get("/desktop/devices", async (c) => {
    const rows = await db.select().from(schema.deviceLinks)
      .where(and(eq(schema.deviceLinks.userId, c.get("userId")), isNull(schema.deviceLinks.revokedAt)))
      .orderBy(desc(schema.deviceLinks.createdAt));
    return c.json({
      devices: rows.filter((d) => d.claimedAt).map((d) => ({ id: d.id, label: d.label, claimedAt: d.claimedAt, lastUsedAt: d.lastUsedAt })),
    });
  });

  r.delete("/desktop/devices/:id", async (c) => {
    const id = c.req.param("id");
    if (!z.uuid().safeParse(id).success) return c.json({ error: "not_found" }, 404);
    const done = await db.update(schema.deviceLinks).set({ revokedAt: new Date(), tokenHash: null, codeHash: null })
      .where(and(eq(schema.deviceLinks.id, id), eq(schema.deviceLinks.userId, c.get("userId")))).returning();
    if (done.length) await db.delete(schema.liveFrames).where(eq(schema.liveFrames.deviceId,id));
    return done.length ? c.json({ ok: true }) : c.json({ error: "not_found" }, 404);
  });

  return r;
}

/** Routes the desktop app calls with its own credentials (code or device token). */
export function desktopDeviceRoutes(deps: { db: Db; source: MatchSource; knowledge: KnowledgeRegistry; services: Services; gameFacts?: GameFactsSource; onMatchEnd?: (userId:string)=>Promise<void> }) {
  const { db } = deps;
  const r = new Hono();
  const perIp = new AttemptLimiter(10, 60_000);
  const global = new AttemptLimiter(60, 60_000);

  r.post("/desktop/claim", async (c) => {
    if (!perIp.allow(clientIp(c)) || !global.allow("all")) {
      return c.json({ error: "rate_limited", message: "Demasiados intentos. Espera un minuto." }, 429);
    }
    const parsed = z.object({ code: z.string().min(4).max(20), label: z.string().trim().min(1).max(60).optional() })
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid_body" }, 400);
    const token = randomBytes(32).toString("base64url");
    // Single use: the code hash is cleared in the same update that stores the token.
    const claimed = await db.update(schema.deviceLinks)
      .set({ tokenHash: hashToken(token), codeHash: null, codeExpiresAt: null, claimedAt: new Date(), ...(parsed.data.label ? { label: parsed.data.label } : {}) })
      .where(and(
        eq(schema.deviceLinks.codeHash, hashToken(normalizeCode(parsed.data.code))),
        gt(schema.deviceLinks.codeExpiresAt, new Date()),
        isNull(schema.deviceLinks.revokedAt),
      ))
      .returning();
    if (!claimed.length) return c.json({ error: "invalid_code", message: "Wrong or expired code. Generate a new one on the website." }, 401);
    return c.json({ token });
  });

  /** The device behind a bearer token, or null. Also records when it was last used. */
  const deviceFor = async (c: Context) => {
    const bearer = c.req.header("Authorization")?.match(/^Bearer ([A-Za-z0-9_-]{20,})$/)?.[1];
    if (!bearer) return null;
    const [device] = await db.select().from(schema.deviceLinks)
      .where(and(eq(schema.deviceLinks.tokenHash, hashToken(bearer)), isNull(schema.deviceLinks.revokedAt)));
    if (!device) return null;
    await db.update(schema.deviceLinks).set({ lastUsedAt: new Date() }).where(eq(schema.deviceLinks.id, device.id));
    return device;
  };
  const disconnected = (c: Context) => c.json({ error: "unauthenticated", message: "This app is no longer connected. Connect it again from the website." }, 401);

  /**
   * The site's clock, for the companion to convert its capture times into server time (PCs with a
   * wrong clock can still share). It changes nothing about freshness: frames are still judged by
   * absolute server time, so an old capture or a replayed request never becomes current.
   */
  const timeRate = new AttemptLimiter(30, 60_000);
  r.get("/desktop/time", async c => {
    const device = await deviceFor(c);
    if (!device) return disconnected(c);
    if (!timeRate.allow(device.id)) return c.json({ error: "rate_limited" }, 429);
    c.header("Cache-Control", "no-store");
    return c.json({ serverTime: Date.now() });
  });

  const endRate = new AttemptLimiter(1, 120_000);
  const liveRate = new AttemptLimiter(90, 60_000);
  r.post("/desktop/live", bodyLimit({ maxSize: 64 * 1024 }), async c => {
    const device = await deviceFor(c);
    if (!device) return disconnected(c);
    if (!liveRate.allow(device.id)) return c.json({ error: "rate_limited" },429);
    const parsed = LiveFrameSchema.safeParse(await c.req.json().catch(()=>null));
    if (!parsed.success) return c.json({ error: "invalid_frame" },400);
    // capturedAt is in server time (the companion converts it with /desktop/time): absolute age check.
    if (!freshFrame(parsed.data.capturedAt,Date.now())) return c.json({ error: "stale_frame", serverTime: Date.now() },400);
    const frame=parsed.data, now=new Date();
    const values={deviceId:device.id,userId:device.userId,streamId:frame.streamId,sequence:frame.sequence,capturedAt:new Date(frame.capturedAt),receivedAt:now,payload:frame};
    const saved=await db.insert(schema.liveFrames).values(values).onConflictDoUpdate({
      target:schema.liveFrames.deviceId, set:values,
      setWhere: sql`${schema.liveFrames.capturedAt} <= ${values.capturedAt} AND (${schema.liveFrames.streamId} <> ${frame.streamId} OR ${schema.liveFrames.sequence} < ${frame.sequence})`,
    }).returning({id:schema.liveFrames.deviceId});
    if(saved.length && frame.phase === "ended" && endRate.allow(device.userId)) void deps.onMatchEnd?.(device.userId).catch(()=>{});
    return c.json({ok:true,accepted:saved.length>0,serverTime:Date.now()});
  });

  r.get("/desktop/scout", async (c) => {
    const device = await deviceFor(c);
    if (!device) return disconnected(c);

    const accounts = (await userAccounts(db, device.userId)).filter((a) => a.includeInProfile);
    if (!accounts.length) return c.json({ inGame: false, message: "No accounts are linked on the website." });
    const { analyses } = await deps.services.profileAnalyses(device.userId);
    const result = await scoutForUser(deps, device.userId, accounts, analyses);
    const bundle = deps.knowledge.active();
    // Image base for the desktop window (Data Dragon only for real bundles).
    const assets = { cdn: bundle?.source === "ddragon" ? "https://ddragon.leagueoflegends.com" : null, version: bundle?.version ?? null };
    return c.json({ ...result, assets });
  });

  /** Your own build with the champion you are playing (from your history only). */
  r.get("/desktop/build", async (c) => {
    const device = await deviceFor(c);
    if (!device) return disconnected(c);
    const q = z.object({ champion: z.string().regex(/^[A-Za-z0-9]{1,40}$/), mode: z.enum(["summoners_rift", "aram"]) })
      .safeParse({ champion: c.req.query("champion"), mode: c.req.query("mode") });
    if (!q.success) return c.json({ error: "invalid_query" }, 400);
    const { analyses } = await deps.services.profileAnalyses(device.userId);
    return c.json(personalBuild(analyses, q.data.champion, q.data.mode, deps.knowledge.active()));
  });

  /**
   * The Coach's game plan for the champions of the game that is starting (champions only, D-03).
   * Champions come as Data Dragon ids ("MonkeyKing", from the game) or numeric keys ("62", from
   * champion select); numeric keys are mapped with the active catalog.
   */
  // While hovering, champion select asks again whenever a ban or the timer phase changes, which
  // only affects the cheap draft state: the expensive provisional plan for the same champions is
  // reused for a short while. The plan for a locked-in champion is always computed fresh.
  const PLAN_CACHE_MS = 30_000;
  const planCache = new Map<string, { at: number; body: Record<string, unknown> }>();
  const planRate = new AttemptLimiter(40, 60_000);
  r.get("/desktop/plan", async (c) => {
    const device = await deviceFor(c);
    if (!device) return disconnected(c);
    const id = z.string().regex(/^[A-Za-z0-9]{1,40}$/);
    const list = z.string().max(250).optional().transform((v) => (v ? v.split(",").filter(Boolean) : [])).pipe(z.array(id).max(5));
    const position = z.enum(["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"]).optional();
    const q = z.object({ me: id, allies: list, enemies: list, opponent: id.optional(), position }).safeParse({
      me: c.req.query("me"), allies: c.req.query("allies"), enemies: c.req.query("enemies"), opponent: c.req.query("opponent") || undefined,
      position: c.req.query("position")?.toUpperCase() || undefined,
    });
    if (!q.success) return c.json({ error: "invalid_query" }, 400);
    const bundle = deps.knowledge.active();
    const byKey = new Map((bundle?.champions ?? []).map((ch) => [String(ch.key), ch.id]));
    const resolve = (x: string) => (/^\d+$/.test(x) ? byKey.get(x) ?? null : x);
    const rawContext=c.req.query("draftContext");
    let context:unknown; try {context=rawContext && rawContext.length<=2500 ? JSON.parse(rawContext) : null;} catch {context=null;}
    const dc=z.object({bans:z.object({allies:z.array(z.number().int()).max(10).nullable(),enemies:z.array(z.number().int()).max(10).nullable()}).nullable().optional(),timerPhase:z.string().max(40).nullable().optional(),alliedPositions:z.array(z.object({championId:z.number().int(),position:z.string().max(30)})).max(5).optional()}).safeParse(context);
    const banNames=(ids:number[]|null|undefined)=>(ids??[]).filter(id=>id>0).map(id=>resolve(String(id))??"Unknown champion");
    const draftState=dc.success ? {phase:dc.data.timerPhase??null,allyBans:banNames(dc.data.bans?.allies),enemyBans:banNames(dc.data.bans?.enemies),roles:(dc.data.alliedPositions??[]).filter(p=>p.championId>0).map(p=>`${resolve(String(p.championId))??"Unknown champion"}: ${p.position||"role unknown"}`)} : undefined;
    const me = resolve(q.data.me);
    if (!me) return c.json({ error: "unknown_champion" }, 400);
    const known = (xs: string[]) => xs.map(resolve).filter((x): x is string => x !== null);
    const opponent = q.data.opponent ? resolve(q.data.opponent) ?? undefined : undefined;
    const enemies = known(q.data.enemies);
    const cacheKey = JSON.stringify([device.userId, me, known(q.data.allies), enemies, opponent ?? null, q.data.position ?? null]);
    const now = Date.now();
    const preview = c.req.query("preview") === "1";
    const hit = preview ? planCache.get(cacheKey) : undefined;
    if (hit && now - hit.at < PLAN_CACHE_MS) return c.json({ ...hit.body, draftState });
    if (!planRate.allow(device.id)) { c.header("Retry-After", "10"); return c.json({ error: "rate_limited" }, 429); }
    // Hover and lock-in use the same recommendation engine; the client labels hover as provisional.
    const { analyses } = await deps.services.profileAnalyses(device.userId);
    const { draft, plan } = prepareGame({ myChampion: me, allies: known(q.data.allies), enemies, laneOpponent: opponent }, analyses, bundle);

    // The pre-game build (runs on the server with the full game data; null until it is loaded).
    const facts = await deps.gameFacts?.get(2500) ?? null;
    const kits = new Map((facts?.kits ?? []).map((k) => [k.id, k]));
    const myKit = kits.get(me);
    const enemyInput = enemies.map((e) => kits.get(e)).filter((k) => k !== undefined).map((k) => ({ kit: k, laneOpponent: k.id === opponent }));
    const baseline = facts ? await economyBaseline(db, analyses, me, q.data.position, patchFromVersion(facts.version)) : null;
    const economy = baseline ? {gold:0,time:150,income:baseline.income,source:"history" as const} : undefined;
    const master = facts ? await championStats(db, me, q.data.position ?? null, patchFromVersion(facts.version)) : null;
    const engine = facts && myKit ? recommendBuild({ me: myKit, enemies: enemyInput, items: facts.items, position: q.data.position ?? null, economy, patch:patchFromVersion(facts.version), evidence:buildEvidence(master,me,q.data.position??null,patchFromVersion(facts.version),opponent) }) : null;
    const setup = facts && myKit ? recommendSetup({ me: myKit, enemies: enemyInput, runes: facts.runes, spells: facts.spells, position: q.data.position ?? null, patch:patchFromVersion(facts.version), evidence:buildEvidence(master,me,q.data.position??null,patchFromVersion(facts.version),opponent) }) : null;
    // What Master+ players do with this champion this patch (phase 4): sample-gated purchases also contribute to the engine ranking.

    // What keeps happening in the player's own games (phase 5): personalises, never changes the call.
    const stats = master && facts ? statsEvidence(master, facts, { build: engine, setup, opponent }) : null;
    const memory = await deps.services.memoryFor(device.userId, {
      champion: me, position: q.data.position ?? null, analyses,
      reference: stats?.firstItem?.avgMinute != null ? { itemId: stats.firstItem.id, name: stats.firstItem.name, avgMinute: stats.firstItem.avgMinute } : null,
    });
    const itemFacts = new Map((facts?.items ?? []).map((i) => [i.id, i]));
    const defense = (id: number) => {
      const st = itemFacts.get(id)?.stats;
      return (st?.health?.flat ?? 0) / 10 + (st?.armor?.flat ?? 0) + (st?.magicResistance?.flat ?? 0);
    };
    const style = memory && engine?.first && engine.alternative
      ? styleNote(memory.style, { name: engine.first.name, defense: defense(engine.first.id) }, { name: engine.alternative.name, defense: defense(engine.alternative.id) })
      : null;
    // A recurring mistake with this champion is the most useful "avoid" line: it is about this player.
    const own = memory?.patterns.find((p) => p.kind === "mistake" && p.scope === "champion");
    const gamePlan = own ? { ...plan, avoid: { text: own.text, basis: "observation" as const, why: own.why } } : plan;
    const economyNotes = baseline ? [
      `Historical baseline: ${baseline.games} games, same ${baseline.scope}, patch ${baseline.patch}. About ${baseline.income} gold/min (${baseline.incomeRange.join("–")} across the middle half of games) and ${baseline.cs} CS/min in early intervals without your kills or assists.`,
      "This includes observed farm, passive and other non-kill income. It is conditional, not a promise of future earnings. Item estimates start after the opening purchase; starting-item leftovers are unknown.",
      ...baseline.recallBudgets.map(gold=> {
        const candidates=[engine?.first,engine?.alternative].filter(p=>p!=null);
        const options=candidates.map(p=>{const item=facts?.items.find(i=>i.id===p.id);if(!item||!facts)return "";
          const timing=itemTiming(item,facts.items,[],{gold,time:0,income:baseline.income,source:"history"},()=>0);
          return `${p.name}: ${timing.affordable} recipe choices fit; about ${Math.ceil((timing.seconds??0)/60)} further min without owned components`;});
        return `Observed recall-budget scenario ${gold} gold: ${options.join("; ")}. Budget is a pre-recall snapshot, not an exact checkout balance.`;
      }),
      "Opponent wallet and next purchase are unknown. Live comparisons use visible completed items; no enemy completion time is invented.",
    ] : ["Not enough current-patch timeline data for your role to estimate a personal non-kill income baseline. Pre-game completion times remain unknown."];
    const build = facts && myKit && engine
      ? {
          ...engine,
          economyNotes,
          // Runes and summoner spells, decided the same way (packages/build/src/setup.ts).
          setup,
          stats,
          // On a close call, which option is nearer to how the player plays (both are valid).
          styleNote: style,
          // What the team needs from you, from your allies' kits (packages/build/src/team.ts).
          team: teamNeeds(myKit, known(q.data.allies).map((a) => kits.get(a)).filter((k) => k !== undefined)),
          version: facts.version,
          enemiesKnown: enemies.length,
          attribution: GAME_DATA_ATTRIBUTION,
        }
      : null;
    const body = { champion: me, playerContext:[`${analyses.filter(a=>a.championName===me&&a.analyzable).length} analyzed games on this champion.`, ...(memory?.patterns.slice(0,2).map(p=>`${p.text}: ${p.why}`)??[])], roster: {allies:known(q.data.allies), enemies}, draftRead: myKit ? draftRead(myKit, known(q.data.allies).flatMap(a => kits.get(a) ? [kits.get(a)!] : []), enemyInput.map(e => e.kit), opponent) : null, plan: gamePlan, keyPoints: draft.keyPoints, limits: draft.limits, build, memory };
    if (preview) {
      for (const [k, v] of planCache) if (now - v.at >= PLAN_CACHE_MS || planCache.size > 500) planCache.delete(k);
      planCache.set(cacheKey, { at: now, body });
    }
    return c.json({ ...body, draftState });
  });

  /**
   * The player's home, shown by the desktop app between games: the same profile as the website
   * (accounts, rank, recent results, most played champions, focus and running challenges).
   */
  /**
   * The build engine during a game: what to buy next for the items and scores the game shows.
   * Only champions, item ids and kill/death counts come in (no names). `enemies` is a list of
   * "Champion~item.item~kills~deaths"; `opening` asks for the starting items too.
   */
  r.get("/desktop/items", async (c) => {
    const device = await deviceFor(c);
    if (!device) return disconnected(c);
    const id = z.string().regex(/^[A-Za-z0-9]{1,40}$/);
    const items = z.string().regex(/^(\d{1,7}(\.\d{1,7}){0,9})?$/).transform((v) => (v ? v.split(".").map(Number) : []));
    const enemy = z.string().regex(/^[A-Za-z0-9]{1,40}~(\d{1,7}(\.\d{1,7}){0,9})?~\d{1,3}~\d{1,3}$/).transform((v) => {
      const [champion, list, kills, deaths] = v.split("~");
      return { champion: champion!, items: list ? list.split(".").map(Number) : [], kills: Number(kills), deaths: Number(deaths) };
    });
    const q = z.object({
      me: id,
      mine: items,
      enemies: z.string().max(600).transform((v) => (v ? v.split(",") : [])).pipe(z.array(enemy).max(5)),
      opponent: id.optional(),
      position: z.enum(["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"]).optional(),
      opening: z.enum(["0", "1"]).optional(),
      economy: z.string().max(500).optional().transform(v => { try { return v ? JSON.parse(v) : undefined; } catch { return null; } }).pipe(z.object({ gold: z.number().min(0).max(100000).nullable(), time: z.number().min(0).max(30000), income: z.number().min(0).max(5000).nullable(), opponentCompleted: z.boolean().optional() }).optional()),
    }).safeParse({
      me: c.req.query("me"), mine: c.req.query("mine") ?? "", enemies: c.req.query("enemies") ?? "", opponent: c.req.query("opponent") || undefined,
      economy: c.req.query("economy"), position: c.req.query("position")?.toUpperCase() || undefined, opening: c.req.query("opening") || undefined,
    });
    if (!q.success) return c.json({ error: "invalid_query" }, 400);
    const facts = await deps.gameFacts?.get(2500) ?? null;
    if (!facts) return c.json({ build: null, reason: "game_data_unavailable" });
    const kits = new Map(facts.kits.map((k) => [k.id, k]));
    const byId = new Map(facts.items.map((i) => [i.id, i]));
    const myKit = kits.get(q.data.me);
    if (!myKit) return c.json({ build: null, reason: "unknown_champion" });
    const enemies = q.data.enemies.flatMap((e) => {
      const kit = kits.get(e.champion);
      return kit ? [{ kit, items: e.items.map((i) => byId.get(i)).filter((i) => i !== undefined), kills: e.kills, deaths: e.deaths, laneOpponent: e.champion === q.data.opponent }] : [];
    });
    const patch=patchFromVersion(facts.version);
    const observed=await championStats(db,q.data.me,q.data.position??null,patch);
    const build = recommendBuild({
      me: myKit, enemies, items: facts.items, owned: q.data.mine, position: q.data.position ?? null, starter: q.data.opening === "1", economy: q.data.economy, patch, evidence:buildEvidence(observed,q.data.me,q.data.position??null,patch,q.data.opponent),
    });
    return c.json({ build: { ...build, version: facts.version, enemiesKnown: enemies.length, attribution: GAME_DATA_ATTRIBUTION } });
  });

  r.get("/desktop/home", async (c) => {
    const device = await deviceFor(c);
    if (!device) return disconnected(c);
    const accounts = (await userAccounts(db, device.userId)).filter((a) => a.includeInProfile);
    const { analyses } = await deps.services.profileAnalyses(device.userId);
    const played = analyses.filter((a) => a.analyzable).sort((a, b) => b.startedAt - a.startedAt);
    const last20 = played.slice(0, 20);

    const snapshots = accounts.length
      ? await db.select().from(schema.rankSnapshots).where(inArray(schema.rankSnapshots.accountId, accounts.map((a) => a.id))).orderBy(asc(schema.rankSnapshots.takenAt))
      : [];
    const ranks = accounts.flatMap((a) => RANKED_QUEUES.flatMap((q) => {
      const current = rankHistory(snapshots.filter((s) => s.accountId === a.id && s.queueType === q)).at(-1);
      return current ? [{ riotId: `${a.gameName}#${a.tagLine}`, queueType: q, tier: current.tier, rank: current.rank, lp: current.lp, wins: current.wins, losses: current.losses }] : [];
    }));

    const [focus] = await db.select().from(schema.coachMemory)
      .where(and(eq(schema.coachMemory.userId, device.userId), eq(schema.coachMemory.category, "focus")));
    const running = await db.select().from(schema.challenges)
      .where(and(eq(schema.challenges.userId, device.userId), eq(schema.challenges.status, "active")));
    const now = Date.now();

    return c.json({
      accounts: accounts.map((a) => `${a.gameName}#${a.tagLine}`),
      ranks,
      record: { games: last20.length, wins: last20.filter((a) => a.win).length },
      recent: played.slice(0, 5).map((a) => ({ matchId: a.matchId, championName: a.championName, win: a.win, kills: a.kills, deaths: a.deaths, assists: a.assists, startedAt: a.startedAt, mode: a.mode })),
      champions: championPool(analyses).slice(0, 3).map((e) => ({ name: e.name, games: e.games, wins: e.wins })),
      focus: focus?.content ?? null,
      challenges: running.map((x) => {
        const spec = { metric: x.metric as GoalMetric, target: x.target, kind: x.kind as ChallengeKind };
        const p = evaluateChallenge(spec, analyses, x.createdAt.getTime(), now);
        return { title: challengeTitle(spec), met: p.met, played: p.played, summary: p.summary };
      }),
    });
  });

  return r;
}
