import { expect, test } from "@playwright/test";
import { championJson, itemJson } from "../../../packages/itemization/src/test-fixture";

/**
 * A live game as the game's own Live Client Data API reports it, through a stub of Tauri's
 * IPC: the board shows both teams with their items, and "Items" the next item to buy.
 */
test("in game: both teams with items, and your build from your history", async ({ page }) => {
  await page.addInitScript(() => {
    // Me: Ahri with boots and Luden. Enemies: physical, two of them healing with Bloodthirster.
    const champs: [string, string, { itemID: number; displayName: string }[], number][] = [
      ["Ahri", "Ahri", [{ itemID: 3020, displayName: "Sorcerer's Shoes" }, { itemID: 6655, displayName: "Luden's Companion" }], 2],
      ["Lux", "Lux", [], 1], ["Jinx", "Jinx", [], 1], ["Garen", "Garen", [], 1], ["Malphite", "Malphite", [], 1],
      ["Zed", "Zed", [{ itemID: 3072, displayName: "Bloodthirster" }], 6], ["Draven", "Draven", [{ itemID: 3031, displayName: "Infinity Edge" }], 4],
      ["Miss Fortune", "MissFortune", [{ itemID: 1055, displayName: "Doran's Blade" }], 1], ["Aatrox", "Aatrox", [{ itemID: 3072, displayName: "Bloodthirster" }], 2],
      ["Wukong", "MonkeyKing", [{ itemID: 1055, displayName: "Doran's Blade" }], 0],
    ];
    const snapshot = {
      activePlayer: { riotId: "Yo#EUW", level: 9, currentGold: 1000 },
      allPlayers: champs.map(([name, raw, items, kills], i) => ({
        championName: name, rawChampionName: `game_character_displayname_${raw}`,
        riotId: i === 0 ? "Yo#EUW" : `Jugador${i}#EUW`, team: i < 5 ? "ORDER" : "CHAOS", level: 9, position: "",
        items, scores: { kills, deaths: 1, assists: 2, creepScore: 80 },
      })),
      events: { Events: [] },
      gameData: { gameMode: "CLASSIC", gameTime: 900, mapNumber: 11 },
    };
    localStorage.setItem("koi.link", JSON.stringify({ origin: "https://koi.example", token: "device-token-for-tests-only" }));
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {
      invoke: async (cmd: string, args: Record<string, unknown>) => {
        switch (cmd) {
          case "live_snapshot": return snapshot;
          case "system_load": return { cpu: 10, memAvailable: 0.6 };
          case "check_update": return null;
          case "desktop_scout": return { inGame: false, assets: { cdn: null, version: null } };
          case "desktop_build":
            if (args.champion !== "Ahri" || args.mode !== "summoners_rift") throw "server_error";
            return {
              champion: "Ahri", games: 12, wins: 7, note: null,
              items: [{ id: 6655, name: "Luden's Companion", games: 10, wins: 6 }, { id: 3089, name: "Rabadon's Deathcap", games: 8, wins: 5 }],
            };
          default: throw `unknown ${cmd}`;
        }
      },
      transformCallback: () => 0,
      metadata: { currentWindow: { label: "live" }, currentWebview: { label: "live" } },
    };
  });
  // Data Dragon stand-in: the version list and a placeholder picture for every image.
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
  await page.route("https://ddragon.leagueoflegends.com/**", (r) => {
    const url = r.request().url();
    if (url.endsWith("/api/versions.json")) return r.fulfill({ json: ["15.19.1", "15.18.1"] });
    if (url.endsWith("/data/en_US/item.json")) return r.fulfill({ json: itemJson });
    if (url.endsWith("/data/en_US/champion.json")) return r.fulfill({ json: championJson });
    return r.fulfill({ body: png, contentType: "image/png" });
  });

  await page.goto("/");
  await expect(page.getByText("● In game")).toBeVisible();
  const board = page.getByRole("region", { name: "Game" });

  // Items (first tab): the next item follows the enemy team, with reasons and how to buy it.
  await expect(board.getByRole("tab", { name: "Items" })).toHaveAttribute("aria-selected", "true");
  const next = board.getByRole("region", { name: "Next suggested item" });
  await expect(next).toContainText("Morellonomicon");
  await expect(next).toContainText("Zed and Aatrox heal with lifesteal: applies Grievous Wounds");
  await expect(next.getByLabel("Components").getByRole("img")).toHaveCount(2);
  await expect(next).toContainText("You need 2950 more gold in total. Your 1000 gold buys: Blasting Wand (850).");
  await expect(board).toContainText("Your history on Ahri (12 games)");
  await page.screenshot({ path: "test-results/board-items.png" });

  await board.getByRole("tab", { name: "Enemies" }).click();
  await expect(board).toContainText("Jugador5");
  await expect(board).toContainText("Miss Fortune");
  await expect(board.getByRole("img", { name: "Doran's Blade" }).first()).toHaveAttribute("src", "https://ddragon.leagueoflegends.com/cdn/15.19.1/img/item/1055.png");
  await expect(board.getByRole("img", { name: "Wukong" })).toHaveAttribute("src", "https://ddragon.leagueoflegends.com/cdn/15.19.1/img/champion/MonkeyKing.png");
  await expect(board.getByRole("listitem")).toHaveCount(5);
  await page.screenshot({ path: "test-results/board-rivals.png" });

  await board.getByRole("tab", { name: "Your team" }).click();
  await expect(board.getByRole("listitem").first()).toContainText("You");
  await expect(board.getByRole("img", { name: "Luden's Companion" })).toBeVisible();

});

test("waiting, not connected: a visible Connect button opens the code form", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Waiting for a game")).toBeVisible();
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByLabel("Code")).toBeVisible();
});

test("demo: the board shows both teams", async ({ page }) => {
  await page.goto("/?demoSpeed=150");
  await page.getByText("Settings", { exact: true }).click();
  await page.getByRole("button", { name: "Try the demo" }).click();
  const board = page.getByRole("region", { name: "Game" });
  await expect(board).toContainText("In the demo the items are made up", { timeout: 15_000 });
  await board.getByRole("tab", { name: "Enemies" }).click();
  await expect(board.getByRole("listitem")).toHaveCount(5);
});
