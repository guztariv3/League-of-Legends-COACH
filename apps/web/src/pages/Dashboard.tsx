import { useState } from "react";
import { Link } from "react-router";
import { Goals } from "../components/Goals";
import { api } from "../api";
import { ErrorNotice, InsightView, Loading, MatchItem, modeLabel, num, pct, roleLabel, StatTile, SyntheticBadge } from "../components/ui";
import { useLoad, useSession } from "../session";
import { ChampionIcon } from "../assets";
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
          <h1 className="page-title">Hola, {me?.user.displayName}</h1>
          <p className="page-sub" style={{ margin: 0 }}>
            {data.summary.analyzableGames
              ? `Basado en ${data.summary.analyzableGames} partidas analizables.`
              : "Todavía no hay partidas analizadas."}
          </p>
        </div>
        <span className="spacer" />
        {data.dataSource === "synthetic" && <SyntheticBadge />}
      </header>

      {syncing && (
        <div className="card stack" aria-live="polite">
          <h2>Analizando tus partidas</h2>
          <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={syncing.sync.progress?.total ?? 50} aria-valuenow={syncing.sync.progress?.done ?? 0}>
            <span style={{ width: `${syncing.sync.progress?.total ? (100 * syncing.sync.progress.done) / syncing.sync.progress.total : 5}%` }} />
          </div>
          <p className="tile-note" style={{ margin: 0 }}>Puedes seguir navegando; el panel se actualizará solo.</p>
        </div>
      )}

      {main && (
        <section aria-label="Resumen" className="tiles">
          <StatTile
            label={`Victorias · ${modeLabel[main.mode]}`}
            value={pct(main.winRate)}
            note={`${main.wins} de ${main.games} · rango probable ${pct(main.winRateInterval.low)}–${pct(main.winRateInterval.high)}`}
          />
          <StatTile label="KDA medio" value={num(main.avgKda, 2)} />
          {main.avgCsPerMin !== null && <StatTile label="CS por minuto" value={num(main.avgCsPerMin)} note={main.mainRole ? `Rol principal: ${roleLabel[main.mainRole]}` : undefined} />}
          {main.champions[0] && (
            <div className="tile tile-media">
              <ChampionIcon champion={main.champions[0].championName} size={52} className="portrait" />
              <div>
                <div className="tile-value">{main.champions[0].championName}</div>
                <div className="tile-label">Campeón más jugado</div>
                <div className="tile-note">{main.champions[0].games} partidas</div>
              </div>
            </div>
          )}
        </section>
      )}

      {goals.data && (goals.data.goals.length > 0 || goals.data.suggestions.length > 0) && (
        <section className="card stack" aria-labelledby="goals-h">
          <div className="row">
            <h2 id="goals-h" style={{ margin: 0 }}>Tus objetivos</h2>
            <span className="spacer" />
            <Link to="/profile#goals">Gestionar</Link>
          </div>
          <Goals data={goals.data} onChange={reload} compact />
        </section>
      )}

      <div className="grid grid-2">
        <section className="card stack" aria-labelledby="insights-h">
          <h2 id="insights-h">Lo que más importa ahora</h2>
          {data.insufficientData ? (
            <p className="page-sub" style={{ margin: 0 }}>
              Todavía no tengo suficiente información fiable para sacar conclusiones. Con más partidas analizadas empezaré a detectar patrones.
            </p>
          ) : (
            data.insights.map((i) => (
              <InsightView key={i.id} insight={i}>
                <button
                  className="btn btn-ghost"
                  style={{ padding: "4px 0", fontSize: "0.8rem", color: "var(--text-muted)" }}
                  onClick={async () => { await api.feedback(i.id, i.title); reload(); }}
                >
                  No me resulta útil
                </button>
              </InsightView>
            ))
          )}
        </section>

        <section className="card stack" aria-labelledby="recent-h">
          <div className="row">
            <h2 id="recent-h" style={{ margin: 0 }}>Últimas partidas</h2>
            <span className="spacer" />
            <Link to="/matches">Ver todas</Link>
          </div>
          {data.recent.length ? (
            <ul className="match-list">{data.recent.map((m) => <MatchItem key={m.matchId} m={m} />)}</ul>
          ) : (
            <p className="page-sub" style={{ margin: 0 }}>Aún no hay partidas.</p>
          )}
        </section>
      </div>
    </div>
  );
}
