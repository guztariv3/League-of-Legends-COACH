import { useState } from "react";
import { api, type GoalsResponse } from "../api";
import { pct } from "./ui";

const statusLabel = {
  collecting: "Waiting for games",
  in_progress: "In progress",
  consolidated: "Consolidated",
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
    try { await fn(); onChange(); } catch (e) { setError(e instanceof Error ? e.message : "Could not complete that."); }
  };
  const suggestion = data.suggestions[0];
  const full = data.goals.length >= data.max;

  return (
    <div className="stack">
      {data.goals.length === 0 && !suggestion && compact === false && (
        <p className="page-sub" style={{ margin: 0 }}>No active goals. They are optional; you can create up to {data.max}.</p>
      )}
      {data.goals.map((g) => (
        <article key={g.id} className="tile stack" style={{ gap: 6 }} aria-label={`Goal: ${g.title}`}>
          <div className="row">
            <strong>{g.title}</strong>
            <span className="spacer" />
            <span className={`badge ${g.progress.status === "consolidated" ? "badge-win" : "badge-kind"}`}>
              {g.progress.status === "consolidated" ? "✓ " : ""}{statusLabel[g.progress.status]}
            </span>
          </div>
          {g.progress.games > 0 && (
            <div className="progress" role="img" aria-label={`Met in ${pct(g.progress.rate)} of games`}>
              <span style={{ width: `${Math.round(g.progress.rate * 100)}%` }} />
            </div>
          )}
          <p className="tile-note" style={{ margin: 0 }}>{g.progress.summary}</p>
          {!compact && (
            <div className="row" style={{ gap: 4 }}>
              {g.progress.status === "consolidated" && (
                <button className="btn btn-ghost" onClick={() => run(() => api.closeGoal(g.id, "achieved"))}>Mark as achieved</button>
              )}
              <button className="btn btn-ghost" onClick={() => run(() => api.closeGoal(g.id, "archived"))}>Archive</button>
            </div>
          )}
        </article>
      ))}

      {suggestion && !full && (
        <article className="notice stack" style={{ gap: 8 }}>
          <div><span className="badge badge-kind">Coach suggestion</span></div>
          <strong style={{ color: "var(--text-primary)" }}>{suggestion.title}</strong>
          <span className="tile-note">{suggestion.reason}</span>
          <div className="row" style={{ gap: 4 }}>
            <button className="btn btn-primary" onClick={() => run(() => api.createGoal(suggestion.metric, "coach", suggestion.target))}>Accept goal</button>
            <button className="btn btn-ghost" onClick={() => run(() => api.rejectGoal(suggestion.metric))}>No, thanks</button>
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
            <label htmlFor="goal-metric">Create your own goal</label>
            <select id="goal-metric" value={metric} onChange={(e) => setMetric(e.target.value)}>
              <option value="">Choose what to improve…</option>
              {data.metrics.filter((m) => !data.goals.some((g) => g.metric === m.id)).map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>
          <button className="btn" style={{ alignSelf: "flex-end" }} disabled={!metric}>Create</button>
        </form>
      )}
      {!compact && <p className="tile-note" style={{ margin: 0 }}>The target is set from your own level in your best games. Only games played after creating it count.</p>}
      {error && <p role="alert" style={{ color: "var(--bad)", margin: 0 }}>{error}</p>}
    </div>
  );
}
