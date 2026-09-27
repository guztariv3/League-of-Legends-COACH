import { useState } from "react";
import { ChampionIcon } from "../assets";
import { Link, useSearchParams } from "react-router";
import { api, type ChampionList } from "../api";
import { ErrorNotice, Loading, pct, SyntheticBadge } from "../components/ui";
import { useLoad } from "../session";

type Champ = ChampionList["champions"][number];

/** Riot's 1–10 difficulty rating, grouped the way the client describes it. */
const DIFFICULTY: [string, string, (d: number) => boolean][] = [
  ["low", "Low (1–3)", (d) => d <= 3],
  ["moderate", "Moderate (4–7)", (d) => d >= 4 && d <= 7],
  ["high", "High (8–10)", (d) => d >= 8],
];

const SORTS: [string, string, (a: Champ, b: Champ) => number][] = [
  ["played", "Most played by you", (a, b) => b.personal.games - a.personal.games || a.name.localeCompare(b.name)],
  ["name", "Name", (a, b) => a.name.localeCompare(b.name)],
  ["winrate", "Your win rate (3+ games)", (a, b) => rate(b) - rate(a) || b.personal.games - a.personal.games],
];

const LANES: [string, string][] = [["TOP", "Top"], ["JUNGLE", "Jungle"], ["MIDDLE", "Mid"], ["BOTTOM", "Bot"], ["SUPPORT", "Support"]];

const rate = (c: Champ) => (c.personal.games >= 3 ? c.personal.wins / c.personal.games : -1);

/**
 * Champion list: game data from the active knowledge version plus your own record. Filters live in the
 * URL so a filtered list can be bookmarked. There are no global win or pick rates here until our own
 * statistics exist (F7); nothing is estimated.
 */
export function Champions() {
  const { data, error, loading } = useLoad(() => api.champions(), []);
  const [params, setParams] = useSearchParams();
  // Typing stays local: a URL update per keystroke can drop characters mid-transition.
  const [q, setQ] = useState("");

  if (loading && !data) return <Loading />;
  if (error) return <ErrorNotice error={error} />;
  if (!data) return null;

  // Built from the live URL so two changes in the same tick don't drop one (see Matches).
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(window.location.search);
    if (v) next.set(k, v); else next.delete(k);
    setParams(next, { replace: true });
  };
  const cls = params.get("class") ?? "";
  const lane = LANES.find(([k]) => k === params.get("position"))?.[0] ?? "";
  const diff = DIFFICULTY.find(([k]) => k === params.get("difficulty"));
  const played = params.get("played") === "1";
  const sort = SORTS.find(([k]) => k === params.get("sort")) ?? SORTS[0]!;

  const classes = [...new Set(data.champions.flatMap((c) => c.tags))].sort();
  const hasDifficulty = data.champions.some((c) => c.info);
  const list = data.champions
    .filter((c) => c.name.toLowerCase().includes(q.toLowerCase()))
    .filter((c) => !cls || c.tags.includes(cls))
    .filter((c) => !lane || c.positions.includes(lane))
    .filter((c) => !diff || (c.info ? diff[2](c.info.difficulty) : false))
    .filter((c) => !played || c.personal.games > 0)
    .sort(sort[2]);
  const filtered = Boolean(q || cls || lane || diff || played);

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

      <div className="row filters" role="search" aria-label="Champion filters">
        <div className="field">
          <label htmlFor="champ-search">Search champion</label>
          <input id="champ-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {data.positionsSource && (
          <div className="field">
            <label htmlFor="champ-position">Position</label>
            <select id="champ-position" value={lane} onChange={(e) => set("position", e.target.value)}>
              <option value="">All</option>
              {LANES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
        )}
        <div className="field">
          <label htmlFor="champ-class">Class</label>
          <select id="champ-class" value={cls} onChange={(e) => set("class", e.target.value)}>
            <option value="">All</option>
            {classes.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        {hasDifficulty && (
          <div className="field">
            <label htmlFor="champ-difficulty">Difficulty</label>
            <select id="champ-difficulty" value={diff?.[0] ?? ""} onChange={(e) => set("difficulty", e.target.value)}>
              <option value="">All</option>
              {DIFFICULTY.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
        )}
        <div className="field">
          <label htmlFor="champ-sort">Sort by</label>
          <select id="champ-sort" value={sort[0]} onChange={(e) => set("sort", e.target.value === "played" ? "" : e.target.value)}>
            {SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        <label className="toggle filter-toggle">
          <input type="checkbox" checked={played} onChange={(e) => set("played", e.target.checked ? "1" : "")} />
          Played by you
        </label>
      </div>

      <p className="tile-note" aria-live="polite" style={{ margin: 0 }}>
        {list.length} of {data.champions.length} champions
        {filtered && <> · <button type="button" className="link-btn" onClick={() => { setQ(""); setParams(new URLSearchParams(), { replace: true }); }}>Clear filters</button></>}
      </p>

      {list.length === 0 ? (
        <div className="notice">No champion matches these filters.</div>
      ) : (
        <div className="table-scroll">
          <table className="champ-table">
            <thead>
              <tr>
                <th scope="col" className="num-col">#</th>
                <th scope="col">Champion</th>
                <th scope="col">Class</th>
                {hasDifficulty && <th scope="col">Difficulty</th>}
                <th scope="col" className="num-col">Your games</th>
                <th scope="col" className="num-col">Your win rate</th>
              </tr>
            </thead>
            <tbody>
              {list.map((c, i) => (
                <tr key={c.key}>
                  <td className="num-col quiet-num">{i + 1}</td>
                  <td>
                    <Link to={`/champions/${encodeURIComponent(c.name)}`} className="champ-cell champ-link">
                      <ChampionIcon champion={c.key} size={36} />
                      <span>
                        <span className="match-title">{c.name}</span>
                        <small>{c.title}</small>
                      </span>
                    </Link>
                  </td>
                  <td>{c.tags.join(", ")}</td>
                  {hasDifficulty && <td>{c.info ? `${c.info.difficulty}/10` : "—"}</td>}
                  <td className="num-col">{c.personal.games || <span className="quiet-num">No games</span>}</td>
                  <td className="num-col">
                    {c.personal.games ? (
                      <span className={c.personal.wins / c.personal.games >= 0.5 ? "num-good" : "num-bad"}>{pct(c.personal.wins / c.personal.games)}</span>
                    ) : <span className="quiet-num">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data.positionsSource && (
        <p className="tile-note" style={{ margin: 0 }}>
          Positions: <a href={data.positionsSource.wiki} target="_blank" rel="noreferrer">League of Legends Wiki</a> (<a href={data.positionsSource.license} target="_blank" rel="noreferrer">CC BY-SA 3.0</a>), via <a href={data.positionsSource.meraki} target="_blank" rel="noreferrer">Meraki Analytics</a>.
        </p>
      )}
    </div>
  );
}
