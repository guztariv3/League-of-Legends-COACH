import { expect, test, type Page } from "@playwright/test";

/**
 * Private web Live sharing. It is off until the player turns it on, and while it is off the
 * companion publishes nothing. Frames are stamped in the website's time (measured with
 * desktop_time), so a PC clock that runs ahead or behind can still share; if the time can't be
 * checked or the site rejects a frame, the Settings line says so and nothing stale is sent.
 */
interface Mock { skewMs?: number; timeFails?: boolean; liveRejects?: boolean }
async function linkedAndWaiting(page: Page, mock: Mock = {}) {
  await page.addInitScript((mock: Mock) => {
    localStorage.setItem("koi.link", JSON.stringify({ origin: "https://koi.example", token: "device-token-for-tests-only" }));
    const w = window as unknown as Record<string, unknown>;
    const live: { phase: string; capturedAt: number; serverNow: number }[] = [];
    w.__live = live;
    w.__timeCalls = 0;
    // The website's clock differs from this PC's by skewMs (positive: the PC is behind).
    const serverNow = () => Date.now() + (mock.skewMs ?? 0);
    w.__TAURI_INTERNALS__ = {
      invoke: async (cmd: string, args: { frame?: { phase: string; capturedAt: number } }) => {
        switch (cmd) {
          case "live_snapshot": throw "not_in_game";
          case "system_load": return { cpu: 10, memAvailable: 0.6 };
          case "check_update": return null;
          case "lcu_champ_select": throw "not_running";
          case "desktop_scout": return { inGame: false, assets: { cdn: null, version: null } };
          case "desktop_time":
            w.__timeCalls = (w.__timeCalls as number) + 1;
            if (mock.timeFails) throw "offline";
            return { serverTime: serverNow() };
          case "desktop_live":
            live.push({ phase: args.frame!.phase, capturedAt: args.frame!.capturedAt, serverNow: serverNow() });
            if (mock.liveRejects) throw "rejected";
            return { ok: true, accepted: true, serverTime: serverNow() };
          default: throw "server_error";
        }
      },
      transformCallback: () => 0,
      metadata: { currentWindow: { label: "live" }, currentWebview: { label: "live" } },
    };
  }, mock);
}
const published = (page: Page) => page.evaluate(() => (window as unknown as { __live: { phase: string; capturedAt: number; serverNow: number }[] }).__live);
const timeCalls = (page: Page) => page.evaluate(() => (window as unknown as { __timeCalls: number }).__timeCalls);
async function openShare(page: Page) {
  await page.goto("/");
  await expect(page.getByText("Waiting for a game")).toBeVisible();
  await page.getByRole("tablist", { name: "Sections" }).getByRole("tab", { name: "Settings" }).click();
  return page.getByLabel("Share this game with my private web Live page");
}

test("web Live sharing: nothing is published while it is off; turning it off clears once", async ({ page }) => {
  await linkedAndWaiting(page);
  const share = await openShare(page);
  await page.waitForTimeout(1500);
  expect(await published(page)).toEqual([]);
  expect(await timeCalls(page)).toBe(0); // not even a time check while sharing is off

  await expect(share).not.toBeChecked();
  await share.check();
  await expect.poll(async () => (await published(page)).map((f) => f.phase)).toContain("idle");
  await expect(page.getByText(/Connection: connected/)).toBeVisible();

  await share.uncheck();
  await expect(page.getByText(/Connection: off/)).toBeVisible();
  await expect.poll(async () => (await published(page)).at(-1)?.phase).toBe("idle");
  const afterOff = (await published(page)).length;
  await page.waitForTimeout(2500);
  // Exactly one frame after turning it off (the clearing idle frame), then silence.
  expect((await published(page)).length).toBe(afterOff);
});

for (const [label, skewMs] of [["ahead", -10 * 60_000], ["behind", 10 * 60_000]] as const) {
  test(`web Live sharing works with a PC clock 10 minutes ${label}: frames use the website's time`, async ({ page }) => {
    await linkedAndWaiting(page, { skewMs });
    const share = await openShare(page);
    await share.check();
    await expect.poll(async () => (await published(page)).length).toBeGreaterThan(0);
    for (const f of await published(page)) {
      // Stamped in server time (within a couple of seconds), not in the PC's wrong clock.
      expect(Math.abs(f.capturedAt - f.serverNow)).toBeLessThan(3000);
    }
    await expect(page.getByText(`your PC clock is 10 min ${label === "ahead" ? "ahead of" : "behind"} the site; sharing uses the website's time`)).toBeVisible();
  });
}

test("web Live sharing: when the time can't be checked nothing is shared and the app says so", async ({ page }) => {
  await linkedAndWaiting(page, { timeFails: true });
  const share = await openShare(page);
  await share.check();
  await expect(page.getByText(/can't check the time with the website, so nothing is shared yet/)).toBeVisible();
  expect(await published(page)).toEqual([]);
});

test("web Live sharing: a rejected frame makes the app re-check the time and explain it", async ({ page }) => {
  test.setTimeout(40_000);
  await linkedAndWaiting(page, { liveRejects: true });
  const share = await openShare(page);
  await share.check();
  await expect(page.getByText(/waiting for fresh game data \(the website only accepts recent data\)/)).toBeVisible();
  const before = await timeCalls(page);
  // Re-measured before the next frame (idle frames go every 10 s).
  await expect.poll(() => timeCalls(page), { timeout: 15_000 }).toBeGreaterThan(before);
});
