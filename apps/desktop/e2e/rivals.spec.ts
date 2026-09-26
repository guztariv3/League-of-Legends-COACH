import { expect, test } from "@playwright/test";

/**
 * The Rust side is replaced by a stub of Tauri's IPC entry point, so this checks the window's
 * behaviour: connect with a code, show the rivals from the loading screen, disconnect.
 */
test("desktop: connect with a code and see the rivals from the loading screen", async ({ page }) => {
  await page.addInitScript(() => {
    const rival = (riotId: string, championId: string, tier: string | null) => ({
      riotId, championId, championName: championId, games: 20, wins: 11,
      rankStatus: tier ? "ranked" : "unranked",
      rank: tier ? { queue: "solo", tier, division: "II", lp: 45, wins: 60, losses: 40 } : null,
      topChampions: [{ id: "Ahri", name: "Ahri", points: 120000, games: null }, { id: "Lux", name: "Lux", points: 80000, games: null }],
      topSource: "mastery", headline: "",
    });
    const calls: { cmd: string; args: Record<string, unknown> }[] = [];
    (window as unknown as { __calls: typeof calls }).__calls = calls;
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {
      invoke: async (cmd: string, args: Record<string, unknown>) => {
        calls.push({ cmd, args });
        switch (cmd) {
          case "live_snapshot": throw "not_in_game";
          case "system_load": return { cpu: 10, memAvailable: 0.6 };
          case "check_update": return null;
          case "desktop_claim":
            if (args.code !== "ABCD-EFGH") throw "unauthorized";
            return { token: "device-token-for-tests-only", origin: "https://koi.example" };
          case "desktop_scout":
            return {
              inGame: true, mode: "Ranked Solo/Duo",
              enemies: [rival("Rival#EUW", "Zed", "GOLD"), rival("Other#EUW", "Lux", null)],
              assets: { cdn: null, version: null },
            };
          default: throw `unknown ${cmd}`;
        }
      },
      transformCallback: () => 0,
      metadata: { currentWindow: { label: "live" }, currentWebview: { label: "live" } },
    };
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Connect" }).click();
  await page.getByLabel("Website address").fill("https://koi.example/settings");
  await page.getByLabel("Code").fill("WRNG-CODE");
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByRole("alert")).toContainText("Wrong or expired code");

  await page.getByLabel("Code").fill("ABCD-EFGH");
  await page.getByRole("button", { name: "Connect" }).click();
  await page.getByText("Settings", { exact: true }).click();
  await expect(page.getByText(/Connected to/)).toContainText("koi.example");

  const rivals = page.getByRole("region", { name: "Your opponents" });
  await expect(rivals).toBeVisible();
  await expect(rivals).toContainText("Rival#EUW");
  await expect(rivals).toContainText("Gold II · 45 LP");
  await expect(rivals).toContainText("60%");
  await expect(rivals).toContainText("Unranked");
  await expect(rivals.getByRole("img", { name: "Ahri" }).first()).toBeVisible();

  // The token is used for scouting and stays on this machine; the link survives a restart.
  const scoutCall = await page.evaluate(() => (window as unknown as { __calls: { cmd: string; args: Record<string, unknown> }[] }).__calls.find((c) => c.cmd === "desktop_scout"));
  expect(scoutCall?.args).toEqual({ baseUrl: "https://koi.example", token: "device-token-for-tests-only" });
  await page.reload();
  await expect(page.getByRole("region", { name: "Your opponents" })).toBeVisible();
  await page.screenshot({ path: "test-results/rivals.png" });

  page.once("dialog", (d) => d.accept());
  await page.getByText("Settings", { exact: true }).click();
  await page.getByRole("button", { name: "Disconnect" }).click();
  await expect(page.getByRole("region", { name: "Your opponents" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Connect to the website" }).getByRole("button", { name: "Connect" })).toBeVisible();
});
