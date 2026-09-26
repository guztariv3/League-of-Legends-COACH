import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * The real game data snapshot in packages/knowledge/fixtures/game-data, for tests only (Node).
 * Refreshed by the "Game data snapshot" workflow; see scripts/snapshot-game-data.mjs.
 */
export function gameData() {
  const read = (file: string): unknown => JSON.parse(readFileSync(fileURLToPath(new URL(`../fixtures/game-data/${file}`, import.meta.url)), "utf8"));
  return {
    meta: read("meta.json") as { ddragonVersion: string; fetchedAt: string },
    ddragonItems: read("ddragon-item.json"),
    ddragonChampions: read("ddragon-champion-full.json"),
    ddragonRunes: read("ddragon-runes.json"),
    summoners: read("ddragon-summoner.json"),
    merakiItems: read("meraki-items.json"),
    merakiChampions: read("meraki-champions.json"),
    perks: read("cdragon-perks.json"),
    perkStyles: read("cdragon-perkstyles.json"),
  };
}
