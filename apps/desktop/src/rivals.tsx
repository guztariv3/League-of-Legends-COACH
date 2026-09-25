import { useEffect, useRef, useState, type FormEvent } from "react";
import { claimDevice, fetchScout, inTauri, type SiteError } from "./bridge";

/** Link to the player's KOI Master site. Only the device token is kept, never the site password. */
interface SiteLink { origin: string; token: string }
const LINK_KEY = "koi.link";

interface Rank { queue: "solo" | "flex"; tier: string | null; division: string | null; lp: number | null; wins: number; losses: number }
export interface ScoutedRival {
  riotId: string | null;
  championId: string;
  championName: string;
  games: number;
  wins: number;
  rankStatus: "ranked" | "unranked" | "unavailable";
  rank: Rank | null;
  topChampions: { id: string; name: string; points: number | null; games: number | null }[];
  topSource: "mastery" | "recent" | null;
  headline: string;
}
interface Scout {
  inGame: boolean;
  mode?: string;
  enemies?: ScoutedRival[];
  message?: string;
  assets: { cdn: string | null; version: string | null };
}

const POLL_MS = 30_000;

const TIERS: Record<string, string> = {
  IRON: "Hierro", BRONZE: "Bronce", SILVER: "Plata", GOLD: "Oro", PLATINUM: "Platino", EMERALD: "Esmeralda",
  DIAMOND: "Diamante", MASTER: "Maestro", GRANDMASTER: "Gran Maestro", CHALLENGER: "Retador",
};

const errorText: Record<SiteError, string> = {
  invalid_url: "Esa dirección no es válida. Cópiala de la web (Ajustes → App de escritorio).",
  insecure_url: "La dirección debe empezar por https://.",
  offline: "No se pudo contactar con la web. Revisa tu conexión.",
  unauthorized: "Código incorrecto o caducado. Genera uno nuevo en la web.",
  rate_limited: "Demasiados intentos. Espera un minuto.",
  server_error: "La web ha fallado. Inténtalo de nuevo en un momento.",
  unexpected_response: "La web respondió algo inesperado. ¿Es la dirección correcta?",
  unavailable: "Solo disponible en la app de escritorio.",
};

function readLink(): SiteLink | null {
  try {
    const raw = localStorage.getItem(LINK_KEY);
    const v = raw ? (JSON.parse(raw) as SiteLink) : null;
    return v && typeof v.origin === "string" && typeof v.token === "string" ? v : null;
  } catch {
    return null;
  }
}
function writeLink(link: SiteLink | null) {
  try {
    if (link) localStorage.setItem(LINK_KEY, JSON.stringify(link));
    else localStorage.removeItem(LINK_KEY);
  } catch { /* the link then lasts only for this session */ }
}

