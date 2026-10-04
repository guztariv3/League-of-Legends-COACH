import { expect, test } from "@playwright/test";

/**
 * Accounts created before dev tokens have none bound (migration 0012). The web must bind this
 * browser's token while the session is still valid; otherwise an ordinary logout leaves the name
 * unclaimable. The test server's accounts always have a token, so /me is reported as legacy here.
 */
test("a legacy passwordless session binds this browser's dev token", async ({ page }, info) => {
  const bindings: string[] = [];
  await page.route("**/api/me", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const res = await route.fetch();
    const body = await res.json();
    if (body?.user) body.user.devLoginBound = bindings.length > 0;
    await route.fulfill({ response: res, json: body });
  });
  page.on("request", (req) => {
    if (req.method() === "POST" && req.url().endsWith("/api/me/dev-token")) bindings.push(req.postDataJSON().token);
  });

  await page.goto("/");
  await page.getByText("Development sign-in (private prototype only)").click();
  await page.getByLabel("Your name").fill(`Legacy${info.project.name}`);
  await page.getByRole("button", { name: "Sign in with a name" }).click();
  await expect(page.getByLabel("Riot ID")).toBeVisible();

  await expect.poll(() => bindings.length).toBe(1);
  const stored = await page.evaluate(() => localStorage.getItem("koi_dev_login_token"));
  expect(bindings[0]).toBe(stored);
});

test("password accounts never send a dev token", async ({ page }, info) => {
  const bindings: string[] = [];
  page.on("request", (req) => { if (req.url().endsWith("/api/me/dev-token")) bindings.push(req.method()); });
  await page.goto("/");
  await page.getByRole("tab", { name: "Create account" }).click();
  await page.getByLabel("Username").fill(`pw${info.project.name}`);
  await page.getByLabel("Password").fill("e2e-password-123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByLabel("Riot ID")).toBeVisible();
  expect(bindings).toEqual([]);
});
