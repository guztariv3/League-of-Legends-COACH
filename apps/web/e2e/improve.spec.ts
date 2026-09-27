import { expect, test } from "@playwright/test";

test("profile tabs (champion pool, matchups, LP gains, activity) and challenges", async ({ page }, info) => {
  const player = `Imp${info.project.name}`;
  await page.goto("/");
  await page.getByLabel("Your name").fill(player);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByLabel("Riot ID").fill(`${player}#EUW`);
  await page.getByRole("button", { name: "Link and analyze" }).click();
  await expect(page.getByText(/Based on \d+ analyzable games/)).toBeVisible({ timeout: 30_000 });

  // Top: queue cards (demo rank), radar, primary role table and performance for the selected queue.
  const queues = page.getByRole("radiogroup", { name: "Queue" });
  await expect(queues.getByRole("radio", { name: /Ranked Solo/ })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("heading", { name: /LP progress tracking/ })).toBeVisible();
  const panel = page.getByRole("region", { name: "Overview for the selected queue" });
  await expect(panel.getByRole("img", { name: /^Radar for / })).toBeVisible();
  await expect(panel.getByRole("columnheader", { name: "LP" })).toBeVisible();
  await expect(panel.getByRole("heading", { name: /Performance overview/ })).toBeVisible();
  await expect(panel.getByText("GD@15")).toBeVisible();
  // Picking a champion row puts that champion on the radar.
  const firstChamp = panel.getByRole("button", { name: /^Show .+ on the radar$/ }).nth(1);
  const champName = ((await firstChamp.getAttribute("aria-label")) ?? "").replace(/^Show | on the radar$/g, "");
  await firstChamp.click();
  await expect(panel.getByRole("img", { name: new RegExp(`^Radar for ${champName}`) })).toBeVisible();
  await expect(page.getByRole("button", { name: "Refresh data" })).toBeVisible();
  await expect(page.getByRole("grid", { name: /Games per day/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Top roles" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Recent summary/ })).toBeVisible();
  await page.screenshot({ path: `test-results/profile-overview-${info.project.name}.png`, fullPage: true });

  // Champion pool: most played first, with an honest verdict.
  await page.getByRole("tab", { name: "Champion pool" }).click();
  const pool = page.getByRole("region", { name: "Champion pool" });
  await expect(pool.getByRole("row")).not.toHaveCount(0);
  await expect(pool.getByText(/Clearly winning|Clearly losing|Not clearly above or below 50%|Fewer than 5 games/).first()).toBeVisible();

  // Matchups, then only for one champion.
  await page.getByRole("tab", { name: "Matchup pool" }).click();
  await expect(page.getByRole("heading", { name: "Lane opponents" })).toBeVisible();
  await page.getByLabel("Playing").selectOption({ index: 1 });
  await expect(page.getByRole("heading", { name: /Lane opponents when you play/ })).toBeVisible();
  await expect(page).toHaveURL(/tab=matchups.*champion=|champion=.*tab=matchups/);

  // LP gains: the chart and the panel of the selected point; the arrow keys move it.
  await page.getByRole("tab", { name: "LP gains" }).click();
  const chart = page.getByRole("img", { name: /Ranked Solo\/Duo: rank after each snapshot/ });
  await expect(chart).toBeVisible();
  const detail = page.getByRole("complementary", { name: "Selected point" });
  await expect(detail.getByText(/^(Victory|Defeat)$/)).toBeVisible();
  await expect(detail.getByText(/^[+-]\d+$/)).toBeVisible();
  await expect(detail.getByRole("link", { name: "Match details" })).toBeVisible();
  const before = await detail.textContent();
  await chart.focus();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await expect(detail).not.toHaveText(before ?? "");
  await page.screenshot({ path: `test-results/profile-lp-${info.project.name}.png`, fullPage: true });
  await detail.getByRole("link", { name: "Match details" }).click();
  await expect(page.getByRole("link", { name: "← Matches" })).toBeVisible();

  // Old Improve links land on the profile tab.
  await page.goto("/improve?tab=lp");
  await expect(page).toHaveURL(/\/\?tab=lp/);

  // Improve is the challenges now: accept one, see its 5 slots, then drop it.
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Improve" }).click();
  await expect(page.getByRole("heading", { name: "Improve", exact: true })).toBeVisible();
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
});
