import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { syntheticSource as syntheticKnowledge } from "@coach/knowledge";
import { eq } from "drizzle-orm";
import { createApp } from "./app.js";
import { hashPassword, verifyPassword } from "./auth.js";
import { loadConfig } from "./config.js";
import { openDatabase, schema, type Database } from "./db/index.js";
import { bootKnowledge } from "./knowledge.js";
import { syntheticSource } from "./sources.js";

let database: Database;
let ctx: ReturnType<typeof createApp>;

beforeAll(async () => {
  database = await openDatabase(undefined, undefined);
  const knowledge = await bootKnowledge(database.db, syntheticKnowledge());
  ctx = createApp({ cfg: loadConfig({ NODE_ENV: "test" }), db: database.db, source: syntheticSource(() => Date.UTC(2026, 5, 1)), knowledge, aiProviders: [] });
}, 30_000);
afterAll(() => database.close());

async function call(path: string, init: RequestInit & { cookie?: string; ip?: string } = {}) {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  if (init.cookie) headers.set("Cookie", init.cookie);
  headers.set("x-forwarded-for", init.ip ?? "10.0.0.1");
  const res = await ctx.app.request(`/api${path}`, { ...init, headers });
  return { res, body: (await res.json()) as any, cookie: res.headers.get("set-cookie")?.split(";")[0] ?? null };
}
const post = (path: string, body: unknown, extra: { cookie?: string; ip?: string } = {}) => call(path, { method: "POST", body: JSON.stringify(path === "/auth/dev-login" ? {token:"a".repeat(64),...body as object}:body), ...extra });

describe("passwords", () => {
  it("stores a salted scrypt hash, never the password, and verifies it", async () => {
    const h = await hashPassword("correct horse battery");
    expect(h).toMatch(/^scrypt\$32768\$8\$1\$/);
    expect(h).not.toContain("correct");
    expect(await hashPassword("correct horse battery")).not.toBe(h); // salted
    expect(await verifyPassword("correct horse battery", h)).toBe(true);
    expect(await verifyPassword("wrong horse battery", h)).toBe(false);
  });
});

describe("own accounts", () => {
  it("creates an account, signs in with it, and rejects a wrong password with the same answer as an unknown name", async () => {
    const reg = await post("/auth/register", { username: "Ana.Main", password: "a-long-password" }, { ip: "10.0.0.2" });
    expect(reg.res.status).toBe(201);
    expect((await call("/me", { cookie: reg.cookie! })).body.user).toMatchObject({ username: "ana.main", hasPassword: true });
    const [row] = await database.db.select().from(schema.users).where(eq(schema.users.username, "ana.main"));
    expect(row!.passwordHash).not.toContain("a-long-password");

    expect((await post("/auth/register", { username: "ana.main", password: "another-password" }, { ip: "10.0.0.3" })).res.status).toBe(409);
    expect((await post("/auth/register", { username: "x", password: "short" }, { ip: "10.0.0.3" })).res.status).toBe(400);

    const ok = await post("/auth/login", { username: "ANA.MAIN", password: "a-long-password" });
    expect(ok.res.status).toBe(200);
    expect(ok.cookie).toMatch(/^coach_session=/);
    const wrong = await post("/auth/login", { username: "ana.main", password: "not-the-password" });
    const unknown = await post("/auth/login", { username: "nobody-here", password: "not-the-password" });
    expect(wrong.res.status).toBe(401);
    expect(unknown.body).toEqual(wrong.body);
  });

  it("the development sign-in can't open an account that has a password", async () => {
    await post("/auth/register", { username: "berto", password: "berto-password" }, { ip: "10.0.0.4" });
    const dev = await post("/auth/dev-login", { displayName: "berto" });
    expect(dev.res.status).toBe(409);
    expect(dev.cookie).toBeNull();
  });

  it("an account made with the development sign-in keeps its data by setting a username and password; other sessions end", async () => {
    const first = (await post("/auth/dev-login", { displayName: "Carla" })).cookie!;
    const second = (await post("/auth/dev-login", { displayName: "Carla" })).cookie!;
    const set = await call("/me/credentials", { method: "PUT", cookie: first, body: JSON.stringify({ username: "carla", password: "carla-password" }) });
    expect(set.res.status).toBe(200);
    expect((await call("/me", { cookie: first })).res.status).toBe(200);
    expect((await call("/me", { cookie: second })).res.status).toBe(401); // the other session is gone
    expect((await post("/auth/dev-login", { displayName: "Carla" })).res.status).toBe(409);
    // Changing it later needs the current password.
    expect((await call("/me/credentials", { method: "PUT", cookie: first, body: JSON.stringify({ username: "carla", password: "new-password-1" }) })).res.status).toBe(401);
    expect((await call("/me/credentials", { method: "PUT", cookie: first, body: JSON.stringify({ username: "carla", password: "new-password-1", currentPassword: "carla-password" }) })).res.status).toBe(200);
    expect((await post("/auth/login", { username: "carla", password: "new-password-1" })).res.status).toBe(200);
  });

  it("limits guessing", async () => {
    await post("/auth/register", { username: "dani", password: "dani-password" }, { ip: "10.0.0.5" });
    let last = 0;
    for (let i = 0; i < 11; i++) last = (await post("/auth/login", { username: "dani", password: `guess-${i}-xxxx` }, { ip: `10.1.0.${i}` })).res.status;
    expect(last).toBe(429); // per username, from any address
    for (let i = 0; i < 6; i++) last = (await post("/auth/register", { username: `spam${i}`, password: "spam-password" }, { ip: "10.9.9.9" })).res.status;
    expect(last).toBe(429); // sign-ups per address
  });
});

