import { expect, test } from "@playwright/test";

// Regression: two filter changes before a re-render must both survive (CI saw the first one dropped).
test("match filters changed in the same tick are both kept", async ({ page }, info) => {
  const player = `Filters${info.project.name}`;
  await page.goto("/");
  await page.getByLabel("Tu nombre").fill(player);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.getByLabel("Riot ID").fill(`${player}#EUW`);
  await page.getByLabel("Región").selectOption("euw1");
  await page.getByRole("button", { name: "Vincular y analizar" }).click();
  await expect(page.getByText(/Basado en \d+ partidas analizables/)).toBeVisible({ timeout: 30_000 });

  await page.goto("/matches");
  await expect(page.locator('p[aria-live="polite"]', { hasText: /^\d+ partidas/ })).toBeVisible();
  await page.evaluate(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!;
    for (const [id, v] of [["f-result", "win"], ["f-mode", "summoners_rift"]] as const) {
      const el = document.getElementById(id) as HTMLSelectElement;
      setter.call(el, v);
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
  await expect(page).toHaveURL(/result=win/);
  await expect(page).toHaveURL(/mode=summoners_rift/);
  await expect(page.locator(".match .match-bar.loss")).toHaveCount(0);
});
