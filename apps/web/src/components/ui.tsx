import { Link } from "react-router";
import type { Insight, MatchRow } from "../api";
import { ChampionIcon } from "../assets";

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

export function MatchItem({ m }: { m: MatchRow }) {
  return (
    <li>
      <Link className="match" to={`/matches/${encodeURIComponent(m.matchId)}`}>
        <span className={`match-bar ${m.analyzable ? (m.win ? "win" : "loss") : ""}`} aria-hidden="true" />
        <ChampionIcon champion={m.championName} size={44} />
        <span className="match-main">
          <span className="match-title">
            {m.championName} <span className="visually-hidden">{m.analyzable ? (m.win ? "victoria" : "derrota") : "sin análisis"}</span>
          </span>
          <span className="match-meta">
            {m.queue} · {roleLabel[m.role] ?? m.role} · {duration(m.durationSec)} · {ago(m.startedAt)}
          </span>
          {m.headline && <span className="match-headline">{m.headline}</span>}
        </span>
        <span className="match-stats">
          <span className="kda">{m.kills}/{m.deaths}/{m.assists}</span>
          <br />
          <span className="secondary match-meta">{m.csPerMin !== null ? `${num(m.csPerMin)} CS/min` : `KDA ${num(m.kda, 2)}`}</span>
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
