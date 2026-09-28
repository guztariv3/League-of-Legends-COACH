import { expect, test, type Page } from "@playwright/test";
import { championJson, itemJson } from "../../../packages/itemization/src/test-fixture";

/**
 * A live game as the game's own Live Client Data API reports it, through a stub of Tauri's
 * IPC: the board shows both teams with their items, and "Items" the next item to buy.
 */
async function inGame(page: Page, withEngine: boolean) {
  await page.addInitScript((withEngine: boolean) => {
    // Me: Ahri with boots and Luden. Enemies: physical, two of them healing with Bloodthirster.
    const champs: [string, string, { itemID: number; displayName: string; price: number }[], number][] = [
      ["Ahri", "Ahri", [{ itemID: 3020, displayName: "Sorcerer's Shoes", price: 1100 }, { itemID: 6655, displayName: "Luden's Companion", price: 2750 }], 2],
      ["Lux", "Lux", [], 1], ["Jinx", "Jinx", [], 1], ["Garen", "Garen", [], 1], ["Malphite", "Malphite", [], 1],
      ["Zed", "Zed", [{ itemID: 3072, displayName: "Bloodthirster", price: 3400 }], 6], ["Draven", "Draven", [{ itemID: 3031, displayName: "Infinity Edge", price: 3450 }], 4],
      ["Miss Fortune", "MissFortune", [{ itemID: 1055, displayName: "Doran's Blade", price: 450 }], 1], ["Aatrox", "Aatrox", [{ itemID: 3072, displayName: "Bloodthirster", price: 3400 }], 2],
      ["Wukong", "MonkeyKing", [{ itemID: 1055, displayName: "Doran's Blade", price: 450 }], 0],
    ];
    const snapshot = {
      // Q maxed first so far, with two points unspent: the skill advisor follows the player's Q-W-E habit.
      activePlayer: { riotId: "Yo#EUW", level: 9, currentGold: 1000, abilities: { Q: { abilityLevel: 4 }, W: { abilityLevel: 1 }, E: { abilityLevel: 1 }, R: { abilityLevel: 1 } } },
      allPlayers: champs.map(([name, raw, items, kills], i) => ({
        championName: name, rawChampionName: `game_character_displayname_${raw}`,
        riotId: i === 0 ? "Yo#EUW" : `Jugador${i}#EUW`, team: i < 5 ? "ORDER" : "CHAOS", level: 9, position: "",
        items, scores: { kills, deaths: 1, assists: 2, creepScore: 80 },
      })),
      events: { Events: [] },
      gameData: { gameMode: "CLASSIC", gameTime: 900, mapNumber: 11 },
    };
    localStorage.setItem("koi.link", JSON.stringify({ origin: "https://koi.example", token: "device-token-for-tests-only" }));
    const auditWindow = window as unknown as { __changeRole?: (position:string)=>void; __plans?: string[]; __delayTop?: boolean; __releaseTop?: ()=>void };
    auditWindow.__changeRole = position => { snapshot.allPlayers[0]!.position = position; };
    auditWindow.__plans = [];
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
              skillOrders: Array(4).fill([1, 2, 3, 1, 1, 4, 1, 2, 1, 2, 4, 2, 2, 3, 3, 4, 3, 3]),
              items: [{ id: 6655, name: "Luden's Companion", games: 10, wins: 6 }, { id: 3089, name: "Rabadon's Deathcap", games: 8, wins: 5 }],
            };
          case "desktop_plan":
            auditWindow.__plans!.push(String(args.position));
            if (args.me !== "Ahri" || !String(args.enemies).includes("Zed")) throw "server_error";
            return {
              plan: {
                primaryObjective: { text: "Your key number: deaths before minute 14", basis: "observation", why: "0.8 in wins versus 2.1 in losses." },
                secondaryObjective: null,
                biggestThreat: { text: "Zed", basis: "hypothesis", why: "Assassin with the highest damage rating on their team (9/10 in Riot's general ratings)." },
                yourPowerSpike: { text: "Luden's Companion (around minute 14)", basis: "observation", why: "Your first major item in 9 of your 12 games with Ahri." },
                enemyPowerSpike: { text: "Zed: level 6 and their first completed item", basis: "hypothesis", why: "A general tendency of the Assassin class." },
                avoid: { text: "You often die twice before minute 14 with Ahri", basis: "observation", why: "5 of your last 12 games with Ahri." }, lookFor: null,
                loadout: { games: 12, keystone: { name: "Electrocute" }, spells: { names: ["Flash", "Ignite"] }, maxOrder: ["Q", "W", "E"], firstItem: { name: "Luden's Companion" } },
              },
              memory: {
                patterns: [
                  { id: "early-deaths", kind: "mistake", scope: "champion", text: "You often die twice before minute 14 with Ahri", why: "5 of your last 12 games with Ahri.", games: 12, hits: 5 },
                  { id: "lane-strong", kind: "strength", scope: "role", text: "You usually win your lane early as mid laner", why: "Ahead in gold at 10 in 14 of 20 games (median +320).", games: 20, hits: 14 },
                ],
                style: { style: "aggressive", why: "You look for fights: 61% kill participation and 1.4 deaths before minute 14 on average (20 games).", games: 20 },
              },
            };
          case "desktop_items":
            // The site's build engine; without it (the default here) the local item rules are used.
            if (!withEngine) throw "server_error";
            (window as unknown as { __items: unknown }).__items = args;
            if (args.position === "TOP" && auditWindow.__delayTop) await new Promise<void>(resolve => { auditWindow.__releaseTop=resolve; });
            return {
              build: {
                first: { id: 3089, name: "Rabadon's Deathcap", score: 1.3, why: ["Gives 130 ability power: Ahri's Q, W, E and R scale with ability power.", `Role ${args.position || "unknown"}`] },
                next: [{ id: 3165, name: "Morellonomicon", score: 1.1, why: ["It applies Grievous Wounds: Zed: life steal from items."] }],
                boots: null, situational: [], starter: null,
              },
            };
          default: throw `unknown ${cmd}`;
        }
      },
      transformCallback: () => 0,
      metadata: { currentWindow: { label: "live" }, currentWebview: { label: "live" } },
    };
  }, withEngine);
  // Data Dragon stand-in: the version list and a placeholder picture for every image.
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
  await page.route("https://ddragon.leagueoflegends.com/**", (r) => {
    const url = r.request().url();
    if (url.endsWith("/api/versions.json")) return r.fulfill({ json: ["15.19.1", "15.18.1"] });
    if (url.endsWith("/data/en_US/item.json")) return r.fulfill({ json: itemJson });
    if (url.endsWith("/data/en_US/champion.json")) return r.fulfill({ json: championJson });
    return r.fulfill({ body: png, contentType: "image/png" });
  });

}

