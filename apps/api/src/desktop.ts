import { randomBytes, randomInt } from "node:crypto";
import type { KnowledgeRegistry } from "@coach/knowledge";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { z } from "zod";
import { hashToken, type AuthVars } from "./auth.js";
import { schema, type Db } from "./db/index.js";
import { userAccounts } from "./queries.js";
import { personalBuild } from "./build.js";
import { prepareGame } from "./game.js";
import { scoutForUser } from "./scout.js";
import type { Services } from "./services.js";
import type { MatchSource } from "./sources.js";

/**
 * Desktop app pairing (security decision: one-time code → revocable device token).
 *
 * 1. Signed in on the web, the player asks for a code (valid 10 minutes, single use).
 * 2. The desktop app exchanges it at /desktop/claim for a device token.
 * 3. With `Authorization: Bearer <token>` the app can only read /desktop/scout, /desktop/build and /desktop/plan.
 * Only SHA-256 hashes are stored; the player can revoke a device from the web at any time.
 * /desktop/claim, /desktop/scout, /desktop/build and /desktop/plan are the only API routes the site's password gate lets through,
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

/** Small fixed-window limiter for code guessing (8 chars from 31 symbols ≈ 40 bits, 10-minute life). */
class AttemptLimiter {
  private hits = new Map<string, { windowStart: number; n: number }>();
  constructor(private readonly max: number, private readonly windowMs: number) {}
  allow(key: string, now = Date.now()): boolean {
    const h = this.hits.get(key);
    if (!h || now - h.windowStart > this.windowMs) {
      this.hits.set(key, { windowStart: now, n: 1 });
      return true;
    }
    h.n++;
    return h.n <= this.max;
  }
}

// The proxy appends the real client address last; earlier entries can be forged by the client.
const clientIp = (c: Context) => c.req.header("x-forwarded-for")?.split(",").pop()?.trim() || "local";

/** Routes that need a web session (mounted under the authenticated router). */
export function desktopSessionRoutes({ db }: { db: Db }) {
  const r = new Hono<AuthVars>();

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
    return done.length ? c.json({ ok: true }) : c.json({ error: "not_found" }, 404);
  });

  return r;
}

/** Routes the desktop app calls with its own credentials (code or device token). */
export function desktopDeviceRoutes(deps: { db: Db; source: MatchSource; knowledge: KnowledgeRegistry; services: Services }) {
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

  /** The Coach's game plan for the champions of the game that is starting (champions only, D-03). */
  r.get("/desktop/plan", async (c) => {
    const device = await deviceFor(c);
    if (!device) return disconnected(c);
    const id = z.string().regex(/^[A-Za-z0-9]{1,40}$/);
    const list = z.string().max(250).optional().transform((v) => (v ? v.split(",").filter(Boolean) : [])).pipe(z.array(id).max(5));
    const q = z.object({ me: id, allies: list, enemies: list, opponent: id.optional() }).safeParse({
      me: c.req.query("me"), allies: c.req.query("allies"), enemies: c.req.query("enemies"), opponent: c.req.query("opponent") || undefined,
    });
    if (!q.success) return c.json({ error: "invalid_query" }, 400);
    const { analyses } = await deps.services.profileAnalyses(device.userId);
    const { draft, plan } = prepareGame({ myChampion: q.data.me, allies: q.data.allies, enemies: q.data.enemies, laneOpponent: q.data.opponent }, analyses, deps.knowledge.active());
    return c.json({ plan, keyPoints: draft.keyPoints, limits: draft.limits });
  });

  /** The Coach's game plan for the champions of the game that is starting (champions only, D-03). */
  r.get("/desktop/plan", async (c) => {
    const device = await deviceFor(c);
    if (!device) return disconnected(c);
    const id = z.string().regex(/^[A-Za-z0-9]{1,40}$/);
    const list = z.string().max(250).optional().transform((v) => (v ? v.split(",").filter(Boolean) : [])).pipe(z.array(id).max(5));
    const q = z.object({ me: id, allies: list, enemies: list, opponent: id.optional() }).safeParse({
      me: c.req.query("me"), allies: c.req.query("allies"), enemies: c.req.query("enemies"), opponent: c.req.query("opponent") || undefined,
    });
    if (!q.success) return c.json({ error: "invalid_query" }, 400);
    const { analyses } = await deps.services.profileAnalyses(device.userId);
    const { draft, plan } = prepareGame({ myChampion: q.data.me, allies: q.data.allies, enemies: q.data.enemies, laneOpponent: q.data.opponent }, analyses, deps.knowledge.active());
    return c.json({ plan, keyPoints: draft.keyPoints, limits: draft.limits });
  });

  return r;
}
