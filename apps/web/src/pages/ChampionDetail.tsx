import { useEffect } from "react";
import { Link, useParams } from "react-router";
import { api } from "../api";
import { ErrorNotice, Loading, modeLabel, pct, StatTile } from "../components/ui";
import { useLoad, useSession } from "../session";

const verdictText = { better: "▲ mejor que con el resto", worse: "▼ peor que con el resto", similar: "similar al resto" } as const;

/** Champion page with the personal layer: how this champion works *for you* (brief §57). */
export function ChampionDetail() {
  const { name = "" } = useParams();
  const { setCoachHint } = useSession();
  const { data, error, loading } = useLoad(() => api.champion(name), [name]);

  useEffect(() => {
    if (!data) return;
    const worse = data.personal.comparisons.filter((c) => c.verdict === "worse").map((c) => c.label.toLowerCase());
    setCoachHint(
      data.personal.games < 5
        ? null
        : worse.length
          ? `Con ${data.champion?.name ?? name}, tu ${worse.join(" y tu ")} ${worse.length > 1 ? "están" : "está"} por debajo de lo que haces con otros campeones.`
          : null,
    );
    return () => setCoachHint(null);
  }, [data, name, setCoachHint]);

  if (loading && !data) return <Loading />;
  if (error) return <ErrorNotice error={error} />;
  if (!data) return null;
  const { personal } = data;
  const champName = data.champion?.name ?? name;

  return (
    <div className="stack" style={{ gap: 20 }}>
      <Link to="/champions">← Campeones</Link>
      <header>
        <h1 className="page-title">{champName}</h1>
        <p className="page-sub" style={{ margin: 0 }}>
          {data.champion ? `${data.champion.title} · ${data.champion.tags.join(", ")}` : "Sin datos estáticos en la versión activa"}
          {data.knowledgeVersion && ` · datos de la versión ${data.knowledgeVersion}`}
        </p>
      </header>

      {personal.games === 0 ? (
        <div className="notice">Todavía no has jugado con {champName}, así que no hay capa personal.</div>
      ) : (
        <>
          <section className="tiles" aria-label="Tu historial">
            <StatTile
              label="Victorias"
              value={`${personal.wins}/${personal.games}`}
              note={personal.games >= 5 ? `rango probable ${pct(personal.interval.low)}–${pct(personal.interval.high)}` : "muestra pequeña"}
            />
          </section>

          {personal.comparisons.length > 0 && (
            <section className="card stack" aria-labelledby="h-cmp">
              <h2 id="h-cmp">Con {champName} frente a tus otros campeones (Grieta)</h2>
              <div className="table-scroll">
                <table>
                  <thead><tr><th>Métrica</th><th>{champName}</th><th>Resto</th><th>Diferencia</th></tr></thead>
                  <tbody>
                    {personal.comparisons.map((c) => (
                      <tr key={c.label}>
                        <td>{c.label}</td>
                        <td>{c.value}</td>
                        <td>{c.others ?? "—"}</td>
                        <td className={c.verdict === "better" ? "trend-improving" : c.verdict === "worse" ? "trend-declining" : undefined}>{verdictText[c.verdict]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="tile-note" style={{ margin: 0 }}>Solo se marca “mejor” o “peor” cuando la diferencia supera la variación normal entre partidas.</p>
            </section>
          )}

          {personal.opponents.length > 0 && (
            <section className="card stack" aria-labelledby="h-opp">
              <h2 id="h-opp">Rivales de línea a los que te has enfrentado</h2>
              <ul className="stack" style={{ listStyle: "none", margin: 0, padding: 0, gap: 6 }}>
                {personal.opponents.map((o) => (
                  <li key={o.opponent}>
                    <Link className="tile row" style={{ textDecoration: "none", color: "inherit" }} to={`/matches?champion=${encodeURIComponent(champName)}&opponent=${encodeURIComponent(o.opponent)}`}>
                      <span>contra <strong>{o.opponent}</strong></span>
                      <span className="spacer" />
                      <span className="tile-note">{o.wins}/{o.games} victorias{o.games < 5 ? " · muestra pequeña" : ""}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="card stack" aria-labelledby="h-recent">
            <h2 id="h-recent">Partidas recientes</h2>
            <ul className="stack" style={{ listStyle: "none", margin: 0, padding: 0, gap: 6 }}>
              {personal.recent.map((m) => (
                <li key={m.matchId}>
                  <Link className="tile row" style={{ textDecoration: "none", color: "inherit" }} to={`/matches/${encodeURIComponent(m.matchId)}`}>
                    <span className={`badge ${m.win ? "badge-win" : "badge-loss"}`}>{m.win ? "▲ Victoria" : "▼ Derrota"}</span>
                    <span>{m.kills}/{m.deaths}/{m.assists}</span>
                    <span className="spacer" />
                    <span className="tile-note">{modeLabel[m.mode]}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
