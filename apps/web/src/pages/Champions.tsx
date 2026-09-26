import { useState } from "react";
import { ChampionIcon } from "../assets";
import { Link } from "react-router";
import { api } from "../api";
import { ErrorNotice, Loading, pct, SyntheticBadge } from "../components/ui";
import { useLoad } from "../session";

/**
 * Phase 1: static champion data from the active knowledge version plus the
 * player's own record. Builds and matchups arrive in later phases, and only
 * with reliable data.
 */
export function Champions() {
  const { data, error, loading } = useLoad(() => api.champions(), []);
  const [q, setQ] = useState("");

  if (loading && !data) return <Loading />;
  if (error) return <ErrorNotice error={error} />;
  if (!data) return null;
  const list = data.champions.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="stack" style={{ gap: 20 }}>
      <header className="row">
        <div>
          <h1 className="page-title">Champions</h1>
          <p className="page-sub" style={{ margin: 0 }}>Data from version {data.version ?? "—"} and your history with each one.</p>
        </div>
        <span className="spacer" />
        {data.source === "synthetic" && <SyntheticBadge />}
      </header>
      <div className="field" style={{ maxWidth: 320 }}>
        <label htmlFor="champ-search">Search champion</label>
        <input id="champ-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <ul className="grid grid-2" style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {list.map((c) => (
          <li key={c.key}>
            <Link to={`/champions/${encodeURIComponent(c.name)}`} className="tile row" style={{ textDecoration: "none", color: "inherit" }}>
              <ChampionIcon champion={c.key} size={48} />
              <div>
                <div className="match-title">{c.name}</div>
                <div className="tile-note">{c.title} · {c.tags.join(", ")}</div>
              </div>
              <span className="spacer" />
              <div style={{ textAlign: "right" }}>
                {c.personal.games ? (
                  <>
                    <div className="match-title">{c.personal.games} games</div>
                    <div className="tile-note">{pct(c.personal.wins / c.personal.games)} win rate</div>
                  </>
                ) : (
                  <div className="tile-note">No games</div>
                )}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
