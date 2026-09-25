import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api, type GameAssets } from "./api";

/**
 * Game imagery from Riot's Data Dragon CDN (champions, items, summoner spells, runes, splash art).
 * Riot allows these assets in non-commercial fan projects that carry its legal notice (shown on the
 * welcome page). Without a real bundle (synthetic data) or when an image fails, a lettered medallion
 * takes its place, so nothing on the page depends on the CDN being reachable.
 */
interface Catalog {
  cdn: string | null;
  version: string | null;
  champion: (ref: string | number) => { id: string; name: string } | null;
  itemName: (id: number) => string;
  spell: (key: number) => { id: string; name: string } | null;
  rune: (id: number) => { icon: string; name: string } | null;
}

const empty: Catalog = { cdn: null, version: null, champion: () => null, itemName: (id) => `#${id}`, spell: () => null, rune: () => null };
const AssetsContext = createContext<Catalog>(empty);

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export function AssetsProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<GameAssets | null>(null);
  useEffect(() => { api.assets().then(setData).catch(() => setData(null)); }, []);
  const catalog = useMemo<Catalog>(() => {
    if (!data) return empty;
    // Match data uses Data Dragon ids ("MonkeyKing") and players type display names ("Wukong"): accept both.
    const byName = new Map<string, { id: string; name: string }>();
    const byKey = new Map<number, { id: string; name: string }>();
    for (const c of data.champions) {
      byName.set(norm(c.id), c);
      byName.set(norm(c.name), c);
      byKey.set(c.key, c);
    }
    const items = new Map(data.items.map((i) => [i.id, i.name]));
    const spells = new Map(data.spells.map((sp) => [sp.key, sp]));
    const runes = new Map(data.runes.map((r) => [r.id, r]));
    return {
      cdn: data.cdn,
      version: data.version,
      champion: (ref) => (typeof ref === "number" ? byKey.get(ref) : byName.get(norm(ref))) ?? null,
      itemName: (id) => items.get(id) ?? `#${id}`,
      spell: (key) => spells.get(key) ?? null,
      rune: (id) => runes.get(id) ?? null,
    };
  }, [data]);
  return <AssetsContext.Provider value={catalog}>{children}</AssetsContext.Provider>;
}

export const useAssets = () => useContext(AssetsContext);

/** Splash art for a champion (versionless Data Dragon path), or null without a real bundle. */
export function useSplash(champion: string | number | null | undefined): string | null {
  const a = useAssets();
  const c = champion === null || champion === undefined ? null : a.champion(champion);
  return a.cdn && c ? `${a.cdn}/cdn/img/champion/splash/${c.id}_0.jpg` : null;
}

function initials(label: string) {
  const words = label.replace(/[^\p{L}\p{N} ]/gu, "").split(" ").filter(Boolean);
  return (words.length > 1 ? words[0]![0]! + words[1]![0]! : label.slice(0, 2)).toUpperCase();
}

function GameImage({ src, label, size, shape, className = "" }: { src: string | null; label: string; size: number; shape: "square" | "round"; className?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  const style = { width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.36)) };
  if (!src || failed) {
    return <span className={`gi gi-fallback gi-${shape} ${className}`} style={style} role="img" aria-label={label} title={label}>{initials(label)}</span>;
  }
  return <img className={`gi gi-${shape} ${className}`} style={style} src={src} alt={label} title={label} loading="lazy" decoding="async" onError={() => setFailed(true)} />;
}

export function ChampionIcon({ champion, size = 40, className }: { champion: string | number; size?: number; className?: string }) {
  const a = useAssets();
  const c = a.champion(champion);
  const label = c?.name ?? String(champion);
  const src = a.cdn && a.version && c ? `${a.cdn}/cdn/${a.version}/img/champion/${c.id}.png` : null;
  return <GameImage src={src} label={label} size={size} shape="round" className={className} />;
}

export function ItemIcon({ id, size = 28 }: { id: number; size?: number }) {
  const a = useAssets();
  const src = a.cdn && a.version ? `${a.cdn}/cdn/${a.version}/img/item/${id}.png` : null;
  return <GameImage src={src} label={a.itemName(id)} size={size} shape="square" />;
}

export function SpellIcon({ id, size = 22 }: { id: number; size?: number }) {
  const a = useAssets();
  const sp = a.spell(id);
  // Unknown spell (synthetic catalog or missing feed): show nothing rather than a meaningless medallion.
  if (!sp) return null;
  const src = a.cdn && a.version ? `${a.cdn}/cdn/${a.version}/img/spell/${sp.id}.png` : null;
  return <GameImage src={src} label={sp.name} size={size} shape="square" />;
}

export function RuneIcon({ id, size = 22 }: { id: number; size?: number }) {
  const a = useAssets();
  const r = a.rune(id);
  if (!r) return null;
  const src = a.cdn ? `${a.cdn}/cdn/img/${r.icon}` : null;
  return <GameImage src={src} label={r.name} size={size} shape="round" className="gi-rune" />;
}

/** Tall loading-screen art (versionless Data Dragon path), with a lettered fallback. */
export function LoadingArt({ champion, className = "" }: { champion: string | number; className?: string }) {
  const a = useAssets();
  const c = a.champion(champion);
  const label = c?.name ?? String(champion);
  const src = a.cdn && c ? `${a.cdn}/cdn/img/champion/loading/${c.id}_0.jpg` : null;
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (!src || failed) return <div className={`loading-art loading-art-fallback ${className}`} role="img" aria-label={label}><span>{initials(label)}</span></div>;
  return <img className={`loading-art ${className}`} src={src} alt={label} loading="lazy" decoding="async" onError={() => setFailed(true)} />;
}
