import { z } from "zod";
import { syntheticChampionJson, syntheticItemJson, SYNTHETIC_KNOWLEDGE_VERSION } from "@coach/synthetic";

/**
 * Versioned static game knowledge (champions, items, summoner spells, runes) sourced from Data Dragon.
 *
 * Pipeline: fetch → validate (schema + sanity against the active version) →
 * stage → activate. Every bundle is tied to a version, so versions are never
 * mixed. A rejected bundle never replaces the active one, and rollback()
 * restores the previous active version.
 */

const DDragonChampionFile = z.object({
  version: z.string(),
  data: z.record(
    z.string(),
    z.looseObject({
      id: z.string(),
      key: z.string(),
      name: z.string(),
      title: z.string(),
      tags: z.array(z.string()),
      // Riot's own 0–10 ratings in Data Dragon; used only as approximate signals.
      info: z.object({ attack: z.number(), defense: z.number(), magic: z.number(), difficulty: z.number() }).optional(),
    }),
  ),
});

const DDragonItemFile = z.object({
  version: z.string(),
  data: z.record(z.string(), z.looseObject({ name: z.string(), gold: z.looseObject({ total: z.number() }) })),
});

// Summoner spells and runes only feed icons: a feed that fails or changes shape leaves them empty
// instead of rejecting the whole bundle.
const DDragonSpellFile = z.object({
  version: z.string(),
  data: z.record(z.string(), z.looseObject({ id: z.string(), key: z.string(), name: z.string() })),
});
const DDragonRune = z.looseObject({ id: z.number(), key: z.string(), name: z.string(), icon: z.string() });
const DDragonRuneFile = z.array(DDragonRune.extend({ slots: z.array(z.looseObject({ runes: z.array(DDragonRune) })) }));

export interface SummonerSpell {
  /** Numeric key used by match data (summoner1Id / summoner2Id). */
  key: number;
  /** Data Dragon id, which is also the image name (e.g. "SummonerFlash"). */
  id: string;
  name: string;
}

export interface Rune {
  /** Perk or style id used by match data. */
  id: number;
  name: string;
  /** Icon path under the versionless Data Dragon image root. */
  icon: string;
  /** true for rune paths (Precision, Domination…), false for individual runes. */
  style: boolean;
}

export interface Champion {
  id: string;
  key: number;
  name: string;
  title: string;
  tags: string[];
  /** Data Dragon 0–10 ratings (approximate; absent in some bundles). */
  info?: { attack: number; defense: number; magic: number; difficulty: number };
}

export interface Item {
  id: number;
  name: string;
  goldTotal: number;
}

/**
 * Version of the *parsed* bundle shape. Bump when fetchBundle starts extracting
 * new fields, so stored bundles of the same game version get re-ingested.
 * v2: champion `info` ratings.
 * v3: summoner spells and runes.
 */
export const KNOWLEDGE_SCHEMA_VERSION = 3;

export interface KnowledgeBundle {
  version: string;
  /** Parser version that produced this bundle (absent = 1). */
  schemaVersion?: number;
  source: "ddragon" | "synthetic";
  champions: Champion[];
  items: Item[];
  /** Absent in bundles stored before schema v3 and in the synthetic catalog. */
  spells?: SummonerSpell[];
  runes?: Rune[];
}

export interface KnowledgeSource {
  readonly kind: KnowledgeBundle["source"];
  latestVersion(): Promise<string>;
  championFile(version: string): Promise<unknown>;
  itemFile(version: string): Promise<unknown>;
  summonerFile?(version: string): Promise<unknown>;
  runesFile?(version: string): Promise<unknown>;
}

/** Data Dragon over HTTPS. Paths follow the public Data Dragon CDN layout. */
export function dataDragonSource(fetchImpl: typeof fetch = fetch, locale = "en_US"): KnowledgeSource {
  const base = "https://ddragon.leagueoflegends.com";
  const getJson = async (url: string) => {
    const res = await fetchImpl(url);
    if (!res.ok) throw new Error(`Data Dragon ${res.status} for ${url}`);
    return res.json() as Promise<unknown>;
  };
  return {
    kind: "ddragon",
    async latestVersion() {
      const versions = z.array(z.string()).min(1).parse(await getJson(`${base}/api/versions.json`));
      return versions[0]!;
    },
    championFile: (v) => getJson(`${base}/cdn/${v}/data/${locale}/champion.json`),
    itemFile: (v) => getJson(`${base}/cdn/${v}/data/${locale}/item.json`),
    summonerFile: (v) => getJson(`${base}/cdn/${v}/data/${locale}/summoner.json`),
    runesFile: (v) => getJson(`${base}/cdn/${v}/data/${locale}/runesReforged.json`),
  };
}

/** Fictional catalog used by the synthetic environment. */
export function syntheticSource(): KnowledgeSource {
  return {
    kind: "synthetic",
    latestVersion: async () => SYNTHETIC_KNOWLEDGE_VERSION,
    championFile: async () => syntheticChampionJson(),
    itemFile: async () => syntheticItemJson(),
  };
}

