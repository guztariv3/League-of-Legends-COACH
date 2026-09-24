import { readFileSync } from "node:fs";
import { join } from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { basicAuth } from "hono/basic-auth";
import { secureHeaders } from "hono/secure-headers";
import { createApp, type AppDeps } from "./app.js";

/**
 * Production entry: API and web app from a single origin (simple cookies,
 * strict CSRF origin check), optional prototype password over everything
 * except the health check, and security headers.
 */
export function createSite(deps: AppDeps) {
  const { app: api, sync } = createApp(deps);
  const site = new Hono();

  site.use(
    "*",
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
      },
    }),
  );

  const password = deps.cfg.prototypePassword;
  if (password) {
    const gate = basicAuth({ username: "kairos", password, realm: "Kairos Coach (prototipo privado)" });
    site.use("*", async (c, next) => (c.req.path === "/api/health" ? next() : gate(c, next)));
  }

  site.route("/", api);

  const dist = deps.cfg.webDist;
  if (dist) {
    site.use("/*", serveStatic({ root: dist }));
    // SPA fallback: any non-API route serves the app shell.
    const shell = readFileSync(join(dist, "index.html"), "utf8");
    site.get("*", (c) => (c.req.path.startsWith("/api/") ? c.notFound() : c.html(shell)));
  }

  return { site, sync };
}
