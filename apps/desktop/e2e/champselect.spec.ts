import { expect, test } from "@playwright/test";

/**
 * Champion select (D-13): the Rust side (League Client, read-only) is stubbed. The window
 * shows the game plan for the hovered champion, asking the site with numeric champion keys.
 */
test("desktop: game plan during champion select", async ({ page }) => {
  await page.addInitScript(() => {
    const calls: { cmd: string; args: Record<string, unknown> }[] = [];
    (window as unknown as { __calls: typeof calls }).__calls = calls;
    const line = (text: string) => ({ text, basis: "observation", why: "From your games." });
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {
      invoke: async (cmd: string, args: Record<string, unknown>) => {
        calls.push({ cmd, args });
        switch (cmd) {
          case "live_snapshot": throw "not_in_game";
          case "system_load": return { cpu: 10, memAvailable: 0.6 };
          case "check_update": return null;
          case "desktop_claim": return { token: "device-token-for-tests-only", origin: "https://koi.example" };
          case "desktop_scout": return { inGame: false, message: "Not in a game." };
          case "lcu_champ_select":
            return { phase: "ChampSelect", me: { championId: 103, locked: false, position: "middle" }, allies: [64], enemies: [238] };
          case "desktop_plan":
            return {
              champion: "Ahri",
              plan: {
                primaryObjective: line("Reach your first item"), secondaryObjective: null, biggestThreat: line("Zed"),
                yourPowerSpike: null, enemyPowerSpike: null, avoid: null, lookFor: null,
                loadout: { games: 0, keystone: null, spells: null, maxOrder: null, firstItem: null },
              },
            };
          default: throw `unknown ${cmd}`;
        }
      },
      transformCallback: () => 0,
      metadata: { currentWindow: { label: "live" }, currentWebview: { label: "live" } },
    };
  });

  await page.goto("/");
  const select = page.getByRole("region", { name: "Champion select" });
  await expect(select).toBeVisible();
  await expect(select.getByText(/Connect the website/)).toBeVisible(); // no site link yet: says what's needed

  await page.getByRole("button", { name: "Connect" }).click();
  await page.getByLabel("Website address").fill("https://koi.example");
  await page.getByLabel("Code").fill("ABCD-EFGH");
  await page.getByRole("button", { name: "Connect" }).click();

  await expect(select.getByText("Ahri", { exact: true })).toBeVisible();
  await expect(select.getByText(/hovering · middle/)).toBeVisible();
  await expect(select.getByText("Reach your first item")).toBeVisible();
  await expect(select.getByText(/read-only/)).toBeVisible();
  const plan = await page.evaluate(() => (window as unknown as { __calls: { cmd: string; args: Record<string, unknown> }[] }).__calls.find((c) => c.cmd === "desktop_plan")?.args);
  expect(plan).toMatchObject({ me: "103", allies: "64", enemies: "238", opponent: "" });
});
