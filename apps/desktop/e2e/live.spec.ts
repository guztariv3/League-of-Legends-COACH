import { expect, test } from "@playwright/test";

test("live window: waiting state, demo game, controls", async ({ page }) => {
  await page.goto("/?demoSpeed=150");
  await expect(page.getByText("Waiting for a game")).toBeVisible();
  await expect(page.getByText(/try the demo/)).toBeVisible();

  await page.getByText("Settings", { exact: true }).click();
  await expect(page.getByText(/never gives you orders/)).toBeVisible();
  await page.getByRole("button", { name: "Try the demo" }).click();
  await expect(page.getByText("◆ Demo")).toBeVisible();

  // At 150x, level 6 arrives within a few seconds; the Coach speaks rarely and briefly.
  await expect(page.locator(".message")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel("Your game")).toContainText("Level");
  await page.screenshot({ path: "test-results/live-message.png" });

  await page.getByRole("button", { name: "Mute" }).click();
  await expect(page.getByText("Muted.")).toBeVisible();
  await expect(page.locator(".message")).toHaveCount(0);
  await page.getByRole("button", { name: "Unmute" }).click();
  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByText("Paused.")).toBeVisible();
});
