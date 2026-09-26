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
  const diff = DIFFICULTY.find(([k]) => k === params.get("difficulty"));
  const played = params.get("played") === "1";
  const sort = SORTS.find(([k]) => k === params.get("sort")) ?? SORTS[0]!;

  const classes = [...new Set(data.champions.flatMap((c) => c.tags))].sort();
  const hasDifficulty = data.champions.some((c) => c.info);
  const list = data.champions
    .filter((c) => c.name.toLowerCase().includes(q.toLowerCase()))
    .filter((c) => !cls || c.tags.includes(cls))
    .filter((c) => !diff || (c.info ? diff[2](c.info.difficulty) : false))
    .filter((c) => !played || c.personal.games > 0)
    .sort(sort[2]);
  const filtered = Boolean(q || cls || diff || played);

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
        <ul className="grid grid-2" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {list.map((c) => (
            <li key={c.key}>
              <Link to={`/champions/${encodeURIComponent(c.name)}`} className="tile row champ-tile" style={{ textDecoration: "none", color: "inherit" }}>
                <ChampionIcon champion={c.key} size={48} />
                <div className="champ-tile-text">
                  <div className="match-title">{c.name}</div>
                  <div className="tile-note">{c.title} · {c.tags.join(", ")}{c.info ? ` · difficulty ${c.info.difficulty}/10` : ""}</div>
                </div>
                <div style={{ textAlign: "right", flex: "none" }}>
                  {c.personal.games ? (
                    <>
                      <div className="match-title">{c.personal.games} {c.personal.games === 1 ? "game" : "games"}</div>
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
      )}
    </div>
  );
}
