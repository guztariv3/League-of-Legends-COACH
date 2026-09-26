import { z } from "zod";

/**
 * A champion's abilities from Data Dragon's per-champion file
 * (`cdn/<version>/data/<locale>/champion/<id>.json`): names, descriptions and
 * the per-rank cooldown, cost and range strings as Riot publishes them. Riot's
 * descriptions carry markup, which is stripped to plain text. Numbers inside
 * descriptions are Riot's general text, not exact scalings (D-06).
 */

const Spell = z.looseObject({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  cooldownBurn: z.string().optional(),
  costBurn: z.string().optional(),
  rangeBurn: z.string().optional(),
  image: z.looseObject({ full: z.string() }),
});
const DetailFile = z.looseObject({
  version: z.string(),
  data: z.record(z.string(), z.looseObject({
    id: z.string(),
    name: z.string(),
    lore: z.string().optional(),
    allytips: z.array(z.string()).optional(),
    enemytips: z.array(z.string()).optional(),
    spells: z.array(Spell).length(4),
    passive: z.looseObject({ name: z.string(), description: z.string(), image: z.looseObject({ full: z.string() }) }),
  })),
});

export interface Ability {
  key: "P" | "Q" | "W" | "E" | "R";
  name: string;
  description: string;
  /** Per-rank values as Riot writes them, e.g. "7/6.5/6/5.5/5"; null when not applicable. */
  cooldown: string | null;
  cost: string | null;
  range: string | null;
  /** Image file name under img/spell (abilities) or img/passive (passive). */
  image: string;
}

export interface ChampionAbilities {
  version: string;
  id: string;
  abilities: Ability[];
  /** Riot's own short tips for playing as and against the champion. */
  allyTips: string[];
  enemyTips: string[];
}

export function plainText(html: string): string {
  return html.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

const burn = (s: string | undefined) => (!s || s === "0" || /^0(\/0)*$/.test(s) ? null : s);

export function parseChampionAbilities(json: unknown): ChampionAbilities {
  const file = DetailFile.parse(json);
  const c = Object.values(file.data)[0];
  if (!c) throw new Error("empty champion file");
  const keys = ["Q", "W", "E", "R"] as const;
  return {
    version: file.version,
    id: c.id,
    abilities: [
      { key: "P", name: c.passive.name, description: plainText(c.passive.description), cooldown: null, cost: null, range: null, image: c.passive.image.full },
      ...c.spells.map((s, i) => ({
        key: keys[i]!, name: s.name, description: plainText(s.description),
        cooldown: burn(s.cooldownBurn), cost: burn(s.costBurn), range: burn(s.rangeBurn), image: s.image.full,
      })),
    ],
    allyTips: (c.allytips ?? []).map(plainText).filter(Boolean),
    enemyTips: (c.enemytips ?? []).map(plainText).filter(Boolean),
  };
}

const cache = new Map<string, Promise<ChampionAbilities | null>>();

/** Fetches (once per version and champion) and parses the abilities; null when unavailable. */
export function fetchChampionAbilities(version: string, id: string, fetchImpl: typeof fetch = fetch, locale = "en_US"): Promise<ChampionAbilities | null> {
  if (!/^[A-Za-z0-9]{1,40}$/.test(id) || !/^[0-9.]{1,20}$/.test(version)) return Promise.resolve(null);
  const key = `${version}:${locale}:${id}`;
  let hit = cache.get(key);
  if (!hit) {
    hit = fetchImpl(`https://ddragon.leagueoflegends.com/cdn/${version}/data/${locale}/champion/${id}.json`, { signal: AbortSignal.timeout(4000) })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => (j ? parseChampionAbilities(j) : null))
      .catch(() => null);
    // A failure is not cached, so a later visit can try again.
    void hit.then((v) => { if (!v) cache.delete(key); });
    cache.set(key, hit);
  }
  return hit;
}
