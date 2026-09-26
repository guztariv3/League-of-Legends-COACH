import { useState } from "react";
import { Link } from "react-router";
import { Goals } from "../components/Goals";
import { api } from "../api";
import { ErrorNotice, InsightView, Loading, MatchItem, modeLabel, num, pct, roleLabel, StatTile, SyntheticBadge } from "../components/ui";
import { useLoad, useSession } from "../session";
import { LoadingArt } from "../assets";
import { SplashBackdrop } from "../components/World";

/**
 * The dashboard decides what matters: headline numbers for the main mode, at
 * most 3 insights, and the last 5 games. Everything else is on demand.
 */
export function Dashboard() {
  const { me } = useSession();
  const syncKey = me?.accounts.map((a) => `${a.id}:${a.sync.status}`).join(",");
  const [version, setVersion] = useState(0);
  const { data, error, loading } = useLoad(() => api.dashboard(), [syncKey, version]);
  const goals = useLoad(() => api.goals(), [syncKey, version]);
  const reload = () => setVersion((v) => v + 1);

  if (loading && !data) return <Loading />;
  if (error) return <ErrorNotice error={error} />;
  if (!data) return null;

  const main = data.summary.modes[0];
  const syncing = me?.accounts.find((a) => a.sync.status === "syncing");

  return (
    <div className="stack" style={{ gap: 24 }}>
      <SplashBackdrop champion={main?.champions[0]?.championName} />
      <header className="row">
        <div>
          <h1 className="page-title">Hi, {me?.user.displayName}</h1>
          <p className="page-sub" style={{ margin: 0 }}>
            {data.summary.analyzableGames
              ? `Based on ${data.summary.analyzableGames} analyzable games.`
              : "No analyzed games yet."}
          </p>
        </div>
        <span className="spacer" />
        {data.dataSource === "synthetic" && <SyntheticBadge />}
      </header>

      {syncing && (
        <div className="card stack" aria-live="polite">
          <h2>Analyzing your games</h2>
          <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={syncing.sync.progress?.total ?? 50} aria-valuenow={syncing.sync.progress?.done ?? 0}>
            <span style={{ width: `${syncing.sync.progress?.total ? (100 * syncing.sync.progress.done) / syncing.sync.progress.total : 5}%` }} />
          </div>
          <p className="tile-note" style={{ margin: 0 }}>Keep browsing; this page will update on its own.</p>
        </div>
      )}

      {main && (
        <section aria-label="Resumen" className="tiles">
          <StatTile
            label={`Win rate · ${modeLabel[main.mode]}`}
            value={pct(main.winRate)}
            note={`${main.wins} of ${main.games} · likely range ${pct(main.winRateInterval.low)}–${pct(main.winRateInterval.high)}`}
          />
          <StatTile label="Average KDA" value={num(main.avgKda, 2)} />
          {main.avgCsPerMin !== null && <StatTile label="CS per minute" value={num(main.avgCsPerMin)} note={main.mainRole ? `Main role: ${roleLabel[main.mainRole]}` : undefined} />}
        </section>
      )}

      {main && main.champions.length > 0 && (
        <section className="card" aria-labelledby="h-recent-champs">
          <h2 id="h-recent-champs">Most played champions</h2>
          <div className="recent-champs">
            {main.champions.slice(0, 3).map((c) => (
              <Link key={c.championName} to={`/champions/${encodeURIComponent(c.championName)}`} className="recent-champ">
                <LoadingArt champion={c.championName} />
                <span className="recent-champ-name">{c.championName}</span>
                <span className="recent-champ-pct">{pct(c.games / main.games)}</span>
                <span className="tile-note">{c.games} games · {pct(c.wins / c.games)} win rate</span>
              </Link>
            ))}
          </div>
          <p className="tile-note" style={{ margin: "8px 0 0" }}>% of your analyzed games in {modeLabel[main.mode]}.</p>
        </section>
      )}

      {goals.data && (goals.data.goals.length > 0 || goals.data.suggestions.length > 0) && (
        <section className="card stack" aria-labelledby="goals-h">
          <div className="row">
            <h2 id="goals-h" style={{ margin: 0 }}>Your goals</h2>
            <span className="spacer" />
            <Link to="/profile#goals">Manage</Link>
          </div>
          <Goals data={goals.data} onChange={reload} compact />
        </section>
      )}

      <div className="grid grid-2">
        <section className="card stack" aria-labelledby="insights-h">
          <h2 id="insights-h">What matters most now</h2>
          {data.insufficientData ? (
            <p className="page-sub" style={{ margin: 0 }}>
              I do not have enough reliable information to draw conclusions yet. With more analyzed games I will start spotting patterns.
            </p>
          ) : (
            data.insights.map((i) => (
              <InsightView key={i.id} insight={i}>
                <button
                  className="btn btn-ghost"
                  style={{ padding: "4px 0", fontSize: "0.8rem", color: "var(--text-muted)" }}
                  onClick={async () => { await api.feedback(i.id, i.title); reload(); }}
                >
                  Not useful to me
                </button>
              </InsightView>
            ))
          )}
        </section>

        <section className="card stack" aria-labelledby="recent-h">
          <div className="row">
            <h2 id="recent-h" style={{ margin: 0 }}>Recent games</h2>
            <span className="spacer" />
            <Link to="/matches">See all</Link>
          </div>
          {data.recent.length ? (
            <ul className="match-list">{data.recent.map((m) => <MatchItem key={m.matchId} m={m} compact />)}</ul>
          ) : (
            <p className="page-sub" style={{ margin: 0 }}>No games yet.</p>
          )}
        </section>
      </div>
    </div>
  );
}
