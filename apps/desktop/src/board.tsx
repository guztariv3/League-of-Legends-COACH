import { useEffect, useRef, useState } from "react";
import { parseCatalog, suggestItems, type Catalog, type Suggestion } from "@coach/itemization";
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

/** The official item and champion catalog (Spanish) for the current patch, from Data Dragon. */
export function useCatalog(art: Art): Catalog | null {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  useEffect(() => {
    if (!art.cdn || !art.version) return;
    let stopped = false;
    const base = `${art.cdn}/cdn/${art.version}/data/es_ES`;
    Promise.all([fetch(`${base}/item.json`), fetch(`${base}/champion.json`)])
      .then(([i, c]) => (i.ok && c.ok ? Promise.all([i.json(), c.json()]) : Promise.reject(new Error("catalog"))))
      .then(([items, champs]) => { if (!stopped) setCatalog(parseCatalog(items, champs)); })
      .catch(() => { /* offline: the Objetos tab explains it */ });
    return () => { stopped = true; };
  }, [art.cdn, art.version]);
  return catalog;
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

// Reasons go from the generic ("gives ability power") to the specific (the enemy team); a
// one-line alternative shows the most specific one.
function Reasons({ s }: { s: Suggestion }) {
  return <ul className="reasons">{s.reasons.map((r) => <li key={r}>{r}</li>)}</ul>;
}

/** Recipe with the pieces you already have ticked, and what your gold buys right now. */
function HowToBuy({ s, gold, art }: { s: Suggestion; gold: number | null; art: Art }) {
  const { steps, remaining, affordableNow } = s.path;
  return (
    <div className="howto">
      {steps.length > 0 && (
        <div className="recipe" aria-label="Componentes">
          {steps.map((c, i) => (
            <span key={`${c.id}-${i}`} className={`piece${c.owned ? " piece-owned" : ""}`} title={`${c.name} · ${c.gold} de oro${c.owned ? " · ya lo tienes" : ""}`}>
              <ItemArt id={c.id} name={c.name} size={24} art={art} owned={c.owned} />
              {c.owned && <span className="tick" aria-hidden="true">✓</span>}
            </span>
          ))}
        </div>
      )}
      <p className="quiet">
        {remaining === 0 ? "Ya tienes todas las piezas." : `Te faltan ${remaining} de oro en total.`}
        {gold !== null && affordableNow && (affordableNow.id === s.item.id
          ? ` Con tus ${Math.floor(gold)} de oro ya alcanza para completarlo.`
          : ` Con tus ${Math.floor(gold)} de oro alcanza para: ${affordableNow.name} (${affordableNow.gold}).`)}
        {gold !== null && !affordableNow && remaining > 0 && ` Con tus ${Math.floor(gold)} de oro aún no alcanza para ninguna pieza.`}
      </p>
    </div>
  );
}

function ItemsTab({ state, catalog, build, art, connected, demo }: {
  state: GameState; catalog: Catalog | null; build: PersonalBuild | null | "loading"; art: Art; connected: boolean; demo: boolean;
}) {
  const me = state.me!;
  const previous = useRef<number | null>(null);
  if (demo) return <p className="quiet">En la demostración los objetos son inventados, así que no hay sugerencias. En una partida real aquí verás el siguiente objeto sugerido y cómo comprarlo.</p>;
  if (!catalog) return <p className="quiet">Cargando el catálogo de objetos del parche… (necesita conexión a Internet)</p>;
  const usual = build && build !== "loading" ? build.items.map((i) => i.id) : [];
  const s = suggestItems({ catalog, map: state.map, gold: state.gold, me, enemies: state.enemies, usual, previous: previous.current });
  previous.current = s.next?.item.id ?? null;
  const price = (x: Suggestion) => `${x.item.gold} de oro`;
  return (
    <div className="suggest">
      <p className="quiet enemy-line">
        Daño rival: {Math.round(s.enemy.magicShare * 100)}% mágico · {100 - Math.round(s.enemy.magicShare * 100)}% físico
        {s.enemy.healers.length > 0 && ` · se curan: ${s.enemy.healers.join(", ")}`}
      </p>
      {s.next ? (
        <section className="next" aria-label="Siguiente objeto sugerido">
          <div className="next-head">
            <ItemArt id={s.next.item.id} name={s.next.item.name} size={44} art={art} />
            <div>
              <div className="label">Siguiente objeto sugerido</div>
              <div className="next-name">{s.next.item.name}</div>
              <div className="quiet">{price(s.next)}</div>
            </div>
          </div>
          <Reasons s={s.next} />
          <HowToBuy s={s.next} gold={state.gold} art={art} />
        </section>
      ) : (
        <p className="quiet">{s.note}</p>
      )}
      {s.boots && (
        <section className="alt" aria-label="Botas sugeridas">
          <ItemArt id={s.boots.item.id} name={s.boots.item.name} size={32} art={art} />
          <div><div className="label">Botas</div><div className="alt-name">{s.boots.item.name}</div><div className="quiet">{s.boots.reasons[0]}</div></div>
        </section>
      )}
      {s.alternatives.map((a) => (
        <section key={a.item.id} className="alt" aria-label={`Alternativa: ${a.item.name}`}>
          <ItemArt id={a.item.id} name={a.item.name} size={32} art={art} />
          <div><div className="label">Alternativa</div><div className="alt-name">{a.item.name}</div><div className="quiet">{a.reasons.at(-1)}</div></div>
        </section>
      ))}
      <p className="quiet small">Sugerencias calculadas con los objetos y el marcador de esta partida y los datos oficiales de cada objeto. Tú decides.</p>
      {connected && build && build !== "loading" && build.items.length > 0 && (
        <details className="history">
          <summary>Tu historial con {me.champion} ({build.games} partidas)</summary>
          <ul>{build.items.map((i) => <li key={i.id}><ItemArt id={i.id} name={i.name} size={20} art={art} /> {i.name} · {i.games}/{build.games} partidas · {Math.round((i.wins / i.games) * 100)}% V</li>)}</ul>
        </details>
      )}
    </div>
  );
}

type Tab = "items" | "rivals" | "team";

/** The scoreboard the game already shows (Tab), in the side window, plus the player's own build. */
export function Board({ state, names, art, catalog, build, connected, demo = false }: {
  state: GameState; names: Map<number, string>; art: Art; catalog: Catalog | null; build: PersonalBuild | null | "loading"; connected: boolean; demo?: boolean;
}) {
  const [tab, setTab] = useState<Tab>("items");
  if (!state.me) return null;
  const tabs: [Tab, string][] = [["items", "Objetos"], ["rivals", "Rivales"], ["team", "Tu equipo"]];
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
        {tab === "items" && <ItemsTab state={state} catalog={catalog} build={build} art={art} connected={connected} demo={demo} />}
      </div>
    </section>
  );
}
