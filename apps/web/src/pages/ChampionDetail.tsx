import { useEffect } from "react";
import { ChampionIcon } from "../assets";
import { SplashBackdrop } from "../components/World";
import { Link, useParams } from "react-router";
import { api } from "../api";
import { ErrorNotice, Loading, modeLabel, pct, StatTile } from "../components/ui";
import { useLoad, useSession } from "../session";

const verdictText = { better: "▲ better than the rest", worse: "▼ worse than the rest", similar: "similar to the rest" } as const;

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
          ? `On ${data.champion?.name ?? name}, your ${worse.join(" and your ")} ${worse.length > 1 ? "are" : "is"} below what you do on other champions.`
          : null,
    );
    return () => setCoachHint(null);
  }, [data, name, setCoachHint]);

  if (loading && !data) return <Loading />;
  if (error) return <ErrorNotice error={error} />;
  if (!data) return null;
  const { personal } = data;
  const champName = data.champion?.name ?? name;
  // Filters use Riot's champion id (e.g. "MonkeyKing"), not the display name ("Wukong").
  const champId = data.champion?.id ?? name;

  return (
    <div className="stack" style={{ gap: 20 }}>
      <SplashBackdrop champion={champId} />
      <Link to="/champions">← Champions</Link>
      <header className="hero">
        <ChampionIcon champion={champId} size={84} className="portrait" />
        <div>
        <h1 className="page-title">{champName}</h1>
        <p className="page-sub" style={{ margin: 0 }}>
          {data.champion ? `${data.champion.title} · ${data.champion.tags.join(", ")}` : "No static data in the active version"}
          {data.knowledgeVersion && ` · data from version ${data.knowledgeVersion}`}
        </p>
        </div>
      </header>

      {personal.games === 0 ? (
        <div className="notice">You have not played {champName} yet, so there is no personal layer.</div>
      ) : (
        <>
          <section className="tiles" aria-label="Your history">
            <StatTile
              label="Wins"
              value={`${personal.wins}/${personal.games}`}
              note={personal.games >= 5 ? `likely range ${pct(personal.interval.low)}–${pct(personal.interval.high)}` : "small sample"}
            />
          </section>

          {personal.comparisons.length > 0 && (
            <section className="card stack" aria-labelledby="h-cmp">
              <h2 id="h-cmp">{champName} vs your other champions (Rift)</h2>
              <div className="table-scroll">
                <table>
                  <thead><tr><th>Metric</th><th>{champName}</th><th>Others</th><th>Difference</th></tr></thead>
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
              <p className="tile-note" style={{ margin: 0 }}>“Better” or “worse” is only shown when the difference exceeds normal game-to-game variation.</p>
            </section>
          )}

          {personal.opponents.length > 0 && (
            <section className="card stack" aria-labelledby="h-opp">
              <h2 id="h-opp">Lane opponents you have faced</h2>
              <ul className="stack" style={{ listStyle: "none", margin: 0, padding: 0, gap: 6 }}>
                {personal.opponents.map((o) => (
                  <li key={o.opponent}>
                    <Link className="tile row" style={{ textDecoration: "none", color: "inherit" }} to={`/matches?champion=${encodeURIComponent(champId)}&opponent=${encodeURIComponent(o.opponent)}`}>
                      <span>vs <strong>{o.opponent}</strong></span>
                      <span className="spacer" />
                      <span className="tile-note">{o.wins}/{o.games} wins{o.games < 5 ? " · small sample" : ""}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="card stack" aria-labelledby="h-recent">
            <h2 id="h-recent">Recent games</h2>
            <ul className="stack" style={{ listStyle: "none", margin: 0, padding: 0, gap: 6 }}>
              {personal.recent.map((m) => (
                <li key={m.matchId}>
                  <Link className="tile row" style={{ textDecoration: "none", color: "inherit" }} to={`/matches/${encodeURIComponent(m.matchId)}`}>
                    <span className={`badge ${m.win ? "badge-win" : "badge-loss"}`}>{m.win ? "▲ Victory" : "▼ Defeat"}</span>
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
