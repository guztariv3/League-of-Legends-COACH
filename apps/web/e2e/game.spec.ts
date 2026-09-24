import { expect, test } from "@playwright/test";

async function onboard(page: import("@playwright/test").Page, player: string) {
  await page.goto("/");
  await page.getByLabel("Tu nombre").fill(player);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.getByLabel("Riot ID").fill(`${player}#EUW`);
  await page.getByRole("button", { name: "Vincular y analizar" }).click();
  await expect(page.getByText(/Basado en \d+ partidas analizables/)).toBeVisible({ timeout: 30_000 });
}

test("match review, manual draft and scouting", async ({ page }, info) => {
  const player = `P3${info.project.name}`;
  await onboard(page, player);

  // Match review from a Summoner's Rift game
  await page.goto("/matches?mode=summoners_rift");
  await page.locator(".match").first().click();
  await page.getByRole("link", { name: "Revisar la partida en el mapa" }).click();
  await expect(page.getByRole("heading", { name: "Revisión de la partida" })).toBeVisible();
  await expect(page.getByRole("img", { name: /Posiciones en el minuto \d+/ })).toBeVisible();
  await page.getByRole("button", { name: "Avanzar un minuto" }).click();
  await page.getByRole("button", { name: "Siguiente momento" }).click();
  await page.getByText("Qué no puede saber esta revisión").click();
  await expect(page.getByText(/foto por minuto/)).toBeVisible();
  await page.screenshot({ path: `test-results/review-${info.project.name}.png`, fullPage: true });
  await page.getByLabel("Mapa de impacto").check();
  await expect(page.getByRole("img", { name: /Mapa de impacto/ })).toBeVisible();

  // Pre-game area
  await page.getByRole("navigation", { name: "Principal" }).getByRole("link", { name: "Antes de jugar" }).click();
  await page.getByLabel("Tu campeón").selectOption({ label: "Aurelith" });
  await page.getByLabel("Rival 1").selectOption({ label: "Veyl" });
  await page.getByLabel("Rival 2").selectOption({ label: "Myrr" });
  await page.getByLabel("Rival 3").selectOption({ label: "Nimue" });
  await page.getByRole("button", { name: "Analizar" }).click();
  await expect(page.getByText("Esto es lo que más importa").first()).toBeVisible();

  await page.getByRole("button", { name: "Buscar mi partida" }).click();
  await expect(page.getByRole("heading", { name: "Rivales" })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("li.tile").filter({ hasText: /Rival \d#SYN/ })).toHaveCount(5);
  await page.screenshot({ path: `test-results/game-${info.project.name}.png`, fullPage: true });
});