it('requires the original dev token and never opens password accounts with it',async()=>{
 const owner=await post('/auth/dev-login',{displayName:'TokenOwner',token:'b'.repeat(64)});
 expect(owner.res.status).toBe(200);
 expect((await post('/auth/dev-login',{displayName:'TokenOwner',token:'c'.repeat(64)})).res.status).toBe(409);
 expect((await call('/auth/dev-login',{method:'POST',body:JSON.stringify({displayName:'TokenOwner'})})).res.status).toBe(400);
 const again=await post('/auth/dev-login',{displayName:'TokenOwner',token:'b'.repeat(64)});
 expect(again.body.user.id).toBe(owner.body.user.id);
 const [stored]=await database.db.select().from(schema.users).where(eq(schema.users.id,owner.body.user.id));
 expect(stored!.devLoginTokenHash).not.toBe('b'.repeat(64));
 await call('/me/credentials',{method:'PUT',cookie:owner.cookie!,body:JSON.stringify({username:'tokenowner',password:'test-password-long'})});
 expect((await post('/auth/dev-login',{displayName:'TokenOwner',token:'b'.repeat(64)})).res.status).toBe(409);
});
it('requires a valid owner session to bind a legacy dev identity',async()=>{
 const {hashToken}=await import('./auth.js');
 const [legacy]=await database.db.insert(schema.users).values({displayName:'LegacyOwner'}).returning();
 expect((await post('/auth/dev-login',{displayName:'LegacyOwner',token:'d'.repeat(64)})).res.status).toBe(409);
 await database.db.insert(schema.sessions).values({userId:legacy!.id,tokenHash:hashToken('legacy-session'),expiresAt:new Date(Date.now()+60000)});
 const bound=await post('/auth/dev-login',{displayName:'LegacyOwner',token:'d'.repeat(64)},{cookie:'coach_session=legacy-session'});
 expect(bound.res.status).toBe(200);expect(bound.body.user.id).toBe(legacy!.id);
 expect((await post('/auth/dev-login',{displayName:'LegacyOwner',token:'e'.repeat(64)})).res.status).toBe(409);
});
it('lets a signed-in legacy dev user bind this browser and sign back in after logging out',async()=>{
 const {hashToken}=await import('./auth.js');
 // A passwordless account from before migration 0012: an open session and no dev token.
 const [legacy]=await database.db.insert(schema.users).values({displayName:'LegacyLogout'}).returning();
 await database.db.insert(schema.sessions).values({userId:legacy!.id,tokenHash:hashToken('legacy-logout'),expiresAt:new Date(Date.now()+60000)});
 const cookie='coach_session=legacy-logout';
 expect((await call('/me',{cookie})).body.user.devLoginBound).toBe(false);
 const bind=await post('/me/dev-token',{token:'1'.repeat(64)},{cookie});
 expect(bind.res.status).toBe(200);
 expect((await call('/me',{cookie})).body.user.devLoginBound).toBe(true);
 // Binding again from the same browser is harmless; another browser cannot replace it.
 expect((await post('/me/dev-token',{token:'1'.repeat(64)},{cookie})).res.status).toBe(200);
 expect((await post('/me/dev-token',{token:'2'.repeat(64)},{cookie})).res.status).toBe(409);
 // The ordinary logout no longer locks the profile: the same browser signs back in by name.
 await post('/auth/logout',{},{cookie});
 const back=await post('/auth/dev-login',{displayName:'LegacyLogout',token:'1'.repeat(64)});
 expect(back.res.status).toBe(200);expect(back.body.user.id).toBe(legacy!.id);
 expect((await post('/auth/dev-login',{displayName:'LegacyLogout',token:'2'.repeat(64)})).res.status).toBe(409);
});
it('binds dev tokens only for signed-in passwordless accounts without a name clash',async()=>{
 const {hashToken}=await import('./auth.js');
 expect((await post('/me/dev-token',{token:'3'.repeat(64)})).res.status).toBe(401);
 const withPassword=await post('/auth/register',{username:'bindpass',password:'bind-password-long'},{ip:'10.4.4.4'});
 expect((await post('/me/dev-token',{token:'3'.repeat(64)},{cookie:withPassword.cookie!})).res.status).toBe(409);
 expect((await post('/me/dev-token',{token:'short'},{cookie:withPassword.cookie!})).res.status).toBe(400);
 // Two legacy rows share a name: only one can hold a token for it, so the other cannot bind.
 const owner=await post('/auth/dev-login',{displayName:'SharedLegacy',token:'4'.repeat(64)});
 expect(owner.res.status).toBe(200);
 const [twin]=await database.db.insert(schema.users).values({displayName:'SharedLegacy'}).returning();
 await database.db.insert(schema.sessions).values({userId:twin!.id,tokenHash:hashToken('shared-twin'),expiresAt:new Date(Date.now()+60000)});
 expect((await post('/me/dev-token',{token:'5'.repeat(64)},{cookie:'coach_session=shared-twin'})).res.status).toBe(409);
});
it('allows only one token to claim a new name concurrently',async()=>{
 const results=await Promise.all(['e','f'].map(t=>post('/auth/dev-login',{displayName:'ConcurrentOwner',token:t.repeat(64)})));
 expect(results.map(r=>r.res.status).sort()).toEqual([200,409]);
 const rows=await database.db.select().from(schema.users).where(eq(schema.users.displayName,'ConcurrentOwner'));
 expect(rows).toHaveLength(1);
});
