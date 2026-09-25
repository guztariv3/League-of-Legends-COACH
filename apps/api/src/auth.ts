import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { schema, type Db } from "./db/index.js";

export const SESSION_COOKIE = "coach_session";
const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;

export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

/** Opaque random session token; only its SHA-256 hash is stored. */
export async function createSession(db: Db, c: Context, userId: string, secure: boolean): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  await db.insert(schema.sessions).values({
    tokenHash: hashToken(token),
    userId,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "Lax",
    secure,
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export async function destroySession(db: Db, c: Context): Promise<void> {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) await db.delete(schema.sessions).where(eq(schema.sessions.tokenHash, hashToken(token)));
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

export type AuthVars = { Variables: { userId: string } };

export function requireUser(db: Db): MiddlewareHandler<AuthVars> {
  return async (c, next) => {
    const token = getCookie(c, SESSION_COOKIE);
    if (!token) return c.json({ error: "unauthenticated" }, 401);
    const [session] = await db
      .select()
      .from(schema.sessions)
      .where(and(eq(schema.sessions.tokenHash, hashToken(token)), gt(schema.sessions.expiresAt, new Date())));
    if (!session) return c.json({ error: "unauthenticated" }, 401);
    c.set("userId", session.userId);
    await next();
  };
}

/**
 * CSRF defence for cookie auth: state-changing requests must come from the
 * web origin (or carry no Origin, e.g. same-origin tools/tests) and send JSON.
 */
export function csrfGuard(allowedOrigin: string): MiddlewareHandler {
  return async (c, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(c.req.method)) return next();
    const origin = c.req.header("Origin");
    if (origin && origin !== allowedOrigin) return c.json({ error: "forbidden_origin" }, 403);
    const type = c.req.header("Content-Type") ?? "";
    if (c.req.method !== "DELETE" && !type.includes("application/json")) {
      return c.json({ error: "json_required" }, 415);
    }
    return next();
  };
}
