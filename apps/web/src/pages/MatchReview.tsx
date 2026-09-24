import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { api, type KeyMoment, type MatchReview as Review, type MomentCategory } from "../api";
import { ErrorNotice, Loading, pct, SyntheticBadge } from "../components/ui";
import { useLoad } from "../session";

const MAP = 15000;
const toX = (x: number) => (x / MAP) * 1000;
const toY = (y: number) => 1000 - (y / MAP) * 1000;
const fmtTime = (t: number) => `${Math.floor(t / 60_000)}:${String(Math.floor((t % 60_000) / 1000)).padStart(2, "0")}`;

export const categoryMeta: Record<MomentCategory, { label: string; icon: string; cls: string }> = {
  error: { label: "Posible error", icon: "!", cls: "moment-error" },
  opportunity: { label: "Oportunidad", icon: "◆", cls: "moment-opportunity" },
  good: { label: "Buena decisión", icon: "✓", cls: "moment-good" },
  event: { label: "Evento", icon: "•", cls: "moment-event" },
};
const kindLabel = { fact: "Hecho", observation: "Observación", hypothesis: "Hipótesis" } as const;

/**
 * Match Review ("Replay", D-05): map playback reconstructed from the
 * match-v5 timeline, one frame per minute. The player is the focus. The
 * most educational moments come first, and the rest can be explored.
 */
export function MatchReview() {
  const { matchId = "" } = useParams();
  const { data, error, loading } = useLoad(() => api.review(matchId), [matchId]);

  if (loading && !data) return <Loading label="Reconstruyendo la partida…" />;
  if (error) return <ErrorNotice error={error} />;
  if (!data) return null;
  if (!data.available) {
    return (
      <div className="stack">
        <Link to={`/matches/${encodeURIComponent(matchId)}`}>← Detalle de la partida</Link>
        <div className="notice">{data.message}</div>
      </div>
    );
  }
  return <ReviewPlayer review={data.review} synthetic={data.dataSource === "synthetic"} />;
}