export async function fetchBundle(source: KnowledgeSource, version?: string): Promise<KnowledgeBundle> {
  const v = version ?? (await source.latestVersion());
  const champs = DDragonChampionFile.parse(await source.championFile(v));
  const items = DDragonItemFile.parse(await source.itemFile(v));
  if (champs.version !== v || items.version !== v) {
    throw new Error(`Version mismatch: requested ${v}, got champions=${champs.version} items=${items.version}`);
  }
  return {
    version: v,
    schemaVersion: KNOWLEDGE_SCHEMA_VERSION,
    source: source.kind,
    champions: Object.values(champs.data).map((c) => ({
      id: c.id, key: Number(c.key), name: c.name, title: c.title, tags: c.tags, ...(c.info ? { info: c.info } : {}),
    })),
    items: Object.entries(items.data).map(([id, i]) => ({ id: Number(id), name: i.name, goldTotal: i.gold.total })),
    spells: await optionalFeed("summoner spells", () => source.summonerFile?.(v), (raw) =>
      Object.values(DDragonSpellFile.parse(raw).data).map((sp) => ({ key: Number(sp.key), id: sp.id, name: sp.name }))),
    runes: await optionalFeed("runes", () => source.runesFile?.(v), (raw) =>
      DDragonRuneFile.parse(raw).flatMap((style) => [
        { id: style.id, name: style.name, icon: style.icon, style: true },
        ...style.slots.flatMap((slot) => slot.runes.map((r) => ({ id: r.id, name: r.name, icon: r.icon, style: false }))),
      ])),
  };
}

async function optionalFeed<T>(what: string, load: () => Promise<unknown> | undefined, parse: (raw: unknown) => T[]): Promise<T[]> {
  try {
    const raw = await load();
    return raw === undefined ? [] : parse(raw);
  } catch (err) {
    console.warn(`[knowledge] ${what} unavailable; icons fall back to text`, err);
    return [];
  }
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

/** Structural + sanity checks. `previous` is the currently active bundle, if any. */
export function validateBundle(b: KnowledgeBundle, previous?: KnowledgeBundle): ValidationResult {
  const errors: string[] = [];
  if (!b.champions.length) errors.push("no champions");
  if (!b.items.length) errors.push("no items");
  const keys = new Set(b.champions.map((c) => c.key));
  if (keys.size !== b.champions.length) errors.push("duplicate champion keys");
  if (b.champions.some((c) => !Number.isInteger(c.key) || c.key <= 0)) errors.push("invalid champion key");
  if (b.items.some((i) => !Number.isInteger(i.id) || i.goldTotal < 0)) errors.push("invalid item");
  if (previous && previous.source === b.source) {
    // A new patch adds champions and never removes many; a big drop means a broken feed.
    if (b.champions.length < previous.champions.length * 0.95) errors.push("champion count dropped by more than 5%");
    if (b.items.length < previous.items.length * 0.7) errors.push("item count dropped by more than 30%");
  }
  return { ok: errors.length === 0, errors };
}

export type BundleStatus = "active" | "staged" | "rejected" | "retired";

/** In-memory registry; the API persists bundles and statuses in Postgres. */
export class KnowledgeRegistry {
  private readonly bundles = new Map<string, { bundle: KnowledgeBundle; status: BundleStatus; errors: string[] }>();
  private history: string[] = [];

  active(): KnowledgeBundle | undefined {
    const v = this.history[this.history.length - 1];
    return v ? this.bundles.get(v)?.bundle : undefined;
  }

  status(version: string) {
    const e = this.bundles.get(version);
    return e ? { status: e.status, errors: e.errors } : undefined;
  }

  /** Validate and activate. Returns the validation result; the active bundle only changes on success. */
  install(bundle: KnowledgeBundle): ValidationResult {
    const result = validateBundle(bundle, this.active());
    if (!result.ok) {
      // Never overwrite the active bundle's entry with a rejected re-ingest of the same version.
      if (this.active()?.version !== bundle.version) this.bundles.set(bundle.version, { bundle, status: "rejected", errors: result.errors });
      return result;
    }
    const prev = this.active();
    if (prev) this.bundles.get(prev.version)!.status = "retired";
    this.bundles.set(bundle.version, { bundle, status: "active", errors: [] });
    this.history = this.history.filter((v) => v !== bundle.version).concat(bundle.version);
    return result;
  }

  rollback(): KnowledgeBundle | undefined {
    if (this.history.length < 2) return undefined;
    const bad = this.history.pop()!;
    this.bundles.get(bad)!.status = "rejected";
    const restored = this.active()!;
    this.bundles.get(restored.version)!.status = "active";
    return restored;
  }

  champion(key: number): Champion | undefined {
    return this.active()?.champions.find((c) => c.key === key);
  }
}
export * from "./abilities.js";
