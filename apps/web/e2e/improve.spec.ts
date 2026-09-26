import { expect, test } from "@playwright/test";

test("improve: champion pool, matchups, LP and activity", async ({ page }, info) => {
  const player = `Imp${info.project.name}`;
  await page.goto("/");
  await page.getByLabel("Your name").fill(player);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByLabel("Riot ID").fill(`${player}#EUW`);
  await page.getByRole("button", { name: "Link and analyze" }).click();
  await expect(page.getByText(/Based on \d+ analyzable games/)).toBeVisible({ timeout: 30_000 });

  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Improve" }).click();
  await expect(page.getByRole("heading", { name: "Improve", exact: true })).toBeVisible();

  // Challenges (default tab): accept one, see its 5 slots, then drop it.
  const mine = page.getByRole("region", { name: "Your challenges" });
  await expect(mine.getByText(/No challenge running/)).toBeVisible();
  const suggest = page.getByRole("region", { name: "Try one" });
  await expect(suggest.getByText(/You reached it in \d+ of your last \d+ games/).first()).toBeVisible();
  await suggest.getByRole("button", { name: "3 of my next 5 games" }).first().click();
  await expect(mine.getByText(/in 3 of your next 5 games/)).toBeVisible();
  await expect(mine.getByText("No games yet since you accepted it.")).toBeVisible();
  await page.screenshot({ path: `test-results/challenges-${info.project.name}.png`, fullPage: true });
  await mine.getByRole("button", { name: /Drop challenge/ }).click();
  await expect(mine.getByText(/No challenge running/)).toBeVisible();

  // Champion pool: most played first, with an honest verdict.
  await page.getByRole("tab", { name: "Champion pool" }).click();
  const pool = page.getByRole("region", { name: "Champion pool" });
  await expect(pool.getByRole("row")).not.toHaveCount(0);
  await expect(pool.getByText(/Clearly winning|Clearly losing|Not clearly above or below 50%|Fewer than 5 games/).first()).toBeVisible();

  // Matchups, then only for one champion.
  await page.getByRole("tab", { name: "Matchups" }).click();
  await expect(page.getByRole("heading", { name: "Lane opponents" })).toBeVisible();
  await page.getByLabel("Playing").selectOption({ index: 1 });
  await expect(page.getByRole("heading", { name: /Lane opponents when you play/ })).toBeVisible();
  await expect(page).toHaveURL(/tab=matchups.*champion=|champion=.*tab=matchups/);

  // LP: synthetic accounts have no rank, and the page says so.
  await page.getByRole("tab", { name: "LP" }).click();
  await expect(page.getByText(/No ranked games recorded yet/)).toBeVisible();

  // Activity calendar with a summary and a list view.
  await page.getByRole("tab", { name: "Activity" }).click();
  await expect(page.getByRole("grid", { name: /Games per day/ })).toBeVisible();
  await expect(page.getByText("Games in the last 30 days")).toBeVisible();
  await page.screenshot({ path: `test-results/improve-${info.project.name}.png`, fullPage: true });
});
