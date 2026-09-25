import { expect, test } from "@playwright/test";

test("onboarding → dashboard → matches → match detail → settings", async ({ page }, info) => {
  const player = `E2E${info.project.name}`;
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "KOI Master" })).toBeVisible();
  await expect(page.getByText("Datos sintéticos")).toBeVisible();

  await page.getByLabel("Tu nombre").fill(player);
  await page.getByRole("button", { name: "Entrar" }).click();

  await page.getByLabel("Riot ID").fill(`${player}#EUW`);
  await page.getByLabel("Región").selectOption("euw1");
  await page.getByRole("button", { name: "Vincular y analizar" }).click();

  await expect(page.getByRole("heading", { name: `Hola, ${player}` })).toBeVisible();
  // First sync (50 games) finishes and the dashboard fills in.
  await expect(page.getByText(/Basado en \d+ partidas analizables/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Lo que más importa ahora" })).toBeVisible();
  await page.screenshot({ path: `test-results/dashboard-${info.project.name}.png`, fullPage: true });

  await page.getByRole("navigation", { name: "Principal" }).getByRole("link", { name: "Partidas" }).click();
  await expect(page).toHaveURL(/\/matches$/);
  await expect(page.locator('p[aria-live="polite"]', { hasText: /^\d+ partidas/ })).toBeVisible();
  await page.getByLabel("Resultado").selectOption("win");
  await expect(page).toHaveURL(/result=win/);
  await page.getByLabel("Modo").selectOption("summoners_rift");
  await expect(page).toHaveURL(/mode=summoners_rift/);
  // Wait until the list reflects the filters (every visible game is a win) before opening one.
  await expect(page.locator(".match .match-bar.loss")).toHaveCount(0);
  await page.locator(".match").first().click();
  await expect(page.getByRole("link", { name: "← Partidas" })).toBeVisible();
  await expect(page.getByText("Victoria")).toBeVisible();
  await page.screenshot({ path: `test-results/match-${info.project.name}.png`, fullPage: true });

  await page.getByRole("link", { name: "Ajustes" }).click();
  await expect(page.getByText(`${player}#EUW`)).toBeVisible();
  await expect(page.getByText("no verificada")).toBeVisible();
});
