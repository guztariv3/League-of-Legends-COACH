import { expect, test } from "@playwright/test";

async function onboard(page: import("@playwright/test").Page, player: string) {
  await page.goto("/");
  await page.getByLabel("Your name").fill(player);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByLabel("Riot ID").fill(`${player}#EUW`);
  await page.getByRole("button", { name: "Link and analyze" }).click();
  await expect(page.getByText(/Based on \d+ analyzable games/)).toBeVisible({ timeout: 30_000 });
}

test("profile, goals, memory, search and champion page", async ({ page }, info) => {
  const player = `P2${info.project.name}`;
  await onboard(page, player);

  // Search → matchup results, only navigation
  const search = page.getByRole("combobox", { name: "Search" });
  await search.fill("Aurelith vs Korvane");
  await expect(page.getByRole("option").first()).toContainText("Aurelith vs Korvane");
  await search.press("Enter");
  await expect(page).toHaveURL(/champion=Aurelith&opponent=Korvane/);
  await expect(page.locator(".badge", { hasText: "vs Korvane" })).toBeVisible();

  // Profile
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Profile" }).click();
  await expect(page.getByRole("heading", { name: "Your profile" })).toBeVisible();
  await expect(page.getByText("Laning phase").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your progress" })).toBeVisible();
  await page.getByText(/See timeline/).click().catch(() => {});
  await page.screenshot({ path: `test-results/profile-${info.project.name}.png`, fullPage: true });

  // Create a goal
  await page.getByLabel("Create your own goal").selectOption({ label: "Deaths per minute" });
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("article", { name: /Goal: Deaths per minute/ })).toBeVisible();
  await expect(page.getByText("No games yet since you accepted this goal.")).toBeVisible();

  // Memory: focus + note, then forget the note
  await page.getByLabel("What do you want to focus on?").selectOption({ label: "CS per minute" });
  await expect(page.getByText("I want to focus on: CS per minute")).toBeVisible();
  await page.getByLabel("Add a note for the Coach").fill("I play with a controller");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("I play with a controller")).toBeVisible();
  await page.getByRole("button", { name: "Forget: I play with a controller" }).click();
  await expect(page.getByText("I play with a controller")).toHaveCount(0);

  // Decision history (hedged, no causality)
  await page.getByText(/Recommendation and decision history/).click();
  await expect(page.getByText(/does not prove the recommendation caused it/)).toBeVisible();

  // Champion page personal layer
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Champions" }).click();
  await page.getByRole("link", { name: /Aurelith/ }).first().click();
  await expect(page.getByRole("heading", { name: "Aurelith", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Abilities" })).toBeVisible();
  await page.getByRole("tab", { name: "Build" }).click();
  await expect(page.getByRole("heading", { name: /Your usual setup/ })).toBeVisible();
  await page.getByRole("tab", { name: "Skills" }).click();
  await expect(page.getByRole("heading", { name: "Your skill order" })).toBeVisible();
  await page.getByRole("tab", { name: "Matchups" }).click();
  await expect(page.getByRole("heading", { name: "Your matchups" })).toBeVisible();
  await page.getByRole("tab", { name: "Your stats" }).click();
  await expect(page.getByText(/vs your other champions/)).toBeVisible();
  await page.screenshot({ path: `test-results/champion-${info.project.name}.png`, fullPage: true });
});
