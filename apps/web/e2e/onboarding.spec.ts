import { expect, test } from "@playwright/test";

test("onboarding → dashboard → matches → match detail → settings", async ({ page }, info) => {
  const player = `E2E${info.project.name}`;
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "KOI Master" })).toBeVisible();
  await expect(page.getByText("Synthetic data")).toBeVisible();

  await page.getByLabel("Your name").fill(player);
  await page.getByRole("button", { name: "Sign in" }).click();

  await page.getByLabel("Riot ID").fill(`${player}#EUW`);
  await page.getByLabel("Region").selectOption("euw1");
  await page.getByRole("button", { name: "Link and analyze" }).click();

  await expect(page.getByRole("heading", { name: `Hi, ${player}` })).toBeVisible();
  // First sync (50 games) finishes and the dashboard fills in.
  await expect(page.getByText(/Based on \d+ analyzable games/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "What matters most now" })).toBeVisible();
  await page.screenshot({ path: `test-results/dashboard-${info.project.name}.png`, fullPage: true });

  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Matches" }).click();
  await expect(page).toHaveURL(/\/matches$/);
  await expect(page.locator('p[aria-live="polite"]', { hasText: /^\d+ games/ })).toBeVisible();
  await page.getByLabel("Result").selectOption("win");
  await expect(page).toHaveURL(/result=win/);
  await page.getByLabel("Mode").selectOption("summoners_rift");
  await expect(page).toHaveURL(/mode=summoners_rift/);
  // Wait until the list reflects the filters (every visible game is a win) before opening one.
  await expect(page.locator(".match .match-bar.loss")).toHaveCount(0);
  await page.locator(".match").first().click();
  await expect(page.getByRole("link", { name: "← Matches" })).toBeVisible();
  await expect(page.getByText("▲ Victory")).toBeVisible(); // the result badge (the scoreboard also says "Victory")
  // Your place in the game (1–10) and how it's computed.
  await expect(page.getByLabel(/Ranked \d+ of 10 in this game/)).toBeVisible();
  await page.getByText("How the ranking works").click();
  await expect(page.getByText(/it doesn't measure decisions/)).toBeVisible();
  await page.screenshot({ path: `test-results/match-${info.project.name}.png`, fullPage: true });

  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page.getByText(`${player}#EUW`)).toBeVisible();
  await expect(page.getByText("unverified")).toBeVisible();

  // Desktop app pairing: a one-time code with its expiry and the address to type in the app.
  await page.getByRole("button", { name: "Generate connection code" }).click();
  await expect(page.locator(".pair-code-value")).toHaveText(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  await expect(page.getByText(/Expires in \d+:\d{2}/)).toBeVisible();
});
