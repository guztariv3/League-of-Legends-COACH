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
  IRON: "Iron", BRONZE: "Bronze", SILVER: "Silver", GOLD: "Gold", PLATINUM: "Platinum", EMERALD: "Emerald",
  DIAMOND: "Diamond", MASTER: "Master", GRANDMASTER: "Grandmaster", CHALLENGER: "Challenger",
};

const errorText: Record<SiteError, string> = {
  invalid_url: "That address is not valid. Copy it from the website (Settings → Desktop app).",
  insecure_url: "The address must start with https://.",
  offline: "Could not reach the website. Check your connection.",
  unauthorized: "Wrong or expired code. Generate a new one on the website.",
  rate_limited: "Too many attempts. Wait a minute.",
  server_error: "The website failed. Try again in a moment.",
  unexpected_response: "The website answered something unexpected. Is the address right?",
  unavailable: "Only available in the desktop app.",
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
  if (e.rankStatus === "unavailable" || !e.rank) return e.rankStatus === "unranked" ? "Unranked" : "Rank unavailable";
  const r = e.rank;
  const tier = r.tier ? TIERS[r.tier] ?? r.tier : "Ranked";
  const division = r.division && !["MASTER", "GRANDMASTER", "CHALLENGER"].includes(r.tier ?? "") ? ` ${r.division}` : "";
  return `${tier}${division}${r.lp !== null ? ` · ${r.lp} LP` : ""}${r.queue === "flex" ? " (flex)" : ""}`;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

function winRate(e: ScoutedRival) {
  const r = e.rank && e.rank.wins + e.rank.losses > 0 ? e.rank : null;
  if (r) return { value: pct(r.wins / (r.wins + r.losses)), note: `${r.wins}W ${r.losses}L ranked` };
  if (e.games) return { value: pct(e.wins / e.games), note: `last ${e.games}` };
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
        <div className="rival-id" title={e.riotId ?? undefined}>{e.riotId ?? "Riot ID hidden"}</div>
        <div className={`rival-rank rank-${(e.rank?.tier ?? e.rankStatus).toLowerCase()}`}>{rankText(e)}</div>
      </div>
      <div className="rival-wr">
        {wr ? <><strong>{wr.value}</strong><small>{wr.note}</small></> : <small>no data</small>}
      </div>
      {e.topChampions.length > 0 && (
        <div className="rival-top" aria-label={`${e.topSource === "mastery" ? "Top champions" : "Most played"}: ${e.topChampions.map((c) => c.name).join(", ")}`}>
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
        setProblem("The app was disconnected from the website. Connect it again with a new code.");
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
        <h2 id="rivals-h">Your opponents</h2>
        {scout.mode && <span className="quiet">{scout.mode}</span>}
        <span className="spacer" />
        <button className="btn" aria-expanded={show} onClick={() => setOpen(!show)}>{show ? "Hide" : "Show"}</button>
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
        <p className="quiet">Connected to <strong>{new URL(link.origin).host}</strong>. You will see your opponents when the game loads.</p>
        <button className="btn" onClick={() => { if (confirm("Disconnect the app from the website?")) onDisconnect(); }}>Disconnect</button>
        <p className="quiet">You can also disconnect it from the website (Settings → Desktop app).</p>
      </div>
    );
  }

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    setBusy(true); setError(null);
    const r = await claimDevice(url, code, "Desktop app");
    setBusy(false);
    if (r.ok) { onConnect({ origin: r.data.origin, token: r.data.token }); setCode(""); }
    else setError(errorText[r.error]);
  };

  return (
    <form className="connect" onSubmit={submit}>
      <p className="quiet">To see your opponents, generate a code on the website (Settings → Desktop app) and enter it here.</p>
      <label>Website address<input type="url" required value={url} onChange={(e) => setUrl(e.target.value)} autoComplete="url" /></label>
      <label>Code<input required value={code} onChange={(e) => setCode(e.target.value)} placeholder="ABCD-EFGH" autoComplete="off" spellCheck={false} maxLength={20} /></label>
      <button className="btn btn-primary" disabled={busy || !inTauri}>{busy ? "Connecting…" : "Connect"}</button>
      {(error ?? problem) && <p className="quiet" role="alert">{error ?? problem}</p>}
    </form>
  );
}
