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
    setCoachHint(data?.headline ? `In this game: ${data.headline.charAt(0).toLowerCase()}${data.headline.slice(1)}.` : null);
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
      <Link to="/matches">← Matches</Link>
      <header className="row">
        <div className="hero">
          <ChampionIcon champion={a.championId} size={84} className="portrait" />
          <div>
          <h1 className="page-title">{a.championName}</h1>
          <p className="page-sub" style={{ margin: 0 }}>
            {modeLabel[a.mode]} · {roleLabel[a.role] ?? a.role} · {duration(a.durationSec)} · patch {a.patch}
          </p>
          </div>
        </div>
        <span className="spacer" />
        <ResultBadge win={a.win} analyzable={a.analyzable} />
        {data.dataSource === "synthetic" && <SyntheticBadge />}
      </header>

      {!a.analyzable && (
        <div className="notice">
          This game is not analyzed (remake or unsupported mode). Only the basic data is shown.
        </div>
      )}
      {data.headline && <p className="insight insight-title">{data.headline}</p>}
      {sr && a.analyzable && a.hasTimeline && (
        <div>
          <Link className="btn btn-primary" to={`/matches/${encodeURIComponent(a.matchId)}/review`}>Coach Review and map</Link>
        </div>
      )}

      <section className="tiles" aria-label="Key numbers">
        <StatTile label="K / D / A" value={`${a.kills}/${a.deaths}/${a.assists}`} note={`KDA ${num(a.kda, 2)}`} />
        {a.killParticipation !== null && <StatTile label="Kill participation" value={pct(a.killParticipation)} />}
        {a.damageShare !== null && <StatTile label="Team damage share" value={pct(a.damageShare)} />}
        {sr && <StatTile label="CS per minute" value={num(a.csPerMin)} />}
        {sr && a.goldDiff15 !== null && (
          <StatTile label="Gold vs opponent at 15:00" value={`${a.goldDiff15 > 0 ? "+" : ""}${Math.round(a.goldDiff15)}`} note={a.laneOpponentChampion ? `vs ${a.laneOpponentChampion}` : undefined} />
        )}
      </section>

      {sr && (
        <section className="card">
          {data.goldCurve ? (
            <GoldDiffChart curve={data.goldCurve} events={data.myEvents} />
          ) : (
            <p className="page-sub" style={{ margin: 0 }}>We do not have this game's timeline, so its progression cannot be analyzed.</p>
          )}
        </section>
      )}

      <section className="card scoreboard" aria-label="Scoreboard">
        {data.teams.map((t, ti) => {
          const k = t.players.reduce((n, p) => n + p.kills, 0);
          const d = t.players.reduce((n, p) => n + p.deaths, 0);
          const as = t.players.reduce((n, p) => n + p.assists, 0);
          const gold = t.players.reduce((n, p) => n + p.gold, 0);
          return (
            <div className="sb-team" key={t.teamId}>
              <div className={`sb-head ${t.win ? "is-win" : "is-loss"}`}>
                <span className="sb-name">Team {ti + 1}</span>
                <span className="sb-result">{t.win ? "Victory" : "Defeat"}</span>
                <span className="sb-total">{k} / {d} / {as}</span>
                <span className="sb-gold">{gold.toLocaleString("en-US")} gold</span>
              </div>
              <div className="table-scroll">
                <table className="sb-table">
                  <colgroup><col className="c-champ" /><col className="c-load" /><col className="c-items" /><col className="c-kda" /><col className="c-cs" /><col className="c-gold" /></colgroup>
                  <thead className="visually-hidden">
                    <tr><th>Champion</th><th>Spells and runes</th><th>Items</th><th>K/D/A</th><th>CS</th><th>Gold</th></tr>
                  </thead>
                  <tbody>
                    {t.players.map((p) => (
                      <tr key={`${p.championName}-${p.riotId}`} className={p.isMe ? "me" : undefined}>
                        <td>
                          <div className="champ-cell">
                            <ChampionIcon champion={p.championId} size={38} />
                            <span>
                              <span className="sb-player">{p.riotId?.split("#")[0] ?? p.championName}{p.isMe && <span className="visually-hidden"> (you)</span>}</span>
                              <small>{p.championName}</small>
                            </span>
                          </div>
                        </td>
                        <td><Loadout spells={p.spells} runes={p.runes} size={18} /></td>
                        <td><ItemRow items={p.items.map((it) => it.id)} size={26} /></td>
                        <td className="sb-kda">{p.kills} / {p.deaths} / {p.assists}</td>
                        <td>{p.cs}</td>
                        <td>{p.gold.toLocaleString("en-US")}</td>
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
