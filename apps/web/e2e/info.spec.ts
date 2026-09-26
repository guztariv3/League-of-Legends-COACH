import { expect, test } from "@playwright/test";

test("public pages: presentation with download, privacy, terms and Riot's notice", async ({ page }, info) => {
  await page.goto("/info/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your personal League of Legends coach");
  const download = page.getByRole("link", { name: "Download for Windows" });
  await expect(download).toHaveAttribute("href", /github\.com\/.+\/releases\/latest$/);
  await expect(page.getByText(/isn't endorsed by Riot Games/)).toBeVisible();
  await page.screenshot({ path: `test-results/info-${info.project.name}.png`, fullPage: true });

  await page.getByRole("contentinfo").getByRole("link", { name: "Privacy" }).click();
  await expect(page).toHaveURL(/\/info\/privacy$/);
  await expect(page.getByRole("heading", { name: "Privacy policy" })).toBeVisible();
  await expect(page.getByText(/is deleted automatically after 30 days/)).toBeVisible();
  await expect(page).toHaveTitle(/Privacy/);

  await page.getByRole("contentinfo").getByRole("link", { name: "Terms" }).click();
  await expect(page.getByRole("heading", { name: "Terms of use" })).toBeVisible();

  // No horizontal scroll on phones.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("the app shows the legal footer too", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("contentinfo").getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/info/privacy");
});
