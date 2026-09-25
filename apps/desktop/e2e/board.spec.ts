import { expect, test } from "@playwright/test";

/**
 * A live game as the game's own Live Client Data API reports it, through a stub of Tauri's
 * IPC: the board shows both teams with their items, and "Tu build" the player's own history.
 */
test("in game: both teams with items, and your build from your history", async ({ page }) => {
  await page.addInitScript(() => {
    const champs = [
      ["Ahri", "Ahri"], ["Lee Sin", "LeeSin"], ["Jinx", "Jinx"], ["Thresh", "Thresh"], ["Garen", "Garen"],
      ["Zed", "Zed"], ["Vi", "Vi"], ["Miss Fortune", "MissFortune"], ["Lulu", "Lulu"], ["Wukong", "MonkeyKing"],
    ];
    const snapshot = {
      activePlayer: { riotId: "Yo#EUW", level: 9, currentGold: 500 },
      allPlayers: champs.map(([name, raw], i) => ({
        championName: name, rawChampionName: `game_character_displayname_${raw}`,
        riotId: i === 0 ? "Yo#EUW" : `Jugador${i}#EUW`, team: i < 5 ? "ORDER" : "CHAOS", level: 9, position: "",
        items: i === 0 ? [{ itemID: 3020, displayName: "Botas de hechicero", price: 1100 }, { itemID: 6655, displayName: "Tormento de Luden", price: 2750 }]
          : [{ itemID: 1055, displayName: "Espada de Doran", price: 450 }],
        scores: { kills: i, deaths: 1, assists: 2, creepScore: 80 },
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
              items: [{ id: 6655, name: "Tormento de Luden", games: 10, wins: 6 }, { id: 3089, name: "Sombrero de Rabadon", games: 8, wins: 5 }],
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
  await page.route("https://ddragon.leagueoflegends.com/**", (r) =>
    r.request().url().endsWith("/api/versions.json")
      ? r.fulfill({ json: ["15.19.1", "15.18.1"] })
      : r.fulfill({ body: png, contentType: "image/png" }));

  await page.goto("/");
  await expect(page.getByText("● En partida")).toBeVisible();
  const board = page.getByRole("region", { name: "Partida" });
  await expect(board.getByRole("tab", { name: "Rivales" })).toHaveAttribute("aria-selected", "true");
  await expect(board).toContainText("Jugador5");
  await expect(board).toContainText("Miss Fortune");
  await expect(board.getByRole("img", { name: "Espada de Doran" }).first()).toHaveAttribute("src", "https://ddragon.leagueoflegends.com/cdn/15.19.1/img/item/1055.png");
  await expect(board.getByRole("img", { name: "Wukong" })).toHaveAttribute("src", "https://ddragon.leagueoflegends.com/cdn/15.19.1/img/champion/MonkeyKing.png");
  await expect(board.getByRole("listitem")).toHaveCount(5);
  await page.screenshot({ path: "test-results/board-rivals.png" });

  await board.getByRole("tab", { name: "Tu equipo" }).click();
  await expect(board.getByRole("listitem").first()).toContainText("Tú");
  await expect(board.getByRole("img", { name: "Tormento de Luden" })).toBeVisible();

  await board.getByRole("tab", { name: "Tu build" }).click();
  await expect(board).toContainText("tus 12 partidas registradas con Ahri (58% de victorias)");
  await expect(board.getByRole("listitem").filter({ hasText: "Tormento de Luden" })).toContainText("ya lo tienes");
  await expect(board.getByRole("listitem").filter({ hasText: "Sombrero de Rabadon" })).toContainText("8/12 partidas · 63% V");
  await page.screenshot({ path: "test-results/board-build.png" });
});

test("waiting, not connected: a visible Conectar button opens the code form", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Esperando partida")).toBeVisible();
  await page.getByRole("button", { name: "Conectar" }).click();
  await expect(page.getByLabel("Código")).toBeVisible();
});

test("demo: the board shows both teams", async ({ page }) => {
  await page.goto("/?demoSpeed=150");
  await page.getByText("Ajustes", { exact: true }).click();
  await page.getByRole("button", { name: "Probar demostración" }).click();
  const board = page.getByRole("region", { name: "Partida" });
  await expect(board.getByRole("listitem")).toHaveCount(5, { timeout: 15_000 });
  await board.getByRole("tab", { name: "Tu build" }).click();
  await expect(board).toContainText("Conecta la app con la web");
});