test("in game: both teams with items, and your build from your history", async ({ page }) => {
  await inGame(page, false);
  await page.goto("/");
  await expect(page.getByText("● In game")).toBeVisible();
  const board = page.getByRole("region", { name: "Game" });

  // Items (opened when the game starts, from the top navigation): the next item follows the enemy team, with reasons and how to buy it.
  await expect(page.getByRole("tablist", { name: "Sections" }).getByRole("tab", { name: "Items" })).toHaveAttribute("aria-selected", "true");
  await expect(board).toContainText("Contextual item guidance unavailable");
  await expect(board.getByRole("region", { name: "Next suggested item" })).toHaveCount(0);
  await expect(board.getByRole("region", { name: "Shopping plan" })).toHaveCount(0);
  await page.screenshot({ path: "test-results/board-items.png" });

  // Plan: the Coach's game plan for these champions, from the website.
  await page.getByRole("tablist", { name: "Sections" }).getByRole("tab", { name: "Plan" }).click();
  const planTab = board.getByRole("region", { name: "Coach game plan" });
  await expect(planTab).toContainText("Biggest threat");
  await expect(planTab).toContainText("Zed");
  await expect(planTab).toContainText("Your usual setup (12 games): Electrocute · Flash + Ignite · max Q → W → E · first item Luden's Companion");
  // Above it, the live plan for this moment of the game (or a line saying nothing changes it).
  await expect(planTab.getByRole("region", { name: "Right now" }).or(planTab.getByText("Right now: nothing changes your game plan."))).toBeVisible();
  await expect(planTab).toContainText("From champion select");
  // Phase 5: the recurring mistake is the "avoid" line; the rest of what the coach remembers is folded.
  await expect(planTab).toContainText("What to avoidYou often die twice before minute 14 with Ahri");
  const games = planTab.getByLabel("From your games");
  await expect(games.locator("summary")).toContainText("You look for fights");
  await games.locator("summary").click();
  await expect(games.getByText(/Strength: You usually win your lane early/)).toBeVisible();
  await expect(games.getByText(/die twice before minute 14/)).toHaveCount(0); // not repeated

  await page.screenshot({ path: "test-results/board-plan.png" });

  // Skills: ranks, and the next ability from the player's own order.
  await page.getByRole("tablist", { name: "Sections" }).getByRole("tab", { name: "Skills" }).click();
  await expect(board.getByRole("region", { name: "Next ability" })).toContainText("In 4 of your last 4 games with Ahri you took W at this point.");
  await expect(board).toContainText("You usually max Q → W → E on Ahri (4 games).");
  await page.screenshot({ path: "test-results/board-skills.png" });

  // Gold: matchups by item value (no lanes here, so list order), team totals and objectives.
  await page.getByRole("tablist", { name: "Sections" }).getByRole("tab", { name: "Gold" }).click();
  const gold = board.getByRole("region", { name: "Gold difference" });
  await expect(gold.getByRole("listitem")).toHaveCount(5);
  await expect(gold.getByRole("listitem").first()).toContainText("+0.5k");
  await expect(gold).toContainText("Your team 3.9k");
  await expect(gold).toContainText("Enemy 11.2k");
  await expect(board).toContainText("Your team is 7.3k item gold behind.");
  await expect(board.getByRole("region", { name: "Objectives" })).toBeVisible();
  await page.screenshot({ path: "test-results/board-gold.png" });

  // The Enemies and Team sections are gone from the navigation (the Coach still reads both teams).
  const tabs = page.getByRole("tablist", { name: "Sections" }).getByRole("tab");
  await expect(tabs).toHaveCount(6);
  for (const name of ["Home", "Plan", "Items", "Skills", "Gold", "Settings"]) await expect(page.getByRole("tab", { name, exact: true })).toBeVisible();
  for (const name of ["Enemies", "Team"]) await expect(page.getByRole("tab", { name })).toHaveCount(0);
  await expect(board.getByRole("img", { name: "Wukong" }).first()).toHaveAttribute("src", "https://ddragon.leagueoflegends.com/cdn/15.19.1/img/champion/MonkeyKing.png");
});

