import { useState } from "react";
import { api, type Challenge } from "../api";
import { ErrorNotice, Loading } from "./ui";
import { useLoad } from "../session";

const NEED = 3, OF = 5;

/** Five slots for "3 of your next 5": ✓ met, ✕ missed, empty = still to play. */
function Slots({ c }: { c: Challenge }) {
  const n = c.kind === "next5" ? OF : Math.max(NEED, c.progress.results.length);
  return (
    <span className="challenge-slots" aria-label={`${c.progress.met} met out of ${c.progress.played} played`}>
      {Array.from({ length: n }, (_, i) => {
        const r = c.progress.results[i];
        return <span key={i} className={`slot${r === true ? " slot-met" : r === false ? " slot-miss" : ""}`} aria-hidden="true">{r === true ? "✓" : r === false ? "✕" : ""}</span>;
      })}
    </span>
  );
}

const endsIn = (t: number | null) => {
  if (t === null) return null;
  const days = Math.ceil((t - Date.now()) / 86_400_000);
  return days <= 0 ? "ends today" : `${days} ${days === 1 ? "day" : "days"} left`;
};

/**
 * Challenges (F6): short tries on one habit, with the target taken from your recent games.
 * Only games played after accepting count. Up to three at a time; you can drop one anytime.
 */
export function Challenges() {
  const [version, setVersion] = useState(0);
  const { data, error, loading } = useLoad(() => api.challenges(), [version]);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<unknown>(null);
  const reload = () => setVersion((v) => v + 1);
  const run = async (key: string, f: () => Promise<unknown>) => {
    setBusy(key); setFailed(null);
    try { await f(); reload(); } catch (e) { setFailed(e); } finally { setBusy(null); }
  };

  if (loading && !data) return <Loading />;
  if (error) return <ErrorNotice error={error} />;
  if (!data) return null;

  return (
    <div className="stack" style={{ gap: 16 }}>
      {failed ? <ErrorNotice error={failed} /> : null}
      <section className="card stack" aria-labelledby="h-ch-active">
        <div className="row">
          <h2 id="h-ch-active" style={{ margin: 0 }}>Your challenges</h2>
          <span className="spacer" />
          <span className="tile-note">{data.active.length} of {data.max} · {data.completedCount} completed so far</span>
        </div>
        {data.active.length === 0 ? (
          <p className="tile-note" style={{ margin: 0 }}>No challenge running. Pick one below: it only counts games you play from now on.</p>
        ) : data.active.map((c) => (
          <div key={c.id} className="challenge">
            <div className="challenge-head">
              <strong>{c.title}</strong>
              <Slots c={c} />
            </div>
            <div className="row" style={{ gap: 8 }}>
              <span className="tile-note">{c.progress.summary}{c.kind === "week" && endsIn(c.progress.endsAt) ? ` · ${endsIn(c.progress.endsAt)}` : ""}</span>
              <span className="spacer" />
              <button type="button" className="btn btn-ghost" disabled={busy === c.id} onClick={() => run(c.id, () => api.dropChallenge(c.id))} aria-label={`Drop challenge: ${c.title}`}>Drop</button>
            </div>
          </div>
        ))}
      </section>

      {data.suggestions.length > 0 && (
        <section className="card stack" aria-labelledby="h-ch-suggest">
          <h2 id="h-ch-suggest" style={{ margin: 0 }}>Try one</h2>
          <p className="tile-note" style={{ margin: 0 }}>Targets a little better than your recent level, from your last games. Nothing is compared with other players.</p>
          {data.suggestions.map((s) => (
            <div key={s.metric} className="challenge">
              <strong>{s.title}</strong>
              <span className="tile-note">You reached it in {s.recent.met} of your last {s.recent.n} games.</span>
              <div className="row" style={{ gap: 8 }}>
                <button type="button" className="btn btn-primary" disabled={busy !== null} onClick={() => run(`${s.metric}:next5`, () => api.acceptChallenge(s.metric, "next5"))}>3 of my next 5 games</button>
                <button type="button" className="btn" disabled={busy !== null} onClick={() => run(`${s.metric}:week`, () => api.acceptChallenge(s.metric, "week"))}>3 games this week</button>
              </div>
            </div>
          ))}
        </section>
      )}

      {data.recent.length > 0 && (
        <section className="card stack" aria-labelledby="h-ch-recent">
          <h2 id="h-ch-recent" style={{ margin: 0 }}>Recent</h2>
          {data.recent.map((c) => (
            <div key={c.id} className="challenge challenge-done">
              <div className="challenge-head">
                <span><span className={c.status === "completed" ? "trend-improving" : "tile-note"}>{c.status === "completed" ? "✓ Completed" : "Not this time"}</span> · {c.title}</span>
                <Slots c={c} />
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
