// Downloads the current game data the recommendation engine reasons with, reduces it to the
// fields the engine uses (scripts/game-data/compact.mjs) and writes it to
// packages/knowledge/fixtures/game-data/ for tests.
// Run by .github/workflows/game-data-snapshot.yml (the dev container has no access to these hosts).
//
// Sources (approved in the project; see docs/12-ampliacion.md):
// - Riot Data Dragon (official): items, champions (full, with spells), runes, summoner spells.
// - Meraki Analytics lolstaticdata: items and champions, from the League of Legends Wiki, CC BY-SA 3.0.
// - CommunityDragon: runes (perks.json, perkstyles.json), built from the game client's files.
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  compactDdragonChampions, compactDdragonItems, compactMerakiChampions, compactMerakiItems, compactPerks, compactPerkStyles,
} from "./game-data/compact.mjs";

const OUT = join(process.cwd(), "packages/knowledge/fixtures/game-data");

async function get(url) {
  const res = await fetch(url, { headers: { "User-Agent": "koi-master-game-data-snapshot" } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

const [version] = await get("https://ddragon.leagueoflegends.com/api/versions.json");
const dd = (file) => get(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/${file}`);
const [items, championFull, runes, summoners] = await Promise.all([dd("item.json"), dd("championFull.json"), dd("runesReforged.json"), dd("summoner.json")]);

const merakiBase = "https://cdn.merakianalytics.com/riot/lol/resources/latest/en-US";
const [merakiItems, merakiChampions] = await Promise.all([get(`${merakiBase}/items.json`), get(`${merakiBase}/champions.json`)]);

const cdragonBase = "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1";
const [perks, perkStyles] = await Promise.all([get(`${cdragonBase}/perks.json`), get(`${cdragonBase}/perkstyles.json`)]);

await mkdir(OUT, { recursive: true });
const write = (name, data) => writeFile(join(OUT, name), JSON.stringify(data));
await write("ddragon-item.json", compactDdragonItems(items));
await write("ddragon-champion-full.json", compactDdragonChampions(championFull));
await write("ddragon-runes.json", runes);
await write("ddragon-summoner.json", summoners);
await write("meraki-items.json", compactMerakiItems(merakiItems));
await write("meraki-champions.json", compactMerakiChampions(merakiChampions));
await write("cdragon-perks.json", compactPerks(perks));
await write("cdragon-perkstyles.json", compactPerkStyles(perkStyles));
await writeFile(join(OUT, "meta.json"), JSON.stringify({
  ddragonVersion: version,
  fetchedAt: new Date().toISOString(),
  sources: {
    ddragon: "https://ddragon.leagueoflegends.com (Riot Games)",
    meraki: "https://github.com/meraki-analytics/lolstaticdata — League of Legends Wiki data, CC BY-SA 3.0",
    cdragon: "https://raw.communitydragon.org (CommunityDragon)",
  },
}, null, 2) + "\n");
console.log(`game data ${version}: ${Object.keys(championFull.data).length} champions, ${Object.keys(items.data).length} items, ${Object.keys(merakiItems).length} Meraki items, ${perks.length} perks`);
