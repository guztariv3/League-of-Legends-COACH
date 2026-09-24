import { expect, test } from "@playwright/test";

async function onboard(page: import("@playwright/test").Page, player: string) {
  await page.goto("/");
  await page.getByLabel("Tu nombre").fill(player);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.getByLabel("Riot ID").fill(`${player}#EUW`);
  await page.getByRole("button", { name: "Vincular y analizar" }).click();
  await expect(page.getByText(/Basado en \d+ partidas analizables/)).toBeVisible({ timeout: 30_000 });
}

test("profile, goals, memory, search and champion page", async ({ page }, info) => {
  const player = `P2${info.project.name}`;
  await onboard(page, player);

  // Search → matchup results, only navigation
  const search = page.getByRole("combobox", { name: "Buscar" });
  await search.fill("Aurelith vs Korvane");
  await expect(page.getByRole("option").first()).toContainText("Aurelith contra Korvane");
  await search.press("Enter");
  await expect(page).toHaveURL(/champion=Aurelith&opponent=Korvane/);
  await expect(page.getByText("contra Korvane")).toBeVisible();

  // Profile
  await page.getByRole("navigation", { name: "Principal" }).getByRole("link", { name: "Perfil" }).click();
  await expect(page.getByRole("heading", { name: "Tu perfil" })).toBeVisible();
  await expect(page.getByText("Fase de líneas").first()).toBeVisible();
  await page.screenshot({ path: `test-results/profile-${info.project.name}.png`, fullPage: true });

  // Create a goal
  await page.getByLabel("Crear un objetivo propio").selectOption({ label: "Muertes por minuto" });
  await page.getByRole("button", { name: "Crear" }).click();
  await expect(page.getByRole("article", { name: /Objetivo: Muertes por minuto/ })).toBeVisible();
  await expect(page.getByText("Aún no hay partidas desde que aceptaste este objetivo.")).toBeVisible();

  // Memory: focus + note, then forget the note
  await page.getByLabel("¿En qué quieres centrarte?").selectOption({ label: "CS por minuto" });
  await expect(page.getByText("Quiero centrarme en: CS por minuto")).toBeVisible();
  await page.getByLabel("Añadir una nota para el Coach").fill("Juego con mando");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Juego con mando")).toBeVisible();
  await page.getByRole("button", { name: "Olvidar: Juego con mando" }).click();
  await expect(page.getByText("Juego con mando")).toHaveCount(0);

  // Champion page personal layer
  await page.getByRole("navigation", { name: "Principal" }).getByRole("link", { name: "Campeones" }).click();
  await page.getByRole("link", { name: /Aurelith/ }).first().click();
  await expect(page.getByRole("heading", { name: "Aurelith", exact: true })).toBeVisible();
  await expect(page.getByText(/frente a tus otros campeones/)).toBeVisible();
  await page.screenshot({ path: `test-results/champion-${info.project.name}.png`, fullPage: true });
});
