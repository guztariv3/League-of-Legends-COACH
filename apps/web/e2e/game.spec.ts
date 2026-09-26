import { expect, test } from "@playwright/test";

async function onboard(page: import("@playwright/test").Page, player: string) {
  await page.goto("/");
  await page.getByLabel("Your name").fill(player);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByLabel("Riot ID").fill(`${player}#EUW`);
  await page.getByRole("button", { name: "Link and analyze" }).click();
  await expect(page.getByText(/Based on \d+ analyzable games/)).toBeVisible({ timeout: 30_000 });
}

test("match review, manual draft and scouting", async ({ page }, info) => {
  const player = `P3${info.project.name}`;
  await onboard(page, player);

  // Match review from a Summoner's Rift game
  await page.goto("/matches?mode=summoners_rift");
  await page.locator(".match").first().click();
  await page.getByRole("link", { name: "Review the game on the map" }).click();
  await expect(page.getByRole("heading", { name: "Game review" })).toBeVisible();
  await expect(page.getByRole("img", { name: /Positions at minute \d+/ })).toBeVisible();
  await page.getByRole("button", { name: "Forward one minute" }).click();
  await page.getByRole("button", { name: "Next moment" }).click();
  await page.getByText("What this review cannot know").click();
  await expect(page.getByText(/one snapshot per minute/)).toBeVisible();
  await page.screenshot({ path: `test-results/review-${info.project.name}.png`, fullPage: true });
  await page.getByLabel("Impact map").check();
  await expect(page.getByRole("img", { name: /Impact map/ })).toBeVisible();

  // Pre-game area
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Pre-game" }).click();
  await page.getByLabel("Your champion").selectOption({ label: "Aurelith" });
  await page.getByLabel("Enemy 1").selectOption({ label: "Veyl" });
  await page.getByLabel("Enemy 2").selectOption({ label: "Myrr" });
  await page.getByLabel("Enemy 3").selectOption({ label: "Nimue" });
  await page.getByRole("button", { name: "Analyze" }).click();
  await expect(page.getByText("This is what matters most").first()).toBeVisible();
  // The Coach's game plan, each line with what it rests on.
  const plan = page.getByRole("region", { name: "Coach game plan" });
  await expect(plan).toBeVisible();
  await expect(plan).toContainText("Biggest threat");
  await expect(plan).toContainText("Your power spike");
  await expect(plan).toContainText(/Your usual setup \(\d+ games\)/);
  await page.screenshot({ path: `test-results/gameplan-${info.project.name}.png`, fullPage: true });

  await page.getByRole("button", { name: "Find my game" }).click();
  await expect(page.getByRole("heading", { name: "Your opponents" })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("article.rival").filter({ hasText: /Enemy \d#SYN/ })).toHaveCount(5);
  // Honest about what Riot did not provide in the synthetic environment.
  await expect(page.locator("article.rival").first()).toContainText("Rank unavailable");
  await page.screenshot({ path: `test-results/game-${info.project.name}.png`, fullPage: true });
});