test("waiting, not connected: a visible Connect button opens the code form", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Waiting for a game")).toBeVisible();
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByLabel("Code")).toBeVisible();
});

test("demo: the in-game sections appear in the top navigation", async ({ page }) => {
  await page.goto("/?demoSpeed=150");
  await page.getByRole("tablist", { name: "Sections" }).getByRole("tab", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Try the demo" }).click();
  const board = page.getByRole("region", { name: "Game" });
  await expect(board).toContainText("In the demo the items are made up", { timeout: 15_000 });
  await expect(page.getByRole("tablist", { name: "Sections" }).getByRole("tab", { name: "Enemies" })).toHaveCount(0);
  await expect(page.getByRole("tablist", { name: "Sections" }).getByRole("tab", { name: "Team" })).toHaveCount(0);

  // Leaving the demo clears the match and goes back Home.
  await page.getByRole("tablist", { name: "Sections" }).getByRole("tab", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Exit demo" }).click();
  await expect(page.getByRole("tablist", { name: "Sections" }).getByRole("tab", { name: "Home" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("region", { name: "Game" })).toHaveCount(0);
  await expect(page.getByRole("tablist", { name: "Sections" }).getByRole("tab", { name: "Items" })).toHaveCount(0);
});

test("in game with the site connected: Items follows the site's build engine", async ({ page }) => {
  await inGame(page, true);
  await page.goto("/");
  const board = page.getByRole("region", { name: "Game" });
  const next = board.getByRole("region", { name: "Next suggested item" });
  await expect(next).toContainText("Rabadon's Deathcap");
  await expect(next).toContainText("Ahri's Q, W, E and R scale with ability power");
  await expect(board.getByRole("region", { name: "Next suggested item" })).not.toContainText("Morellonomicon"); // the local rules no longer choose
  // What your gold buys now toward it, and when the items arrive at your pace.
  const shop = board.getByRole("region", { name: "Shopping plan" });
  await expect(shop).toContainText("Buy now");
  await expect(shop.getByRole("list", { name: "When your items arrive" })).toContainText("Rabadon's Deathcap");
  await expect(shop).toContainText(/gold per minute/);
  await page.screenshot({ path: "test-results/board-buynow.png", fullPage: true });
  // Only champions, item ids and kill/death counts go to the site.
  const sent = await page.evaluate(() => (window as unknown as { __items: Record<string, unknown> }).__items);
  expect(sent).toMatchObject({ me: "Ahri", mine: "3020.6655", opening: false });
  expect(String(sent.enemies)).toContain("Zed~3072~6~1");
  expect(JSON.stringify(sent)).not.toContain("Jugador");
});


test("role switches refresh setup and hide an old role's item answer, including late responses", async ({page}) => {
  await inGame(page, true);
  await page.goto("/");
  const board=page.getByRole("region",{name:"Game"});
  const next=board.getByRole("region",{name:"Next suggested item"});
  await expect(next).toContainText("Rabadon's Deathcap");
  await page.evaluate(()=>{const w=window as unknown as {__delayTop:boolean;__changeRole:(p:string)=>void};w.__delayTop=true;w.__changeRole('TOP');});
  await expect(board).toContainText('Contextual item guidance unavailable');
  await expect.poll(()=>page.evaluate(()=>(window as unknown as {__plans:string[]}).__plans)).toContain('TOP');
  await page.evaluate(()=>(window as unknown as {__changeRole:(p:string)=>void}).__changeRole('MIDDLE'));
  await expect(next).toContainText('Role MIDDLE');
  await expect.poll(()=>page.evaluate(()=>(window as unknown as {__plans:string[]}).__plans)).toContain('MIDDLE');
  await page.evaluate(()=>(window as unknown as {__releaseTop:()=>void}).__releaseTop());
  await expect(next).toContainText('Role MIDDLE');
  await expect(next).not.toContainText('Role TOP');
});
