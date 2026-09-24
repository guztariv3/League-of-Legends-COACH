import { useState } from "react";
import { api, type GoalsResponse } from "../api";
import { pct } from "./ui";

const statusLabel = {
  collecting: "Esperando partidas",
  in_progress: "En progreso",
  consolidated: "Consolidado",
} as const;

/**
 * Goals block. `compact` (dashboard) shows active goals plus at most one
 * suggestion; the full version (profile) also lets the player create goals.
 */
export function Goals({ data, onChange, compact = false }: { data: GoalsResponse; onChange: () => void; compact?: boolean }) {
  const [metric, setMetric] = useState("");
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try { await fn(); onChange(); } catch (e) { setError(e instanceof Error ? e.message : "No se pudo completar."); }
  };
  const suggestion = data.suggestions[0];
  const full = data.goals.length >= data.max;

  return (
    <div className="stack">
      {data.goals.length === 0 && !suggestion && compact === false && (
        <p className="page-sub" style={{ margin: 0 }}>Sin objetivos activos. Son opcionales; puedes crear hasta {data.max}.</p>
      )}
      {data.goals.map((g) => (
        <article key={g.id} className="tile stack" style={{ gap: 6 }} aria-label={`Objetivo: ${g.title}`}>
          <div className="row">
            <strong>{g.title}</strong>
            <span className="spacer" />
            <span className={`badge ${g.progress.status === "consolidated" ? "badge-win" : "badge-kind"}`}>
              {g.progress.status === "consolidated" ? "✓ " : ""}{statusLabel[g.progress.status]}
            </span>
          </div>
          {g.progress.games > 0 && (
            <div className="progress" role="img" aria-label={`Cumplido en el ${pct(g.progress.rate)} de las partidas`}>
              <span style={{ width: `${Math.round(g.progress.rate * 100)}%` }} />
            </div>
          )}
          <p className="tile-note" style={{ margin: 0 }}>{g.progress.summary}</p>
          {!compact && (
            <div className="row" style={{ gap: 4 }}>
              {g.progress.status === "consolidated" && (
                <button className="btn btn-ghost" onClick={() => run(() => api.closeGoal(g.id, "achieved"))}>Marcar como conseguido</button>
              )}
              <button className="btn btn-ghost" onClick={() => run(() => api.closeGoal(g.id, "archived"))}>Archivar</button>
            </div>
          )}
        </article>
      ))}

      {suggestion && !full && (
        <article className="notice stack" style={{ gap: 8 }}>
          <div><span className="badge badge-kind">Sugerencia del Coach</span></div>
          <strong style={{ color: "var(--text-primary)" }}>{suggestion.title}</strong>
          <span className="tile-note">{suggestion.reason}</span>
          <div className="row" style={{ gap: 4 }}>
            <button className="btn btn-primary" onClick={() => run(() => api.createGoal(suggestion.metric, "coach", suggestion.target))}>Aceptar objetivo</button>
            <button className="btn btn-ghost" onClick={() => run(() => api.rejectGoal(suggestion.metric))}>No, gracias</button>
          </div>
        </article>
      )}

      {!compact && !full && (
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            if (metric) run(() => api.createGoal(metric, "user")).then(() => setMetric(""));
          }}
        >
          <div className="field">
            <label htmlFor="goal-metric">Crear un objetivo propio</label>
            <select id="goal-metric" value={metric} onChange={(e) => setMetric(e.target.value)}>
              <option value="">Elige qué quieres mejorar…</option>
              {data.metrics.filter((m) => !data.goals.some((g) => g.metric === m.id)).map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>
          <button className="btn" style={{ alignSelf: "flex-end" }} disabled={!metric}>Crear</button>
        </form>
      )}
      {!compact && <p className="tile-note" style={{ margin: 0 }}>El objetivo se fija con tu propio nivel en tus mejores partidas. Solo cuentan las partidas jugadas después de crearlo.</p>}
      {error && <p role="alert" style={{ color: "var(--bad)", margin: 0 }}>{error}</p>}
    </div>
  );
}
