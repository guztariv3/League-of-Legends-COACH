/**
 * Champion knowledge from Meraki Analytics' `lolstaticdata` (D-15): per-rank ability
 * values, damage types, positions, subclasses and the League of Legends Wiki's 1–3
 * attribute ratings. The data comes from the LoL Wiki under CC BY-SA 3.0, so every page
 * that shows it carries the attribution in `MERAKI_ATTRIBUTION`. Meraki asks consumers
 * to cache it: the combined file is fetched at most once a day and reduced to what the
 * app shows. Nothing here is invented: missing fields stay null.
 */

export const MERAKI_URL = "https://cdn.merakianalytics.com/riot/lol/resources/latest/en-US/champions.json";

export const MERAKI_ATTRIBUTION = {
  text: "Ability details, positions and ratings: League of Legends Wiki (CC BY-SA 3.0), via Meraki Analytics.",
  license: "https://creativecommons.org/licenses/by-sa/3.0/",
  wiki: "https://wiki.leagueoflegends.com/",
  meraki: "https://github.com/meraki-analytics/lolstaticdata",
};

export type AbilityKey = "P" | "Q" | "W" | "E" | "R";

export interface WikiAbility {
  key: AbilityKey;
  name: string;
  /** Short plain-text summary, when the Wiki has one. */
  blurb: string | null;
  /** e.g. "Magic damage"; null when not given. */
  damageType: string | null;
  /** e.g. "Direction", "Auto", "Unit". */
  targeting: string | null;
  /** Per-rank values as the Wiki writes them, e.g. "7 / 6.5 / 6 / 5.5 / 5 seconds". */
  cooldown: string | null;
  cost: string | null;
  effects: { description: string; values: { label: string; value: string }[] }[];
}

export interface WikiRatings {
  damage: number;
  toughness: number;
  control: number;
  mobility: number;
  utility: number;
  abilityReliance: number;
  difficulty: number;
}

export interface WikiChampion {
  /** Data Dragon id ("MonkeyKing"). */
  key: string;
  name: string;
  /** Lanes the Wiki lists for the champion (TOP, JUNGLE, MIDDLE, BOTTOM, SUPPORT). */
  positions: string[];
  /** Wiki subclasses (e.g. BURST, BATTLEMAGE, DIVER). */
  roles: string[];
  attackType: string | null;
  adaptiveType: string | null;
  /** 1–3 scale (low / medium / high); null when missing. */
  ratings: WikiRatings | null;
  abilities: WikiAbility[];
  patchLastChanged: string | null;
}

type Json = Record<string, unknown>;
const obj = (x: unknown): Json | null => (x && typeof x === "object" && !Array.isArray(x) ? (x as Json) : null);
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const str = (x: unknown): string | null => (typeof x === "string" && x.trim() ? x.trim() : null);
const num = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);