function rankText(e: ScoutedRival) {
  if (e.rankStatus === "unavailable" || !e.rank) return e.rankStatus === "unranked" ? "Sin clasificar" : "Rango no disponible";
  const r = e.rank;
  const tier = r.tier ? TIERS[r.tier] ?? r.tier : "Clasificado";
  const division = r.division && !["MASTER", "GRANDMASTER", "CHALLENGER"].includes(r.tier ?? "") ? ` ${r.division}` : "";
  return `${tier}${division}${r.lp !== null ? ` · ${r.lp} LP` : ""}${r.queue === "flex" ? " (flex)" : ""}`;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

function winRate(e: ScoutedRival) {
  const r = e.rank && e.rank.wins + e.rank.losses > 0 ? e.rank : null;
  if (r) return { value: pct(r.wins / (r.wins + r.losses)), note: `${r.wins}V ${r.losses}D clasif.` };
  if (e.games) return { value: pct(e.wins / e.games), note: `últimas ${e.games}` };
  return null;
}

/** Champion square from Data Dragon, or its initial when there is no art (synthetic data, offline). */
function Champ({ id, name, size, assets }: { id: string; name: string; size: number; assets: Scout["assets"] }) {
  const [failed, setFailed] = useState(false);
  const src = assets.cdn && assets.version ? `${assets.cdn}/cdn/${assets.version}/img/champion/${id}.png` : null;
  if (!src || failed) {
    return <span className="champ champ-letter" style={{ width: size, height: size }} aria-label={name} role="img">{name.slice(0, 1)}</span>;
  }
  return <img className="champ" src={src} alt={name} width={size} height={size} onError={() => setFailed(true)} />;
}

function RivalRow({ e, assets }: { e: ScoutedRival; assets: Scout["assets"] }) {
  const wr = winRate(e);
  return (
    <li className="rival">
      <Champ id={e.championId} name={e.championName} size={40} assets={assets} />
      <div className="rival-main">
        <div className="rival-id" title={e.riotId ?? undefined}>{e.riotId ?? "Riot ID oculto"}</div>
        <div className={`rival-rank rank-${(e.rank?.tier ?? e.rankStatus).toLowerCase()}`}>{rankText(e)}</div>
      </div>
      <div className="rival-wr">
        {wr ? <><strong>{wr.value}</strong><small>{wr.note}</small></> : <small>sin datos</small>}
      </div>
      {e.topChampions.length > 0 && (
        <div className="rival-top" aria-label={`${e.topSource === "mastery" ? "Mejores campeones" : "Más jugados"}: ${e.topChampions.map((c) => c.name).join(", ")}`}>
          {e.topChampions.map((c) => <Champ key={c.id} id={c.id} name={c.name} size={22} assets={assets} />)}
        </div>
      )}
    </li>
  );
}

/**
 * Rivals from the loading screen, read from the player's KOI Master site with the device token.
 * Polls slowly while waiting for a game, stops once the rivals are known, and starts over after the game.
 */
export function useRivals(liveMode: "waiting" | "live" | "demo") {
  const [link, setLink] = useState<SiteLink | null>(readLink);
  const [scout, setScout] = useState<Scout | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const wasLive = useRef(false);

  // A finished game: forget its rivals so the next loading screen is scouted fresh.
  useEffect(() => {
    if (liveMode === "live") wasLive.current = true;
    else if (wasLive.current) { wasLive.current = false; setScout(null); }
  }, [liveMode]);

  const known = Boolean(scout?.inGame && scout.enemies?.length);
  useEffect(() => {
    if (!link || liveMode === "demo" || known) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      const r = await fetchScout<Scout>(link.origin, link.token);
      if (stopped) return;
      if (r.ok) { setScout(r.data); setProblem(null); }
      else if (r.error === "unauthorized") {
        writeLink(null); setLink(null); setScout(null);
        setProblem("La app se ha desconectado de la web. Vuelve a conectarla con un código nuevo.");
        return;
      } else setProblem(errorText[r.error]);
      timer = setTimeout(poll, POLL_MS);
    };
    void poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, [link, liveMode === "demo", known]);

  const connect = (l: SiteLink) => { writeLink(l); setLink(l); setProblem(null); };
  const disconnect = () => { writeLink(null); setLink(null); setScout(null); setProblem(null); };
  return { link, scout, problem, connect, disconnect };
}

export function RivalsPanel({ scout, collapsed }: { scout: Scout | null; collapsed: boolean }) {
  // Open on the loading screen, folded away once the game starts, unless the player chose.
  const [choice, setChoice] = useState<boolean | null>(null);
  if (!scout?.inGame || !scout.enemies?.length) return null;
  const show = choice ?? !collapsed;
  const setOpen = setChoice;
  return (
    <section className="rivals" aria-labelledby="rivals-h">
      <div className="bar">
        <h2 id="rivals-h">Tus rivales</h2>
        {scout.mode && <span className="quiet">{scout.mode}</span>}
        <span className="spacer" />
        <button className="btn" aria-expanded={show} onClick={() => setOpen(!show)}>{show ? "Ocultar" : "Ver"}</button>
      </div>
      {show && <ul>{scout.enemies.map((e, i) => <RivalRow key={`${e.championId}-${i}`} e={e} assets={scout.assets} />)}</ul>}
    </section>
  );
}

export function ConnectForm({ link, problem, onConnect, onDisconnect }: {
  link: SiteLink | null; problem: string | null; onConnect: (l: SiteLink) => void; onDisconnect: () => void;
}) {
  const [url, setUrl] = useState("https://");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (link) {
    return (
      <div className="connect">
        <p className="quiet">Conectada a <strong>{new URL(link.origin).host}</strong>. Verás a tus rivales al cargar la partida.</p>
        <button className="btn" onClick={() => { if (confirm("¿Desconectar la app de la web?")) onDisconnect(); }}>Desconectar</button>
        <p className="quiet">También puedes desconectarla desde la web (Ajustes → App de escritorio).</p>
      </div>
    );
  }

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    setBusy(true); setError(null);
    const r = await claimDevice(url, code, "App de escritorio");
    setBusy(false);
    if (r.ok) { onConnect({ origin: r.data.origin, token: r.data.token }); setCode(""); }
    else setError(errorText[r.error]);
  };

  return (
    <form className="connect" onSubmit={submit}>
      <p className="quiet">Para ver a tus rivales, genera un código en la web (Ajustes → App de escritorio) y escríbelo aquí.</p>
      <label>Dirección de la web<input type="url" required value={url} onChange={(e) => setUrl(e.target.value)} autoComplete="url" /></label>
      <label>Código<input required value={code} onChange={(e) => setCode(e.target.value)} placeholder="ABCD-EFGH" autoComplete="off" spellCheck={false} maxLength={20} /></label>
      <button className="btn btn-primary" disabled={busy || !inTauri}>{busy ? "Conectando…" : "Conectar"}</button>
      {(error ?? problem) && <p className="quiet" role="alert">{error ?? problem}</p>}
    </form>
  );
}
