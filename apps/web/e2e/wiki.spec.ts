import { expect, test } from "@playwright/test";

// The synthetic catalog has no Wiki data, so the champion response is extended in flight
// with a fixture in Meraki's reduced shape, to check how the page shows it and credits it.
const wiki = {
  key: "Aurelith", name: "Aurelith", positions: ["MIDDLE", "SUPPORT"], roles: ["BURST", "MAGE"], attackType: "Ranged", adaptiveType: "Magic damage",
  ratings: { damage: 3, toughness: 1, control: 2, mobility: 1, utility: 2, abilityReliance: 100, difficulty: 2 },
  abilities: [
    { key: "Q", name: "Glass Wave", blurb: "Sends a wave.", damageType: "Magic damage", targeting: "Direction", cooldown: "7 / 6.5 / 6 / 5.5 / 5", cost: "50 / 55 / 60 / 65 / 70",
      effects: [{ description: "Deals damage.", values: [{ label: "Magic Damage", value: "40 / 65 / 90 / 115 / 140 (+ 45% AP)" }] }] },
  ],
  patchLastChanged: null,
  attribution: { text: "x", license: "https://creativecommons.org/licenses/by-sa/3.0/", wiki: "https://wiki.leagueoflegends.com/", meraki: "https://github.com/meraki-analytics/lolstaticdata" },
};

test("champion page shows League of Legends Wiki data with its credit", async ({ page }, info) => {
  const player = `Wiki${info.project.name}`;
  await page.goto("/");
  await page.getByLabel("Your name").fill(player);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByLabel("Riot ID").fill(`${player}#EUW`);
  await page.getByRole("button", { name: "Link and analyze" }).click();
  await expect(page.getByText(/Based on \d+ analyzable games/)).toBeVisible({ timeout: 30_000 });

  await page.route("**/api/champions/Aurelith", async (route) => {
    const res = await route.fetch();
    await route.fulfill({ response: res, json: { ...(await res.json()), wiki } });
  });
  await page.goto("/champions/Aurelith");
  const style = page.getByRole("region", { name: "Playstyle" });
  await expect(style.getByText("Mid, Support")).toBeVisible();
  await expect(style.getByText("Burst, Mage")).toBeVisible();
  await expect(style.getByText(/Strengths:/)).toBeVisible();
  await expect(style.getByRole("link", { name: "CC BY-SA 3.0" })).toBeVisible();
  await page.getByText("Values per rank").click();
  await expect(page.getByText("40 / 65 / 90 / 115 / 140 (+ 45% AP)")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Combos and guides" })).toBeVisible();
  await page.screenshot({ path: `test-results/wiki-${info.project.name}.png`, fullPage: true });
});
