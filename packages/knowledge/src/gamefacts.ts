import { parseChampionKits, parseItems, parseRunes, parseSummonerSpells, type ChampionKit, type ItemFacts, type RuneData, type SummonerSpellFacts } from "./gamedata.js";

/**
 * The game facts the build engine needs, downloaded by the server: Data Dragon's items and full
 * champion files and summoner spells for the active patch, Meraki's items and champions (League of
 * Legends Wiki, CC BY-SA 3.0) and CommunityDragon's rune files (perks and perk styles). Parsed once
 * and kept in memory; refreshed daily or when the patch changes.
 * A failed download keeps the last good copy; nothing is used half-parsed.
 */
export interface GameFacts {
  version: string;
  items: ItemFacts[];
  kits: ChampionKit[];
  runes: RuneData;
  /** Summoner's Rift summoner spells. */
  spells: SummonerSpellFacts[];
}

export interface GameFactsSource {
  /** The facts for the active patch, or null when not available yet (waits at most `waitMs` cold). */
  get(waitMs?: number): Promise<GameFacts | null>;
}

const MERAKI_BASE = "https://cdn.merakianalytics.com/riot/lol/resources/latest/en-US";
const DDRAGON = "https://ddragon.leagueoflegends.com/cdn";
const CDRAGON = "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1";

export function gameFactsSource(opts: {
  /** The active Data Dragon version (from the knowledge registry). */
  version: () => string | null;
  fetchImpl?: typeof fetch;
  now?: () => number;
  ttlMs?: number;
  retryMs?: number;
}): GameFactsSource {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const now = opts.now ?? Date.now;
  const ttl = opts.ttlMs ?? 24 * 3600_000;
  const retry = opts.retryMs ?? 10 * 60_000;
  let data: GameFacts | null = null;
  let fetchedAt = -Infinity;
  let failedAt = -Infinity;
  let inflight: Promise<void> | null = null;

  const json = (url: string) => fetchImpl(url, { signal: AbortSignal.timeout(30_000) })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status} for ${url}`)))) as Promise<unknown>;

  const refresh = (version: string) => {
    inflight ??= Promise.all([
      json(`${DDRAGON}/${version}/data/en_US/item.json`),
      json(`${DDRAGON}/${version}/data/en_US/championFull.json`),
      json(`${MERAKI_BASE}/items.json`),
      json(`${MERAKI_BASE}/champions.json`),
      json(`${DDRAGON}/${version}/data/en_US/summoner.json`),
      json(`${CDRAGON}/perks.json`),
      json(`${CDRAGON}/perkstyles.json`),
    ])
      .then(([ddItems, ddChamps, mItems, mChamps, ddSpells, perks, perkStyles]) => {
        const items = parseItems(ddItems, mItems);
        const kits = parseChampionKits(ddChamps, mChamps);
        const runes = parseRunes(perks, perkStyles);
        const spells = parseSummonerSpells(ddSpells);
        if (items.filter((i) => i.purchasable).length < 100 || kits.length < 100 || runes.trees.length < 5 || spells.length < 5) throw new Error("incomplete game data");
        data = { version, items, kits, runes, spells };
        fetchedAt = now();
      })
      .catch((err) => {
        failedAt = now();
        console.warn("[game-facts] download failed; keeping the last copy", err instanceof Error ? err.message : err);
      })
      .finally(() => { inflight = null; });
    return inflight;
  };

  return {
    async get(waitMs = Infinity) {
      const version = opts.version();
      if (!version) return data;
      const stale = !data || data.version !== version || now() - fetchedAt > ttl;
      if (stale && now() - failedAt > retry) {
        const p = refresh(version);
        if (!data || data.version !== version) {
          await (Number.isFinite(waitMs) ? Promise.race([p, new Promise((r) => { const t = setTimeout(r, waitMs); (t as { unref?: () => void }).unref?.(); })]) : p);
        }
      }
      return data;
    },
  };
}
