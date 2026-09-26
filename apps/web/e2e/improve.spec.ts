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

  // Champion pool: most played first, with an honest verdict.
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
