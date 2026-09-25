import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { syntheticSource as syntheticKnowledge } from "@coach/knowledge";
import { devLoginAllowed, loadConfig } from "./config.js";
import { openDatabase, type Database } from "./db/index.js";
import { bootKnowledge } from "./knowledge.js";
import { createSite } from "./site.js";
import { syntheticSource } from "./sources.js";

let database: Database;
let site: ReturnType<typeof createSite>["site"];
const PASSWORD = "correct-horse-battery";
const auth = `Basic ${Buffer.from(`kairos:${PASSWORD}`).toString("base64")}`;

beforeAll(async () => {
  database = await openDatabase(undefined, undefined);
  const dist = mkdtempSync(join(tmpdir(), "kairos-web-"));
  writeFileSync(join(dist, "index.html"), "<!doctype html><title>KOI Master</title><div id=root></div>");
  writeFileSync(join(dist, "app.js"), "console.log('ok')");
  mkdirSync(join(dist, "info"));
  writeFileSync(join(dist, "info", "index.html"), "<!doctype html><title>KOI Master info</title><div id=root></div>");
  mkdirSync(join(dist, "assets"));
  writeFileSync(join(dist, "assets", "info-abc.js"), "console.log('public')");
  const cfg = loadConfig({ NODE_ENV: "production", PROTOTYPE_PASSWORD: PASSWORD, DEV_LOGIN: "1", WEB_DIST: dist, RENDER_EXTERNAL_URL: "https://kairos.example" });
  const knowledge = await bootKnowledge(database.db, syntheticKnowledge());
  site = createSite({ cfg, db: database.db, source: syntheticSource(), knowledge, aiProviders: [] }).site;
}, 30_000);
afterAll(() => database.close());

describe("production site", () => {
  it("keeps the health check open for the platform but gates everything else", async () => {
    expect((await site.request("/api/health")).status).toBe(200);
    expect((await site.request("/api/config")).status).toBe(401);
    expect((await site.request("/")).status).toBe(401);
    expect((await site.request("/api/config", { headers: { Authorization: `Basic ${Buffer.from("kairos:wrong").toString("base64")}` } })).status).toBe(401);
  });

  it("serves the public pages without the password, and nothing private", async () => {
    for (const path of ["/info/", "/info/privacidad", "/info/terminos"]) {
      const res = await site.request(path);
      expect(res.status, path).toBe(200);
      expect(await res.text()).toContain("KOI Master info");
    }
    expect((await site.request("/info")).status).toBe(200);
    expect(await (await site.request("/assets/info-abc.js")).text()).toContain("public");
    // The app itself, its API and anything else stay behind the gate.
    for (const path of ["/", "/settings", "/app.js", "/api/me", "/api/assets", "/informacion", "/api/info/"]) {
      expect((await site.request(path)).status, path).toBe(401);
    }
  });

  it("lets only the desktop device routes past the gate, which then need their own credentials", async () => {
    expect((await site.request("/api/desktop/scout")).status).toBe(401);
    const claim = await site.request("/api/desktop/claim", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: "ABCD-EFGH" }) });
    expect(claim.status).toBe(401);
    expect(((await claim.json()) as { error: string }).error).toBe("invalid_code");
    // Pairing a new device needs the web session, so it stays behind the gate.
    expect((await site.request("/api/desktop/pair", { method: "POST" })).status).toBe(401);
    expect((await site.request("/api/desktop/devices")).headers.get("www-authenticate")).toContain("Basic");
  });

  it("serves the API, static files and the SPA shell from one origin", async () => {
    const cfg = await site.request("/api/config", { headers: { Authorization: auth } });
    expect((await cfg.json() as { auth: { devLogin: boolean } }).auth.devLogin).toBe(true);
    expect(await (await site.request("/app.js", { headers: { Authorization: auth } })).text()).toContain("ok");
    const deep = await site.request("/matches/EUW1_1/review", { headers: { Authorization: auth } });
    expect(deep.status).toBe(200);
    expect(await deep.text()).toContain("KOI Master");
    // Unknown API paths never fall back to the HTML shell (they answer JSON, here "session required").
    const api = await site.request("/api/nope", { headers: { Authorization: auth } });
    expect(api.status).not.toBe(200);
    expect(api.headers.get("content-type")).toContain("application/json");
  });

  it("sends security headers", async () => {
    const res = await site.request("/", { headers: { Authorization: auth } });
    expect(res.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("uses the platform URL as the allowed origin for writes", async () => {
    const evil = await site.request("/api/auth/dev-login", { method: "POST", body: "{}", headers: { Authorization: auth, "Content-Type": "application/json", Origin: "https://evil.example" } });
    expect(evil.status).toBe(403);
    const ok = await site.request("/api/auth/dev-login", { method: "POST", body: JSON.stringify({ displayName: "Tester" }), headers: { Authorization: auth, "Content-Type": "application/json", Origin: "https://kairos.example" } });
    expect(ok.status).toBe(200);
  });
});

describe("dev login in production", () => {
  it("requires DEV_LOGIN and a strong prototype password", () => {
    expect(devLoginAllowed(loadConfig({ NODE_ENV: "production", DEV_LOGIN: "1" }))).toBe(false);
    expect(devLoginAllowed(loadConfig({ NODE_ENV: "production", DEV_LOGIN: "1", PROTOTYPE_PASSWORD: "short" }))).toBe(false);
    expect(devLoginAllowed(loadConfig({ NODE_ENV: "production", PROTOTYPE_PASSWORD: PASSWORD }))).toBe(false);
    expect(devLoginAllowed(loadConfig({ NODE_ENV: "production", DEV_LOGIN: "1", PROTOTYPE_PASSWORD: PASSWORD }))).toBe(true);
  });
});
