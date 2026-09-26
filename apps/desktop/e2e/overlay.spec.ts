import { expect, test, type Page } from "@playwright/test";

/**
 * The optional overlay (D-11): off by default; when the player turns it on during a game, the
 * Live Coach window shows the overlay window and sends it the gold difference and next items.
 */

async function stubTauri(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    const calls: { cmd: string; args: Record<string, unknown> }[] = [];
    const callbacks = new Map<number, (e: unknown) => void>();
    let next = 1;
    w.__calls = calls;
    w.__emit = (payload: unknown) => { for (const cb of callbacks.values()) cb({ event: "overlay-state", id: 1, payload }); };
    const player = (name: string, team: string, price: number) => ({
      championName: name, rawChampionName: `game_character_displayname_${name}`, riotId: `${name}#NA1`, team, level: 9, position: "",
      items: price ? [{ itemID: 1055, displayName: "Doran's Blade", price }] : [], scores: { kills: 0, deaths: 0, assists: 0, creepScore: 50 },
    });
    const snapshot = {
      activePlayer: { riotId: "Ahri#NA1", level: 9, currentGold: 700 },
      allPlayers: [player("Ahri", "ORDER", 3600), player("Garen", "ORDER", 0), player("Zed", "CHAOS", 2400), player("Jinx", "CHAOS", 450)],
      events: { Events: [] },
      gameData: { gameMode: "CLASSIC", gameTime: 900, mapNumber: 11 },
    };
    w.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
    w.__TAURI_INTERNALS__ = {
      invoke: async (cmd: string, args: Record<string, unknown>) => {
        calls.push({ cmd, args });
        switch (cmd) {
          case "live_snapshot": return snapshot;
          case "system_load": return { cpu: 10, memAvailable: 0.6 };
          case "check_update": return null;
          case "set_overlay": return null;
          case "plugin:event|emit_to": return null;
          case "plugin:event|listen": return next++;
          case "plugin:event|unlisten": return null;
          default: throw `unknown ${cmd}`;
        }
      },
      transformCallback: (cb: (e: unknown) => void) => { const id = next++; callbacks.set(id, cb); return id; },
      unregisterCallback: (id: number) => callbacks.delete(id),
      metadata: { currentWindow: { label: "live" }, currentWebview: { label: "live" } },
    };
  });
  await page.route("https://ddragon.leagueoflegends.com/**", (r) => r.abort());
}

const calls = (page: Page) => page.evaluate(() => (window as unknown as { __calls: { cmd: string; args: Record<string, unknown> }[] }).__calls);

test("overlay: off by default; turning it on shows it and feeds it during a game", async ({ page }) => {
  await stubTauri(page);
  await page.goto("/");
  await expect(page.getByText("● In game")).toBeVisible();
  await page.getByText("Settings", { exact: true }).click();
  const toggle = page.getByLabel("Show the overlay over the game (gold difference and next items)");
  await expect(toggle).not.toBeChecked();
  expect((await calls(page)).some((c) => c.cmd === "set_overlay" && c.args.visible === true)).toBe(false);

  await toggle.check();
  await expect.poll(async () => (await calls(page)).some((c) => c.cmd === "set_overlay" && c.args.visible === true)).toBe(true);
  await expect.poll(async () => (await calls(page)).filter((c) => c.cmd === "plugin:event|emit_to").length).toBeGreaterThan(0);
  const sent = (await calls(page)).filter((c) => c.cmd === "plugin:event|emit_to").at(-1)!.args as { target: unknown; event: string; payload: { rows: { diff: number }[]; allyTotal: number; enemyTotal: number } };
  expect(sent.event).toBe("overlay-state");
  expect(sent.payload.rows.map((r) => r.diff)).toEqual([1200, -450]);
  expect([sent.payload.allyTotal, sent.payload.enemyTotal]).toEqual([3600, 2850]);

  // Pausing the Coach hides it again.
  await page.getByRole("button", { name: "Pause" }).click();
  await expect.poll(async () => (await calls(page)).filter((c) => c.cmd === "set_overlay").at(-1)?.args.visible).toBe(false);
});

test("overlay window draws what it receives", async ({ page }) => {
  await stubTauri(page);
  await page.goto("/overlay.html");
  await page.waitForFunction(() => (window as unknown as { __calls: { cmd: string }[] }).__calls.some((c) => c.cmd === "plugin:event|listen"));
  await page.evaluate(() => (window as unknown as { __emit: (p: unknown) => void }).__emit({
    art: { cdn: null, version: null },
    rows: [{ ally: { id: "Ahri", name: "Ahri" }, enemy: { id: "Zed", name: "Zed" }, diff: 1200 }, { ally: { id: "Garen", name: "Garen" }, enemy: { id: "Jinx", name: "Jinx" }, diff: -450 }],
    allyTotal: 3600, enemyTotal: 2850, next: [{ id: 3165, name: "Morellonomicon" }], gold: 700,
  }));
  const ov = page.getByRole("main", { name: "KOI Master overlay" });
  await expect(ov).toContainText("+1.2k");
  await expect(ov).toContainText("−0.5k");
  await expect(ov.getByRole("img", { name: "Morellonomicon" })).toBeVisible();
  await expect(ov).toContainText("700");
  await page.screenshot({ path: "test-results/overlay.png" });
});
