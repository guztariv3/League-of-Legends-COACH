import { expect, test } from "@playwright/test";

async function onboard(page: import("@playwright/test").Page, player: string) {
  await page.goto("/");
  await page.getByText("Development sign-in (private prototype only)").click();
  await page.getByLabel("Your name").fill(player);
  await page.getByRole("button", { name: "Sign in with a name" }).click();
  await page.getByLabel("Riot ID").fill(`${player}#EUW`);
  await page.getByRole("button", { name: "Link and analyze" }).click();
  await expect(page.getByText(/Based on \d+ analyzable games/)).toBeVisible({ timeout: 30_000 });
}

test("match review, manual draft and scouting", async ({ page }, info) => {
  const player = `P3${info.project.name}`;
  await onboard(page, player);

  let reviewPayload: any;
  await page.route("**/api/matches/*/review", async route => {
    const response = await route.fetch();
    reviewPayload = await response.json();
    await route.fulfill({ response });
  }, { times: 1 });
  // Match review from a Summoner's Rift game
  await page.goto("/matches?mode=summoners_rift");
  await page.locator(".match").first().click();
  await page.getByRole("link", { name: "Coach Review and map" }).click();
  await expect(page.getByRole("heading", { name: "Game review" })).toBeVisible();
  // Coach Review: eight sections, each with its lines or an honest "not enough data".
  const coachReview = page.getByRole("region", { name: "Coach Review" });
  for (const title of ["What went well", "What hurt your game", "Biggest mistake", "Missed opportunity", "Build decision", "Skill decision", "Macro decision", "Next-game focus"]) {
    await expect(coachReview.getByRole("heading", { name: title })).toBeVisible();
  }
  await expect(coachReview.getByText(/Item data for this patch isn't loaded/)).toBeVisible();
  await expect(coachReview.getByText(/Epic monsters: your team \d+, enemy \d+/)).toBeVisible();
  await expect(page.getByRole("img", { name: /Positions at minute \d+/ })).toBeVisible();
  await page.getByRole("button", { name: "Forward one minute" }).click();
  await page.getByRole("button", { name: "Next moment" }).click();
  await page.getByText("What this review cannot know").click();
  await expect(page.getByText(/one snapshot per minute/)).toBeVisible();
  await page.screenshot({ path: `test-results/review-${info.project.name}.png`, fullPage: true });
  await page.getByLabel("Impact map").check();
  await expect(page.getByRole("img", { name: /Impact map/ })).toBeVisible();

  // Client-side navigation to a shorter replay resets the old playback position.
  const nextMatch = "REPLAY_SHORT_FIXTURE";
  const shortReview = structuredClone(reviewPayload);
  shortReview.review.matchId = nextMatch;
  shortReview.review.frames = shortReview.review.frames.slice(0, 1);
  shortReview.review.highlights = [];
  await page.route(`**/api/matches/${nextMatch}/review`, route => route.fulfill({ json: shortReview }));
  await page.evaluate(id => {
    history.pushState({}, "", `/matches/${id}/review`);
    dispatchEvent(new PopStateEvent("popstate"));
  }, nextMatch);
  await expect(page.getByRole("img", { name: "Positions at minute 0", exact: true })).toBeVisible();
  await expect(page.getByLabel("Impact map")).not.toBeChecked();

  // Pre-game area
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Live", exact: true }).click();
  await page.getByRole("link", { name: "Prepare a draft manually" }).click();
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

  // A delayed analysis belongs to the selection that requested it, never a later one.
  let release!: () => void;
  let started!: () => void;
  const waiting = new Promise<void>(resolve => { started = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/draft", async route => {
    const response = await route.fetch();
    started();
    await gate;
    await route.fulfill({ response });
  }, { times: 1 });
  await page.getByRole("button", { name: "Analyze", exact: true }).click();
  await waiting;
  await page.getByLabel("Your champion").selectOption({ label: "Veyl" });
  await expect(plan).toHaveCount(0);
  const received = page.waitForResponse(r => r.url().endsWith("/api/draft"));
  release();
  await received;
  await expect(plan).toHaveCount(0);
  await page.getByRole("button", { name: "Analyze", exact: true }).click();
  await expect(plan).toBeVisible();

  await page.getByRole("button", { name: "Find my game" }).click();
  await expect(page.getByRole("heading", { name: "Your opponents" })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("article.rival").filter({ hasText: /Enemy \d#SYN/ })).toHaveCount(5);
  // Honest about what Riot did not provide in the synthetic environment.
  await expect(page.locator("article.rival").first()).toContainText("Rank unavailable");
  await page.screenshot({ path: `test-results/game-${info.project.name}.png`, fullPage: true });
});
