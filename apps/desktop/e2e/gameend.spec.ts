import { expect, test } from "@playwright/test";

/**
 * End of a match: the game's own API keeps answering on the victory/defeat screen, with a
 * GameEnd event. The window must drop the match (not just hide it) and go back to Home, and a
 * new game must start from a clean state.
 */
test("desktop: a finished game resets the window to Home, and the next game starts clean", async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __phase: "game" | "end" | "closed" | "next"; __TAURI_INTERNALS__: unknown };
    w.__phase = "game";
    const snapshot = (kills: number, time: number, events: { EventID: number; EventName: string; EventTime: number }[]) => ({
      activePlayer: { riotId: "Yo#EUW", level: 9, currentGold: 500 },
      allPlayers: ["Ahri", "Lux", "Jinx", "Garen", "Malphite", "Zed", "Draven", "Leona", "Aatrox", "Wukong"].map((name, i) => ({
        championName: name, rawChampionName: `game_character_displayname_${name}`, riotId: i === 0 ? "Yo#EUW" : `P${i}#EUW`,
        team: i < 5 ? "ORDER" : "CHAOS", level: 9, position: "", items: [], scores: { kills: i === 0 ? kills : 0, deaths: 0, assists: 0, creepScore: 50 },
      })),
      events: { Events: events },
      gameData: { gameMode: "CLASSIC", gameTime: time, mapNumber: 11 },
    });
    localStorage.setItem("koi.link", JSON.stringify({ origin: "https://koi.example", token: "device-token-for-tests-only" }));
    w.__TAURI_INTERNALS__ = {
      invoke: async (cmd: string) => {
        switch (cmd) {
          case "live_snapshot":
            if (w.__phase === "game") return snapshot(7, 1500, [{ EventID: 0, EventName: "GameStart", EventTime: 0 }]);
            if (w.__phase === "end") return snapshot(7, 1800, [{ EventID: 0, EventName: "GameStart", EventTime: 0 }, { EventID: 9, EventName: "GameEnd", EventTime: 1800 }]);
            if (w.__phase === "next") return snapshot(0, 60, [{ EventID: 0, EventName: "GameStart", EventTime: 0 }]);
            throw "not_in_game";
          case "system_load": return { cpu: 10, memAvailable: 0.6 };
          case "check_update": return null;
          case "desktop_scout": return { inGame: false, assets: { cdn: null, version: null } };
          case "desktop_build": return { champion: "Ahri", games: 0, wins: 0, items: [], note: null };
          case "desktop_plan": throw "server_error";
          case "desktop_home":
            return {
              accounts: ["Yo#EUW"], ranks: [{ riotId: "Yo#EUW", queueType: "RANKED_SOLO_5x5", tier: "GOLD", rank: "II", lp: 40, wins: 20, losses: 18 }],
              record: { games: 20, wins: 11 }, recent: [{ matchId: "NA1_1", championName: "Ahri", win: true, kills: 7, deaths: 2, assists: 9, startedAt: 0, mode: "summoners_rift" }],
              champions: [{ name: "Ahri", games: 12, wins: 7 }], focus: "I want to focus on: CS per minute", challenges: [],
            };
          default: throw `unknown ${cmd}`;
        }
      },
      transformCallback: () => 0,
      metadata: { currentWindow: { label: "live" }, currentWebview: { label: "live" } },
    };
  });
  const nav = page.getByRole("tablist", { name: "Sections" });
  const setPhase = (p: string) => page.evaluate((x) => { (window as unknown as { __phase: string }).__phase = x; }, p);

  await page.goto("/");
  await expect(page.getByText("● In game")).toBeVisible();
  await expect(nav.getByRole("tab", { name: "Items" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("Your game")).toContainText("7/0/0");

  // The victory screen: back to Home with the player's profile, and nothing from the match left.
  await setPhase("end");
  await expect(nav.getByRole("tab", { name: "Home" })).toHaveAttribute("aria-selected", "true", { timeout: 10_000 });
  await expect(page.getByText("● In game")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Game" })).toHaveCount(0);
  await expect(page.getByLabel("Your game")).toHaveCount(0);
  await expect(nav.getByRole("tab", { name: "Items" })).toHaveCount(0);
  const home = page.getByRole("region", { name: "Your profile" });
  await expect(home).toContainText("Yo");
  await expect(home).toContainText("Solo/Duo: Gold II · 40 LP");
  await expect(home).toContainText("11W 9L");
  await page.screenshot({ path: "test-results/home.png" });

  // The end screen keeps answering: still Home. Then the game closes and a new one starts clean.
  await page.waitForTimeout(1500);
  await expect(nav.getByRole("tab", { name: "Home" })).toHaveAttribute("aria-selected", "true");
  await setPhase("closed");
  await page.waitForTimeout(6000);
  await setPhase("next");
  await expect(page.getByText("● In game")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByLabel("Your game")).toContainText("0/0/0");
});
