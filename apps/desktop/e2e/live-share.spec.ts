import { expect, test, type Page } from "@playwright/test";

/**
 * Private web Live sharing is off until the player turns it on. While it is off the companion
 * publishes nothing; turning it off replaces what was shared with one empty frame, then stops.
 */
async function linkedAndWaiting(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("koi.link", JSON.stringify({ origin: "https://koi.example", token: "device-token-for-tests-only" }));
    const w = window as unknown as Record<string, unknown>;
    w.__live = [] as { phase: string }[];
    w.__TAURI_INTERNALS__ = {
      invoke: async (cmd: string, args: { frame?: { phase: string } }) => {
        switch (cmd) {
          case "live_snapshot": throw "not_in_game";
          case "system_load": return { cpu: 10, memAvailable: 0.6 };
          case "check_update": return null;
          case "lcu_champ_select": throw "not_running";
          case "desktop_scout": return { inGame: false, assets: { cdn: null, version: null } };
          case "desktop_live": (w.__live as { phase: string }[]).push({ phase: args.frame!.phase }); return { ok: true, accepted: true };
          default: throw "server_error";
        }
      },
      transformCallback: () => 0,
      metadata: { currentWindow: { label: "live" }, currentWebview: { label: "live" } },
    };
  });
}
const published = (page: Page) => page.evaluate(() => (window as unknown as { __live: { phase: string }[] }).__live.map((f) => f.phase));

test("web Live sharing: nothing is published while it is off; turning it off clears once", async ({ page }) => {
  await linkedAndWaiting(page);
  await page.goto("/");
  await expect(page.getByText("Waiting for a game")).toBeVisible();
  await page.waitForTimeout(1500);
  expect(await published(page)).toEqual([]);

  await page.getByRole("tablist", { name: "Sections" }).getByRole("tab", { name: "Settings" }).click();
  const share = page.getByLabel("Share this game with my private web Live page");
  await expect(share).not.toBeChecked();
  await share.check();
  await expect.poll(() => published(page)).toContain("idle");
  await expect(page.getByText(/Connection: connected/)).toBeVisible();

  await share.uncheck();
  await expect(page.getByText(/Connection: off/)).toBeVisible();
  const afterOff = (await published(page)).length;
  await page.waitForTimeout(2500);
  // Exactly one frame after turning it off (the clearing idle frame), then silence.
  expect((await published(page)).length).toBe(afterOff);
  expect((await published(page)).at(-1)).toBe("idle");
});
