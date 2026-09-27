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
              build: {
                champion: "Ahri",
                kit: ["Ahri's Q, W, E and R scale with ability power"],
                enemyDamage: { physical: 0.7, magic: 0.3, true: 0 },
                threats: [{ kind: "burst", weight: 0.7, sources: [{ name: "Zed", why: "deals its damage in short bursts" }] }],
                starter: { items: [{ id: 1056, name: "Doran's Ring", gold: 400 }, { id: 2003, name: "Health Potion", gold: 50 }, { id: 2003, name: "Health Potion", gold: 50 }], why: ["Gives 18 ability power."] },
                first: { id: 3157, name: "Zhonya's Hourglass", gold: 3250, score: 1.4, why: ["Gives 105 ability power: Ahri's Q, W, E and R scale with ability power.", "It has a stasis active (untargetable for a moment): Zed: deals its damage in short bursts."] },
                next: [{ id: 3135, name: "Void Staff", gold: 3000, score: 1.2, why: ["Gives 95 ability power."] }],
                boots: { id: 3020, name: "Sorcerer's Shoes", gold: 1100, score: 0.9, why: ["Gives 12 magic penetration."] },
                situational: [{ id: 3102, name: "Banshee's Veil", gold: 3000, score: 1, why: [], when: "Against the burst damage from Zed." }],
                ruledOut: [{ id: 3143, name: "Randuin's Omen", why: "Its passive reduces damage from critical strikes, and no enemy relies on critical strikes." }],
                certainty: "close",
                alternative: { id: 3135, name: "Void Staff", gold: 3000, score: 1.35, why: [], difference: "Void Staff gives more of the stats your kit uses; Zhonya's Hourglass answers more of what the enemy team does." },
                adaptation: { standard: false, standardCore: [{ id: 6655, name: "Luden's Companion" }], note: "Zhonya's Hourglass instead of the standard Luden's Companion: It has a stasis active (untargetable for a moment): Zed: deals its damage in short bursts." },
                setup: {
                  runes: {
                    primaryTree: "Domination", keystone: { id: 8112, name: "Electrocute", why: "Hitting a champion with 3 separate attacks or abilities in 3s deals bonus adaptive damage. Fits: Ahri relies on abilities." },
                    primary: [{ id: 8143, name: "Sudden Impact", why: "Bonus true damage after a dash." }],
                    secondaryTree: "Sorcery", secondary: [{ id: 8210, name: "Transcendence", why: "Ability haste." }, { id: 8226, name: "Manaflow Band", why: "Mana." }],
                    shards: [{ id: 5008, name: "Adaptive Force", why: "+9 Adaptive Force." }],
                  },
                  spells: [{ id: "SummonerFlash", key: 4, name: "Flash", why: "Instantly repositions you a short distance." }, { id: "SummonerDot", key: 14, name: "Ignite", why: "Extra damage to win early fights." }],
                },
                version: "16.19.1",
                enemiesKnown: 1,
                attribution: { text: "Game data: Riot Data Dragon; League of Legends Wiki (CC BY-SA 3.0) via Meraki Analytics.", license: "https://creativecommons.org/licenses/by-sa/3.0/" },
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

  // Champion select opens the Draft section on its own.
  await expect(page.getByRole("tablist", { name: "Sections" }).getByRole("tab", { name: "Draft" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tablist", { name: "Sections" }).getByRole("tab", { name: "Home" }).click();
  await page.getByRole("button", { name: "Connect" }).click();
  await page.getByLabel("Website address").fill("https://koi.example");
  await page.getByLabel("Code").fill("ABCD-EFGH");
  await page.getByRole("button", { name: "Connect" }).click();
  await page.getByRole("tablist", { name: "Sections" }).getByRole("tab", { name: "Draft" }).click();

  await expect(select.getByText("Ahri", { exact: true })).toBeVisible();
  await expect(select.getByText(/hovering · middle/)).toBeVisible();
  await expect(select.getByText("Reach your first item")).toBeVisible();
  await expect(select.getByText(/read-only/)).toBeVisible();

  // The pre-game build: starting items, the first item and why, what else, what's ruled out.
  const build = select.getByRole("region", { name: "Build for this game" });
  await expect(build.getByText("2 × Health Potion")).toBeVisible();
  const first = build.getByLabel("Recommended first item");
  await expect(first.getByText("Zhonya's Hourglass", { exact: true })).toBeVisible();
  // How sure it is, what it replaces from the standard core and why, and the close alternative.
  await expect(first.getByText("Close call")).toBeVisible();
  await expect(first.getByText(/instead of the standard Luden's Companion/)).toBeVisible();
  await expect(first.getByLabel("Alternative")).toContainText("Void Staff gives more of the stats your kit uses");
  await first.getByText("Show reasoning").click();
  await expect(first.getByRole("listitem").filter({ hasText: /^It has a stasis active .*Zed/ })).toBeVisible();
  await expect(build.getByText("Void Staff", { exact: true }).first()).toBeVisible();
  // Details are folded: the situational item shows its "when" once opened.
  await build.locator("summary").filter({ hasText: "Banshee's Veil" }).click();
  await expect(build.getByText("Against the burst damage from Zed.")).toBeVisible();
  await expect(build.locator("summary").filter({ hasText: "Not needed this game" })).toContainText("Randuin's Omen");
  await expect(build.getByText(/1 of 5 enemy champions known/)).toBeVisible();
  const setup = build.getByLabel("Runes and summoner spells");
  await expect(setup.locator("summary").filter({ hasText: "Spells" })).toContainText("Flash + Ignite");
  const keystone = setup.locator("summary").filter({ hasText: "Electrocute" });
  await expect(keystone).toContainText("Domination + Sorcery");
  await keystone.click();
  await expect(setup.getByText(/Fits: Ahri relies on abilities/)).toBeVisible();

  const plan = await page.evaluate(() => (window as unknown as { __calls: { cmd: string; args: Record<string, unknown> }[] }).__calls.find((c) => c.cmd === "desktop_plan")?.args);
  expect(plan).toMatchObject({ me: "103", allies: "64", enemies: "238", opponent: "", position: "middle" });
});