const round = (n: number) => String(Math.round(n * 100) / 100);
const upperWords = (s: string | null) => (s ? s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ") : null);

/** One modifier: "40 / 65 / 90 / 115 / 140% AP", or one value when every rank is the same. */
function modifier(m: unknown): string | null {
  const o = obj(m);
  if (!o) return null;
  const values = arr(o["values"]).map(num);
  const units = arr(o["units"]).map((u) => (typeof u === "string" ? u : ""));
  if (!values.length || values.some((v) => v === null)) return null;
  const vs = values as number[];
  const sameUnit = units.every((u) => u === units[0]);
  if (vs.every((v) => v === vs[0])) return `${round(vs[0]!)}${units[0] ?? ""}`;
  return sameUnit ? `${vs.map(round).join(" / ")}${units[0] ?? ""}` : vs.map((v, i) => `${round(v)}${units[i] ?? ""}`).join(" / ");
}

/** The Wiki's style: base values, then scalings in parentheses, e.g. "40 / 65 / 90 (+ 40% AP)". */
function modifiers(list: unknown): string | null {
  const parts = arr(list).map(modifier).filter((x): x is string => x !== null);
  if (!parts.length) return null;
  return [parts[0], ...parts.slice(1).map((p) => `(+ ${p})`)].join(" ");
}

function ability(key: AbilityKey, a: unknown): WikiAbility | null {
  const o = obj(a);
  const name = str(o?.["name"]);
  if (!o || !name) return null;
  return {
    key,
    name,
    blurb: str(o["blurb"]),
    damageType: upperWords(str(o["damageType"])),
    targeting: str(o["targeting"]),
    cooldown: modifiers(obj(o["cooldown"])?.["modifiers"]),
    cost: modifiers(obj(o["cost"])?.["modifiers"]),
    effects: arr(o["effects"]).flatMap((e) => {
      const eo = obj(e);
      const description = str(eo?.["description"]);
      if (!eo || !description) return [];
      const values = arr(eo["leveling"]).flatMap((l) => {
        const lo = obj(l);
        const label = str(lo?.["attribute"]);
        const value = modifiers(lo?.["modifiers"]);
        return label && value ? [{ label, value }] : [];
      });
      return [{ description, values }];
    }),
  };
}

const RATING_KEYS: (keyof WikiRatings)[] = ["damage", "toughness", "control", "mobility", "utility", "abilityReliance", "difficulty"];

/** Reduces one champion from Meraki's file; null when it lacks a key or name. */
export function parseWikiChampion(c: unknown): WikiChampion | null {
  const o = obj(c);
  const key = str(o?.["key"]);
  const name = str(o?.["name"]);
  if (!o || !key || !name) return null;
  const r = obj(o["attributeRatings"]);
  const ratings = r && RATING_KEYS.every((k) => num(r[k]) !== null)
    ? Object.fromEntries(RATING_KEYS.map((k) => [k, num(r[k])!])) as unknown as WikiRatings
    : null;
  const abilities = obj(o["abilities"]);
  return {
    key,
    name,
    positions: arr(o["positions"]).map(str).filter((x): x is string => x !== null),
    roles: arr(o["roles"]).map(str).filter((x): x is string => x !== null),
    attackType: upperWords(str(o["attackType"])),
    adaptiveType: upperWords(str(o["adaptiveType"])),
    ratings,
    abilities: (["P", "Q", "W", "E", "R"] as AbilityKey[]).flatMap((k) =>
      arr(abilities?.[k]).map((a) => ability(k, a)).filter((x): x is WikiAbility => x !== null)),
    patchLastChanged: str(o["patchLastChanged"]),
  };
}

/** Parses Meraki's combined champions file (an object keyed by champion). */
export function parseWikiChampions(json: unknown): Map<string, WikiChampion> {
  const out = new Map<string, WikiChampion>();
  for (const c of Object.values(obj(json) ?? {})) {
    const w = parseWikiChampion(c);
    if (w) out.set(w.key, w);
  }
  return out;
}

export interface WikiSource {
  /**
   * The data, or null while it isn't available (never fetched, or the last fetch failed).
   * Without a copy yet, waits for the download at most `waitMs` (it keeps going after that).
   */
  get(waitMs?: number): Promise<Map<string, WikiChampion> | null>;
}

/**
 * Daily cache of the Wiki data. Concurrent callers share one download; a failure is
 * retried after `retryMs`, and the last good copy is kept while a refresh fails.
 */
export function wikiSource(opts: { fetchImpl?: typeof fetch; now?: () => number; ttlMs?: number; retryMs?: number; url?: string } = {}): WikiSource {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const now = opts.now ?? Date.now;
  const ttl = opts.ttlMs ?? 24 * 3600_000;
  const retry = opts.retryMs ?? 10 * 60_000;
  let data: Map<string, WikiChampion> | null = null;
  let fetchedAt = -Infinity;
  let failedAt = -Infinity;
  let inflight: Promise<void> | null = null;

  const refresh = () => {
    inflight ??= fetchImpl(opts.url ?? MERAKI_URL, { signal: AbortSignal.timeout(30_000) })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((json) => {
        const parsed = parseWikiChampions(json);
        if (parsed.size < 50) throw new Error(`only ${parsed.size} champions`);
        data = parsed;
        fetchedAt = now();
      })
      .catch(() => { failedAt = now(); })
      .finally(() => { inflight = null; });
    return inflight;
  };

  return {
    async get(waitMs = Infinity) {
      const stale = now() - fetchedAt > ttl;
      const mayRetry = now() - failedAt > retry;
      if (stale && mayRetry) {
        const p = refresh();
        // With a copy in hand, refresh in the background; without one, wait (up to waitMs).
        if (!data) {
          await (Number.isFinite(waitMs) ? Promise.race([p, new Promise((r) => { const t = setTimeout(r, waitMs); (t as { unref?: () => void }).unref?.(); })]) : p);
        }
      }
      return data;
    },
  };
}
