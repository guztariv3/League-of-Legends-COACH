import { expect, test } from "@playwright/test";

test("live window: waiting state, demo game, controls", async ({ page }) => {
  await page.goto("/?demoSpeed=150");
  await expect(page.getByText("Waiting for a game")).toBeVisible();
  await expect(page.getByText(/try the demo/)).toBeVisible();

  await page.getByRole("tablist", { name: "Sections" }).getByRole("tab", { name: "Settings" }).click();
  await expect(page.getByText(/never gives you orders/)).toBeVisible();
  await page.getByRole("button", { name: "Try the demo" }).click();
  await expect(page.getByText("◆ Demo")).toBeVisible();
  // The demo opens the in-game sections in the top navigation.
  await expect(page.getByRole("tablist", { name: "Sections" }).getByRole("tab", { name: "Items" })).toHaveAttribute("aria-selected", "true");

  // At 150x, level 6 arrives within a few seconds; the Coach speaks rarely and briefly.
  await expect(page.locator(".message")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel("Your game")).toContainText("Level");
  await page.screenshot({ path: "test-results/live-message.png" });

  // The Coach's controls live in Settings (the top of the window is the navigation).
  await page.getByRole("tablist", { name: "Sections" }).getByRole("tab", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Mute" }).click();
  await page.getByRole("tablist", { name: "Sections" }).getByRole("tab", { name: "Items" }).click();
  await expect(page.getByText("Muted.")).toBeVisible();
  await expect(page.locator(".message")).toHaveCount(0);
  await page.getByRole("tablist", { name: "Sections" }).getByRole("tab", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Unmute" }).click();
  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByText("Paused", { exact: true })).toBeVisible(); // title bar
  await page.getByRole("tablist", { name: "Sections" }).getByRole("tab", { name: "Items" }).click();
  await expect(page.getByText("Paused.")).toBeVisible();
});