function ReviewPlayer({ review, synthetic }: { review: Review; synthetic: boolean }) {
  const last = review.frames.length - 1;
  const highlights = review.highlights.map((id) => review.moments.find((m) => m.id === id)!).filter(Boolean);
  const [minute, setMinute] = useState(() => (highlights[0] ? Math.min(last, Math.ceil(highlights[0].t / 60_000)) : 0));
  const [playing, setPlaying] = useState(false);
  const [selected, setSelected] = useState<KeyMoment | null>(highlights[0] ?? null);
  const [impact, setImpact] = useState(false);
  const me = review.participants.find((p) => p.isMe)!;
  const byId = useMemo(() => new Map(review.participants.map((p) => [p.id, p])), [review]);

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setMinute((m) => (m >= last ? (setPlaying(false), m) : m + 1)), 800);
    return () => clearInterval(t);
  }, [playing, last]);

  const frame = review.frames[minute]!;
  const eventsNow = review.events.filter((e) => e.t > (minute - 1) * 60_000 && e.t <= minute * 60_000);
  const jump = (m: KeyMoment) => { setSelected(m); setMinute(Math.min(last, Math.ceil(m.t / 60_000))); setPlaying(false); };
  const explorable = review.moments.filter((m) => m.category !== "event");
  const nextMoment = () => {
    const next = review.moments.find((m) => m.t > minute * 60_000 && m.category !== "event") ?? review.moments.find((m) => m.t > minute * 60_000);
    if (next) jump(next);
  };
  const myMoments = review.events.filter((e) => e.myInvolvement && e.position);

  return (
    <div className="stack" style={{ gap: 20 }}>
      <Link to={`/matches/${encodeURIComponent(review.matchId)}`}>← Detalle de la partida</Link>
      <header className="row">
        <div>
          <h1 className="page-title">Revisión de la partida</h1>
          <p className="page-sub" style={{ margin: 0 }}>Jugabas {me.championName}. Reconstruida a partir de la línea temporal, minuto a minuto.</p>
        </div>
        <span className="spacer" />
        {synthetic && <SyntheticBadge />}
      </header>

      {highlights.length > 0 && (
        <section aria-labelledby="h-key" className="stack">
          <h2 id="h-key" className="tile-label" style={{ margin: 0 }}>Los momentos que más enseñan</h2>
          <div className="grid grid-2">
            {highlights.map((m) => (
              <button key={m.id} className={`tile moment-card ${categoryMeta[m.category].cls}${selected?.id === m.id ? " selected" : ""}`} onClick={() => jump(m)}>
                <span className="badge"><span aria-hidden="true">{categoryMeta[m.category].icon}</span> {categoryMeta[m.category].label}</span>
                <strong>{m.title}</strong>
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="review-layout">
        <section className="card" aria-label="Mapa">
          <div className="row" style={{ marginBottom: 8 }}>
            <span className="tile-label">Minuto {frame.minute}</span>
            <span className="spacer" />
            <label className="toggle"><input type="checkbox" checked={impact} onChange={(e) => setImpact(e.target.checked)} /> Mapa de impacto</label>
          </div>
          <svg className="review-map" viewBox="0 0 1000 1000" role="img" aria-label={impact ? "Mapa de impacto: tus kills y muertes en la partida" : `Posiciones en el minuto ${frame.minute}`}>
            <defs>
              <radialGradient id="map-bg" cx="50%" cy="50%" r="70%">
                <stop offset="0" stopColor="#1d2636" />
                <stop offset="1" stopColor="#10141d" />
              </radialGradient>
            </defs>
            <rect x="0" y="0" width="1000" height="1000" rx="40" fill="url(#map-bg)" />
            <path d="M160 160 L840 840" stroke="#2a4d66" strokeWidth="46" strokeLinecap="round" opacity="0.5" />
            <g stroke="#3a4560" strokeWidth="26" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0.8">
              <path d="M95 880 L95 95 L880 95" />
              <path d="M120 905 L905 905 L905 120" />
              <path d="M140 860 L860 140" />
            </g>
            <circle cx="70" cy="930" r="60" fill="#1e2b40" stroke="#3a4560" />
            <circle cx="930" cy="70" r="60" fill="#2d2025" stroke="#3a4560" />

            {impact
              ? myMoments.map((e, i) => (
                  <g key={i} transform={`translate(${toX(e.position!.x)} ${toY(e.position!.y)})`}>
                    {e.myInvolvement === "victim" ? (
                      <path d="M-11 -11 L11 11 M11 -11 L-11 11" stroke="var(--team-enemy)" strokeWidth="5" strokeLinecap="round" />
                    ) : (
                      <circle r="9" fill="var(--team-ally)" stroke="var(--surface-1)" strokeWidth="2" />
                    )}
                    <title>{`${fmtTime(e.t)} · ${e.label}`}</title>
                  </g>
                ))
              : (
                <>
                  {eventsNow.filter((e) => e.position).map((e, i) => (
                    <path key={`ev-${i}`} transform={`translate(${toX(e.position!.x)} ${toY(e.position!.y)})`} d="M-10 -10 L10 10 M10 -10 L-10 10"
                      stroke={e.side === "ally" ? "var(--team-ally)" : "var(--team-enemy)"} strokeWidth="4" strokeLinecap="round" opacity="0.8">
                      <title>{`${fmtTime(e.t)} · ${e.label}`}</title>
                    </path>
                  ))}
                  {frame.positions.map((p) => {
                    const info = byId.get(p.id);
                    if (!info) return null;
                    const x = toX(p.x), y = toY(p.y);
                    const initials = info.championName.slice(0, 2);
                    const color = info.isAlly ? "var(--team-ally)" : "var(--team-enemy)";
                    return (
                      <g key={p.id} transform={`translate(${x} ${y})`} className="map-unit">
                        {info.isAlly ? (
                          <circle r={info.isMe ? 26 : 20} fill={color} stroke={info.isMe ? "#ffffff" : "var(--surface-1)"} strokeWidth={info.isMe ? 4 : 2} />
                        ) : (
                          <rect x={-18} y={-18} width={36} height={36} transform="rotate(45)" fill={color} stroke="var(--surface-1)" strokeWidth={2} />
                        )}
                        <text textAnchor="middle" dy="5" fontSize="15" fontWeight="700" fill="#0b0e14">{initials}</text>
                        {info.isMe && <text textAnchor="middle" y={-34} fontSize="18" fontWeight="700" fill="#ffffff">Tú</text>}
                        <title>{`${info.championName}${info.isMe ? " (tú)" : info.isAlly ? " (aliado)" : " (rival)"}`}</title>
                      </g>
                    );
                  })}
                </>
              )}
          </svg>
          <div className="row legend" aria-hidden="true">
            <span><svg width="14" height="14"><circle cx="7" cy="7" r="6" fill="var(--team-ally)" /></svg> Tu equipo</span>
            <span><svg width="14" height="14"><rect x="3" y="3" width="8" height="8" transform="rotate(45 7 7)" fill="var(--team-enemy)" /></svg> Rivales</span>
            <span>✕ {impact ? "Tus muertes" : "Muertes en este minuto"}</span>
          </div>

          <div className="stack" style={{ gap: 8, marginTop: 12 }}>
            <div className="timeline-markers" aria-label="Momentos en la línea temporal">
              {explorable.map((m) => (
                <button
                  key={m.id}
                  className={`timeline-marker ${categoryMeta[m.category].cls}${selected?.id === m.id ? " selected" : ""}`}
                  style={{ left: `${Math.min(98, (m.t / (review.durationSec * 1000)) * 100)}%` }}
                  onClick={() => jump(m)}
                  aria-label={`${categoryMeta[m.category].label}: ${m.title}`}
                  title={m.title}
                >
                  {categoryMeta[m.category].icon}
                </button>
              ))}
            </div>
            <label htmlFor="scrub" className="visually-hidden">Minuto</label>
            <input id="scrub" type="range" min={0} max={last} value={minute} onChange={(e) => { setMinute(Number(e.target.value)); setPlaying(false); }} style={{ width: "100%" }} />
            <div className="row" style={{ gap: 6 }}>
              <button className="btn" onClick={() => setMinute((m) => Math.max(0, m - 1))} aria-label="Retroceder un minuto">−1 min</button>
              <button className="btn btn-primary" onClick={() => { if (minute >= last) setMinute(0); setPlaying((p) => !p); }}>{playing ? "Pausa" : "Reproducir"}</button>
              <button className="btn" onClick={() => setMinute((m) => Math.min(last, m + 1))} aria-label="Avanzar un minuto">+1 min</button>
              <button className="btn" onClick={nextMoment}>Siguiente momento</button>
            </div>
            <p className="tile-note" style={{ margin: 0 }}>Los saltos son de un minuto porque es la resolución de los datos de posición; los eventos tienen su hora exacta.</p>
          </div>
        </section>

        <aside className="stack">
          <section className="card stack" aria-live="polite">
            <h2>Minuto {frame.minute}</h2>
            <p style={{ margin: 0 }}>
              Oro del equipo: <strong>{frame.teamGoldDiff > 0 ? "+" : ""}{Math.round(frame.teamGoldDiff).toLocaleString("es-ES")}</strong>
              <span className="tile-note"> {frame.teamGoldDiff >= 0 ? "a favor de tu equipo" : "a favor del rival"}</span>
            </p>
            {eventsNow.length ? (
              <ul className="stack" style={{ listStyle: "none", margin: 0, padding: 0, gap: 4 }}>
                {eventsNow.map((e, i) => (
                  <li key={i} className="tile-note"><span style={{ color: "var(--text-secondary)" }}>{fmtTime(e.t)}</span> · {e.label}{e.myInvolvement === "victim" ? " (tú)" : ""}</li>
                ))}
              </ul>
            ) : (
              <p className="tile-note" style={{ margin: 0 }}>Sin eventos registrados en este minuto.</p>
            )}
          </section>

          {selected && (
            <section className={`card stack moment-detail ${categoryMeta[selected.category].cls}`}>
              <div className="row" style={{ gap: 6 }}>
                <span className="badge"><span aria-hidden="true">{categoryMeta[selected.category].icon}</span> {categoryMeta[selected.category].label}</span>
                <span className="badge badge-kind">{kindLabel[selected.kind]}</span>
              </div>
              <strong>{selected.title}</strong>
              <p className="insight-detail">{selected.detail}</p>
              <details className="layer">
                <summary>Ver evidencia</summary>
                <dl>
                  {selected.evidence.map((e, i) => <div key={i} style={{ display: "contents" }}><dt>{e.label}</dt><dd>{e.value}</dd></div>)}
                  <dt>Cambio de oro del equipo (±2 min)</dt><dd>{selected.goldSwing > 0 ? "+" : ""}{Math.round(selected.goldSwing)}</dd>
                  <dt>Confianza</dt><dd>{pct(selected.confidence)}</dd>
                </dl>
              </details>
            </section>
          )}

          <details className="card layer">
            <summary>Qué no puede saber esta revisión</summary>
            <ul className="tile-note">{review.limits.map((l) => <li key={l}>{l}</li>)}</ul>
          </details>
        </aside>
      </div>
    </div>
  );
}
