import { useEffect } from "react";
import { Link, useParams } from "react-router";
import { api } from "../api";
import { GoldDiffChart } from "../components/GoldDiffChart";
import { duration, ErrorNotice, ItemRow, Loading, Loadout, modeLabel, num, pct, ResultBadge, roleLabel, StatTile, SyntheticBadge } from "../components/ui";
import { useLoad, useSession } from "../session";
import { ChampionIcon } from "../assets";
import { SplashBackdrop } from "../components/World";

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
      <SplashBackdrop champion={a.championId} />
      <Link to="/matches">← Partidas</Link>
      <header className="row">
        <div className="hero">
          <ChampionIcon champion={a.championId} size={84} className="portrait" />
          <div>
          <h1 className="page-title">{a.championName}</h1>
          <p className="page-sub" style={{ margin: 0 }}>
            {modeLabel[a.mode]} · {roleLabel[a.role] ?? a.role} · {duration(a.durationSec)} · parche {a.patch}
          </p>
          </div>
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
      {sr && a.analyzable && a.hasTimeline && (
        <div>
          <Link className="btn btn-primary" to={`/matches/${encodeURIComponent(a.matchId)}/review`}>Revisar la partida en el mapa</Link>
        </div>
      )}

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

      <section className="card scoreboard" aria-label="Marcador">
        {data.teams.map((t, ti) => {
          const k = t.players.reduce((n, p) => n + p.kills, 0);
          const d = t.players.reduce((n, p) => n + p.deaths, 0);
          const as = t.players.reduce((n, p) => n + p.assists, 0);
          const gold = t.players.reduce((n, p) => n + p.gold, 0);
          return (
            <div className="sb-team" key={t.teamId}>
              <div className={`sb-head ${t.win ? "is-win" : "is-loss"}`}>
                <span className="sb-name">Equipo {ti + 1}</span>
                <span className="sb-result">{t.win ? "Victoria" : "Derrota"}</span>
                <span className="sb-total">{k} / {d} / {as}</span>
                <span className="sb-gold">{gold.toLocaleString("es-ES")} oro</span>
              </div>
              <div className="table-scroll">
                <table className="sb-table">
                  <colgroup><col className="c-champ" /><col className="c-load" /><col className="c-items" /><col className="c-kda" /><col className="c-cs" /><col className="c-gold" /></colgroup>
                  <thead className="visually-hidden">
                    <tr><th>Campeón</th><th>Hechizos y runas</th><th>Objetos</th><th>K/D/A</th><th>CS</th><th>Oro</th></tr>
                  </thead>
                  <tbody>
                    {t.players.map((p) => (
                      <tr key={`${p.championName}-${p.riotId}`} className={p.isMe ? "me" : undefined}>
                        <td>
                          <div className="champ-cell">
                            <ChampionIcon champion={p.championId} size={38} />
                            <span>
                              <span className="sb-player">{p.riotId?.split("#")[0] ?? p.championName}{p.isMe && <span className="visually-hidden"> (tú)</span>}</span>
                              <small>{p.championName}</small>
                            </span>
                          </div>
                        </td>
                        <td><Loadout spells={p.spells} runes={p.runes} size={18} /></td>
                        <td><ItemRow items={p.items.map((it) => it.id)} size={26} /></td>
                        <td className="sb-kda">{p.kills} / {p.deaths} / {p.assists}</td>
                        <td>{p.cs}</td>
                        <td>{p.gold.toLocaleString("es-ES")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
