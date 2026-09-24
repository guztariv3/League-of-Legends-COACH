import { useEffect } from "react";
import { Link, useParams } from "react-router";
import { api } from "../api";
import { GoldDiffChart } from "../components/GoldDiffChart";
import { duration, ErrorNotice, Loading, modeLabel, num, pct, ResultBadge, roleLabel, StatTile, SyntheticBadge } from "../components/ui";
import { useLoad, useSession } from "../session";

/** Conclusion first, then key numbers, then the curve, then both teams (progressive layers). */
export function MatchDetail() {
  const { matchId = "" } = useParams();
  const { setCoachHint } = useSession();
  const { data, error, loading } = useLoad(() => api.match(matchId), [matchId]);

  useEffect(() => {
    setCoachHint(data?.headline ? `En esta partida: ${data.headline.charAt(0).toLowerCase()}${data.headline.slice(1)}.` : null);
    return () => setCoachHint(null);
  }, [data, setCoachHint]);

  if (loading && !data) return <Loading />;
  if (error) return <ErrorNotice error={error} />;
  if (!data) return null;
  const a = data.analysis;
  const sr = a.mode === "summoners_rift";

  return (
    <div className="stack" style={{ gap: 20 }}>
      <Link to="/matches">← Partidas</Link>
      <header className="row">
        <div>
          <h1 className="page-title">{a.championName}</h1>
          <p className="page-sub" style={{ margin: 0 }}>
            {modeLabel[a.mode]} · {roleLabel[a.role] ?? a.role} · {duration(a.durationSec)} · parche {a.patch}
          </p>
        </div>
        <span className="spacer" />
        <ResultBadge win={a.win} analyzable={a.analyzable} />
        {data.dataSource === "synthetic" && <SyntheticBadge />}
      </header>

      {!a.analyzable && (
        <div className="notice">
          Esta partida no se analiza (remake o modo no soportado). Mostramos solo los datos básicos.
        </div>
      )}
      {data.headline && <p className="insight insight-title">{data.headline}</p>}

      <section className="tiles" aria-label="Números clave">
        <StatTile label="K / D / A" value={`${a.kills}/${a.deaths}/${a.assists}`} note={`KDA ${num(a.kda, 2)}`} />
        {a.killParticipation !== null && <StatTile label="Participación en kills" value={pct(a.killParticipation)} />}
        {a.damageShare !== null && <StatTile label="Daño del equipo" value={pct(a.damageShare)} />}
        {sr && <StatTile label="CS por minuto" value={num(a.csPerMin)} />}
        {sr && a.goldDiff15 !== null && (
          <StatTile label="Oro vs rival al 15" value={`${a.goldDiff15 > 0 ? "+" : ""}${Math.round(a.goldDiff15)}`} note={a.laneOpponentChampion ? `vs ${a.laneOpponentChampion}` : undefined} />
        )}
      </section>

      {sr && (
        <section className="card">
          {data.goldCurve ? (
            <GoldDiffChart curve={data.goldCurve} events={data.myEvents} />
          ) : (
            <p className="page-sub" style={{ margin: 0 }}>No tenemos la línea temporal de esta partida, así que no podemos analizar su evolución.</p>
          )}
        </section>
      )}

      <section className="grid grid-2">
        {data.teams.map((t) => (
          <div className="card" key={t.teamId}>
            <h2>{t.win ? "Equipo ganador" : "Equipo perdedor"}</h2>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr><th>Campeón</th><th>K/D/A</th><th>CS</th><th>Daño</th></tr>
                </thead>
                <tbody>
                  {t.players.map((p) => (
                    <tr key={p.championName} className={p.isMe ? "me" : undefined}>
                      <td>{p.championName}{p.isMe && <span className="visually-hidden"> (tú)</span>}</td>
                      <td>{p.kills}/{p.deaths}/{p.assists}</td>
                      <td>{p.cs}</td>
                      <td>{p.damage.toLocaleString("es-ES")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
