import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import type { LiveFrame } from "@coach/ui";

// Real HTTP, authentication, database and web polling. Only League's producer is
// represented by fixtures; this does not exercise the native Windows reader.
test("paired device → real API → private Live: ordering, isolation, pause, end and revoke", async ({ page, browser }, info) => {
  const name = `Relay${info.project.name}`;
  expect((await page.request.post("/api/auth/dev-login", { data: { token: "a".repeat(64), displayName: name } })).ok()).toBe(true);
  expect((await page.request.post("/api/accounts", { data: { gameName: name, tagLine: "EUW", platform: "euw1" } })).ok()).toBe(true);
  const pair = await page.request.post("/api/desktop/pair", { data: {} });
  expect(pair.status()).toBe(201);
  const claimed = await page.request.post("/api/desktop/claim", { data: { code: (await pair.json()).code, label: "Integration fixture" } });
  expect(claimed.ok()).toBe(true);
  const headers = { Authorization: `Bearer ${(await claimed.json()).token}` };
  const frame: LiveFrame = { version: 1, streamId: randomUUID(), sequence: 0, capturedAt: Date.now(), phase: "draft", champion: "Ahri", position: "MIDDLE", patch: "16.19.1", time: null, gold: null, allies: ["LeeSin"], enemies: ["Zed"], headline: "Integrated draft", sections: [{ title: "Current decision", primary: true, lines: ["Integration-only advice"] }] };
  const publish = async (changes: Partial<LiveFrame>) => {
    Object.assign(frame, changes, { sequence: frame.sequence + 1, capturedAt: Date.now() });
    const response = await page.request.post("/api/desktop/live", { headers, data: frame });
    expect(response.ok()).toBe(true);
    expect((await response.json()).accepted).toBe(true);
  };
  await publish({});
  await page.goto("/");
  await expect(page).toHaveURL(/\/live$/);
  await expect(page.getByRole("heading", { name: "Integrated draft" })).toBeVisible();
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Matches", exact: true }).click();
  await expect(page).toHaveURL(/\/matches$/);
  await publish({ phase: "pregame", headline: "Integrated pregame" });
  await expect.poll(async () => (await (await page.request.get("/api/live")).json()).frame.phase).toBe("pregame");
  // Wait for the browser's next real polling response before checking that
  // leaving Live deliberately is respected during the same stage.
  await page.waitForResponse(response => response.url().endsWith("/api/live") && response.request().resourceType() === "fetch");
  await expect(page).toHaveURL(/\/matches$/);
  const other = await browser.newContext({ baseURL: info.project.use.baseURL });
  try {
    expect((await other.request.post("/api/auth/dev-login", { data: { token: "a".repeat(64), displayName: `${name}Other` } })).ok()).toBe(true);
    expect((await (await other.request.get("/api/live")).json()).frame).toBeNull();
    for (const phase of ["live"] as const) {
      await publish({ phase, headline: `Integrated ${phase}`, time: phase === "live" ? 600 : null, gold: phase === "live" ? 850 : null });
      await expect(page.getByRole("heading", { name: `Integrated ${phase}` })).toBeVisible();
      await expect(page.getByText("Integration-only advice", { exact: true })).toBeVisible();
    }
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Matches", exact: true }).click();
    await publish({});
    await page.waitForResponse(response => response.url().endsWith("/api/live") && response.request().resourceType() === "fetch");
    await expect(page).toHaveURL(/\/matches$/);
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Live", exact: true }).click();
    const late = await page.request.post("/api/desktop/live", { headers, data: { ...frame, sequence: frame.sequence - 1, headline: "Obsolete advice" } });
    expect(late.ok()).toBe(true);
    expect((await late.json()).accepted).toBe(false);
    expect((await (await page.request.get("/api/live")).json()).frame.headline).toBe("Integrated live");
    const stale = await page.request.post("/api/desktop/live", { headers, data: { ...frame, sequence: frame.sequence + 1, capturedAt: Date.now() - 60_000 } });
    expect(stale.status()).toBe(400);
    expect((await stale.json()).error).toBe("stale_frame");
    for (const phase of ["paused", "reconnecting"] as const) {
      await publish({ phase, headline: `Integrated ${phase}` });
      await expect(page.getByRole("heading", { name: `Integrated ${phase}` })).toBeVisible();
      await expect(page.getByText("Integration-only advice", { exact: true })).toHaveCount(0);
    }
    await publish({ phase: "ended", headline: "Integrated end", sections: [] });
    await expect(page.getByRole("link", { name: "Post-game Coach and match history" })).toBeVisible();
    await publish({ phase: "idle", headline: "Sharing stopped", sections: [] });
    await expect(page.getByRole("heading", { name: "Live Coach", exact: true })).toBeVisible();
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Matches", exact: true }).click();
    await publish({ phase: "live", headline: "New live session" });
    await expect(page).toHaveURL(/\/live$/);
    await expect(page.getByRole("heading", { name: "New live session" })).toBeVisible();
    // If the browser missed the brief end/idle frames, a later draft still
    // identifies a new selection cycle within the same desktop stream.
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Matches", exact: true }).click();
    await publish({ phase: "draft", headline: "Next selection", time: null, gold: null });
    await expect(page).toHaveURL(/\/live$/);
    await expect(page.getByRole("heading", { name: "Next selection" })).toBeVisible();
    const devices = (await (await page.request.get("/api/desktop/devices")).json()).devices;
    expect(devices).toHaveLength(1);
    expect((await page.request.delete(`/api/desktop/devices/${devices[0].id}`)).ok()).toBe(true);
    await expect(page.getByRole("heading", { name: "Live Coach", exact: true })).toBeVisible();
    expect((await page.request.post("/api/desktop/live", { headers, data: { ...frame, sequence: frame.sequence + 1, capturedAt: Date.now() } })).status()).toBe(401);
  } finally { await other.close(); }
});
