import { Link } from "react-router";
import type { Insight, MatchRow } from "../api";
import { ChampionIcon, ItemIcon, RuneIcon, SpellIcon } from "../assets";

export const pct = (x: number) => `${Math.round(x * 100)}%`;
export const num = (x: number | null | undefined, d = 1) => (x === null || x === undefined || Number.isNaN(x) ? "—" : x.toFixed(d));
export const duration = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
export const ago = (ts: number) => {
  const h = Math.round((Date.now() - ts) / 3_600_000);
  if (h < 1) return "hace un momento";
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "ayer" : `hace ${d} días`;
};
export const roleLabel: Record<string, string> = {
  TOP: "Top", JUNGLE: "Jungla", MIDDLE: "Mid", BOTTOM: "ADC", UTILITY: "Support", NONE: "—",
};
export const modeLabel: Record<string, string> = { summoners_rift: "Grieta", aram: "ARAM", unsupported: "Otro modo" };
const kindLabel: Record<Insight["kind"], string> = { fact: "Hecho", observation: "Observación", hypothesis: "Hipótesis" };

export function StatTile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="tile">
      <div className="tile-value">{value}</div>
      <div className="tile-label">{label}</div>
      {note && <div className="tile-note">{note}</div>}
    </div>
  );
}

export function SyntheticBadge() {
  return (
    <span className="badge badge-synthetic" title="Datos generados para desarrollo; no son partidas reales">
      ◆ Datos sintéticos
    </span>
  );
}

export function ResultBadge({ win, analyzable }: { win: boolean; analyzable: boolean }) {
  if (!analyzable) return <span className="badge">Sin análisis</span>;
  return win ? <span className="badge badge-win">▲ Victoria</span> : <span className="badge badge-loss">▼ Derrota</span>;
}

/** Progressive disclosure: conclusion → context → evidence (brief §17). */
export function InsightView({ insight, children }: { insight: Insight; children?: React.ReactNode }) {
  return (
    <article className="insight">
      <div className="row" style={{ gap: 8, marginBottom: 4 }}>
        <span className="badge badge-kind">{kindLabel[insight.kind]}</span>
      </div>
      <p className="insight-title">{insight.title}</p>
      <p className="insight-detail">{insight.detail}</p>
      <details className="layer">
        <summary>Ver evidencia</summary>
        <dl>
          {insight.evidence.map((e) => (
            <div key={e.label} style={{ display: "contents" }}>
              <dt>{e.label}</dt>
              <dd>{e.value}</dd>
            </div>
          ))}
          <dt>Muestra</dt>
          <dd>{insight.sampleSize} partidas</dd>
          <dt>Confianza</dt>
          <dd>{pct(insight.confidence)}</dd>
        </dl>
      </details>
      {insight.review && <p className="tile-note" style={{ margin: "6px 0 0" }}>Para revisar: {insight.review}</p>}
      {children}
    </article>
  );
}

const mapLabel: Record<string, string> = { summoners_rift: "Grieta del Invocador", aram: "Abismo de los Lamentos" };
const shortDate = (ts: number) => new Date(ts).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });

/** Seven item slots like the client scoreboard: filled first, empty frames after. */
export function ItemRow({ items, size = 30 }: { items: number[]; size?: number }) {
  const slots = [...items.slice(0, 7), ...Array(Math.max(0, 7 - items.length)).fill(null)] as (number | null)[];
  return (
    <span className="item-row" aria-label="Objetos">
      {slots.map((id, i) => (id ? <ItemIcon key={`${id}-${i}`} id={id} size={size} /> : <span key={`e${i}`} className="item-slot" style={{ width: size, height: size }} aria-hidden="true" />))}
    </span>
  );
}

/** Summoner spells and runes in a 2×2 block. */
export function Loadout({ spells, runes, size = 20 }: { spells: number[]; runes: { keystone: number | null; secondary: number | null }; size?: number }) {
  return (
    <span className="loadout-grid">
      {spells.slice(0, 2).map((id) => <SpellIcon key={id} id={id} size={size} />)}
      {runes.keystone !== null && <RuneIcon id={runes.keystone} size={size} />}
      {runes.secondary !== null && <RuneIcon id={runes.secondary} size={size} />}
    </span>
  );
}

/** One game as in the client's match history: portrait, result, loadout, build, score and when. */
export function MatchItem({ m, compact = false }: { m: MatchRow; compact?: boolean }) {
  const result = !m.analyzable ? "Sin análisis" : m.win ? "Victoria" : "Derrota";
  return (
    <li>
      <Link className={`match mh${compact ? " mh-compact" : ""}`} to={`/matches/${encodeURIComponent(m.matchId)}`}>
        <span className={`match-bar ${m.analyzable ? (m.win ? "win" : "loss") : ""}`} aria-hidden="true" />
        <span className="mh-portrait">
          <ChampionIcon champion={m.championId ?? m.championName} size={compact ? 46 : 60} className="portrait" />
          {m.level > 0 && <span className="mh-level">{m.level}</span>}
        </span>
        <span className="match-main">
          <span className={`mh-result ${m.analyzable ? (m.win ? "is-win" : "is-loss") : ""}`}>{result}</span>
          <span className="match-title">{m.championName} <span className="match-meta">· {m.queue}</span></span>
          {!compact && <Loadout spells={m.spells} runes={m.runes} />}
          {m.headline && <span className="match-headline">{m.headline}</span>}
        </span>
        {!compact && (
          <span className="mh-build">
            <ItemRow items={m.items} />
            <span className="mh-score">
              <span className="kda">{m.kills} / {m.deaths} / {m.assists}</span>
              <span className="match-meta">{m.cs} CS · {m.gold.toLocaleString("es-ES")} oro</span>
            </span>
          </span>
        )}
        <span className="match-stats">
          {compact && <><span className="kda">{m.kills}/{m.deaths}/{m.assists}</span><br /></>}
          <span className="match-meta">{mapLabel[m.mode] ?? modeLabel[m.mode] ?? m.mode}</span>
          <br />
          <span className="match-meta">{duration(m.durationSec)} · {compact ? ago(m.startedAt) : shortDate(m.startedAt)}</span>
          {!compact && <><br /><span className="secondary match-meta">{m.csPerMin !== null ? `${num(m.csPerMin)} CS/min` : `KDA ${num(m.kda, 2)}`}</span></>}
        </span>
      </Link>
    </li>
  );
}

export function Loading({ label = "Cargando…" }: { label?: string }) {
  return <p className="page-sub" role="status">{label}</p>;
}

export function ErrorNotice({ error }: { error: unknown }) {
  const msg = error instanceof Error ? error.message : "No se pudo cargar esta información.";
  return <div className="notice" role="alert">{msg}</div>;
}
