import { useEffect, useState } from "react";
import type { GameState, PlayerState } from "@coach/live";

/** Where game art comes from: Data Dragon (Riot's public CDN), or nothing (letters). */
export interface Art { cdn: string | null; version: string | null }

const DDRAGON = "https://ddragon.leagueoflegends.com";
const VERSION_KEY = "koi.ddragon";

/**
 * Data Dragon version for images. Uses the one the web reports when connected; otherwise
 * asks Data Dragon once a day. Without network the board shows letters instead of art.
 */
export function useArt(fromSite: Art | null): Art {
  const [version, setVersion] = useState<string | null>(() => {
    try { return (JSON.parse(localStorage.getItem(VERSION_KEY) ?? "null") as { v: string } | null)?.v ?? null; } catch { return null; }
  });
  useEffect(() => {
    if (fromSite?.version) return;
    let cached: { v: string; at: number } | null = null;
    try { cached = JSON.parse(localStorage.getItem(VERSION_KEY) ?? "null"); } catch { /* ignore */ }
    if (cached && Date.now() - cached.at < 24 * 3600_000) return;
    fetch(`${DDRAGON}/api/versions.json`)
      .then((r) => (r.ok ? (r.json() as Promise<string[]>) : Promise.reject()))
      .then((list) => {
        const v = list[0];
        if (!v) return;
        setVersion(v);
        try { localStorage.setItem(VERSION_KEY, JSON.stringify({ v, at: Date.now() })); } catch { /* ignore */ }
      })
      .catch(() => { /* offline: letters */ });
  }, [fromSite?.version]);
  if (fromSite?.version) return fromSite;
  return { cdn: version ? DDRAGON : null, version };
}

export function ChampArt({ id, name, size, art }: { id: string; name: string; size: number; art: Art }) {
  const [failed, setFailed] = useState(false);
  const src = art.cdn && art.version ? `${art.cdn}/cdn/${art.version}/img/champion/${id}.png` : null;
  if (!src || failed) return <span className="champ champ-letter" style={{ width: size, height: size }} role="img" aria-label={name}>{name.slice(0, 1)}</span>;
  return <img className="champ" src={src} alt={name} width={size} height={size} onError={() => setFailed(true)} />;
}

export function ItemArt({ id, name, size, art, owned }: { id: number; name: string; size: number; art: Art; owned?: boolean }) {
  const [failed, setFailed] = useState(false);
  const src = art.cdn && art.version ? `${art.cdn}/cdn/${art.version}/img/item/${id}.png` : null;
  const cls = `item${owned ? " item-owned" : ""}`;
  if (!src || failed) return <span className={`${cls} item-letter`} style={{ width: size, height: size }} role="img" aria-label={name} title={name}>{name.slice(0, 1)}</span>;
  return <img className={cls} src={src} alt={name} title={name} width={size} height={size} onError={() => setFailed(true)} />;
}

function Items({ ids, names, art }: { ids: number[]; names: Map<number, string>; art: Art }) {
  const slots = [...ids.slice(0, 7), ...Array<number | null>(Math.max(0, 7 - ids.length)).fill(null)];
  return (
    <span className="items">
      {slots.map((id, i) => id === null
        ? <span key={`e${i}`} className="item item-empty" aria-hidden="true" />
        : <ItemArt key={`${id}-${i}`} id={id} name={names.get(id) ?? `Objeto ${id}`} size={20} art={art} />)}
    </span>
  );
}

function PlayerRow({ p, names, art, me }: { p: PlayerState; names: Map<number, string>; art: Art; me?: boolean }) {
  return (
    <li className={`player${me ? " player-me" : ""}${p.isDead ? " player-dead" : ""}`}>
      <span className="player-art">
        <ChampArt id={p.championId} name={p.champion} size={32} art={art} />
        <span className="player-level" aria-label={`Nivel ${p.level}`}>{p.level}</span>
      </span>
      <span className="player-main">
        <span className="player-name" title={p.name}>{me ? "Tú" : p.name.split("#")[0] || p.champion}</span>
        <span className="player-kda">{p.champion} · {p.kills}/{p.deaths}/{p.assists} · {p.cs} CS</span>
      </span>
      <Items ids={p.items} names={names} art={art} />
    </li>
  );
}

export interface BuildItem { id: number; name: string; games: number; wins: number }
export interface PersonalBuild { champion: string; games: number; wins: number; items: BuildItem[]; note: string | null }

function BuildTab({ build, me, art, connected }: { build: PersonalBuild | null | "loading"; me: PlayerState; art: Art; connected: boolean }) {
  if (!connected) return <p className="quiet">Conecta la app con la web para ver qué objetos sueles hacer con {me.champion} y cómo te fue.</p>;
  if (build === "loading") return <p className="quiet">Buscando tus partidas con {me.champion}…</p>;
  if (!build) return <p className="quiet">No se pudo leer tu historial ahora mismo.</p>;
  if (!build.items.length) return <p className="quiet">{build.note}</p>;
  const owned = new Set(me.items);
  return (
    <div className="build">
      <p className="quiet">
        Objetos grandes con los que terminaste tus {build.games} partidas registradas con {me.champion} ({Math.round((build.wins / build.games) * 100)}% de victorias). Es tu historial, no una orden.
      </p>
      <ul>
        {build.items.map((i) => (
          <li key={i.id} className={owned.has(i.id) ? "have" : undefined}>
            <ItemArt id={i.id} name={i.name} size={28} art={art} owned={owned.has(i.id)} />
            <span className="build-name">{i.name}{owned.has(i.id) && <small> · ya lo tienes</small>}</span>
            <span className="build-stat">{i.games}/{build.games} partidas · {Math.round((i.wins / i.games) * 100)}% V</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

type Tab = "rivals" | "team" | "build";

/** The scoreboard the game already shows (Tab), in the side window, plus the player's own build. */
export function Board({ state, names, art, build, connected }: {
  state: GameState; names: Map<number, string>; art: Art; build: PersonalBuild | null | "loading"; connected: boolean;
}) {
  const [tab, setTab] = useState<Tab>("rivals");
  if (!state.me) return null;
  const tabs: [Tab, string][] = [["rivals", "Rivales"], ["team", "Tu equipo"], ["build", "Tu build"]];
  return (
    <section className="board" aria-label="Partida">
      <div className="tabs" role="tablist">
        {tabs.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className="tab" onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>
      <div role="tabpanel">
        {tab === "rivals" && <ul className="players">{state.enemies.map((p) => <PlayerRow key={p.name || p.champion} p={p} names={names} art={art} />)}</ul>}
        {tab === "team" && (
          <ul className="players">
            <PlayerRow p={state.me} names={names} art={art} me />
            {state.allies.map((p) => <PlayerRow key={p.name || p.champion} p={p} names={names} art={art} />)}
          </ul>
        )}
        {tab === "build" && <BuildTab build={build} me={state.me} art={art} connected={connected} />}
      </div>
    </section>
  );
}
