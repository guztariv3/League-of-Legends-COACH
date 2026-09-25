import { expect, test } from "@playwright/test";

test("public pages: presentation with download, privacy, terms and Riot's notice", async ({ page }, info) => {
  await page.goto("/info/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tu coach personal de League of Legends");
  const download = page.getByRole("link", { name: "Descargar para Windows" });
  await expect(download).toHaveAttribute("href", /github\.com\/.+\/releases\/latest$/);
  await expect(page.getByText(/isn't endorsed by Riot Games/)).toBeVisible();
  await page.screenshot({ path: `test-results/info-${info.project.name}.png`, fullPage: true });

  await page.getByRole("contentinfo").getByRole("link", { name: "Privacidad" }).click();
  await expect(page).toHaveURL(/\/info\/privacidad$/);
  await expect(page.getByRole("heading", { name: "Política de privacidad" })).toBeVisible();
  await expect(page.getByText(/se borran automáticamente a los 30 días/)).toBeVisible();
  await expect(page).toHaveTitle(/Privacidad/);

  await page.getByRole("contentinfo").getByRole("link", { name: "Términos" }).click();
  await expect(page.getByRole("heading", { name: "Términos de uso" })).toBeVisible();

  // No horizontal scroll on phones.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("the app shows the legal footer too", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("contentinfo").getByRole("link", { name: "Privacidad" })).toHaveAttribute("href", "/info/privacidad");
});
