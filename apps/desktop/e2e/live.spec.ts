import { expect, test } from "@playwright/test";

test("live window: waiting state, demo game, controls", async ({ page }) => {
  await page.goto("/?demoSpeed=150");
  await expect(page.getByText("Esperando partida")).toBeVisible();
  await expect(page.getByText(/prueba la demostración/)).toBeVisible();

  await page.getByText("Ajustes").click();
  await expect(page.getByText(/nunca te da órdenes/)).toBeVisible();
  await page.getByRole("button", { name: "Probar demostración" }).click();
  await expect(page.getByText("◆ Demostración")).toBeVisible();

  // At 150x, level 6 arrives within a few seconds; the Coach speaks rarely and briefly.
  await expect(page.locator(".message")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel("Tu partida")).toContainText("Nivel");
  await page.screenshot({ path: "test-results/live-message.png" });

  await page.getByRole("button", { name: "Silenciar" }).click();
  await expect(page.getByText("Silenciado.")).toBeVisible();
  await expect(page.locator(".message")).toHaveCount(0);
  await page.getByRole("button", { name: "Activar" }).click();
  await page.getByRole("button", { name: "Pausar" }).click();
  await expect(page.getByText("En pausa.")).toBeVisible();
});
