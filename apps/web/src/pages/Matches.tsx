import { useSearchParams } from "react-router";
import { api } from "../api";
import { ErrorNotice, Loading, MatchItem, modeLabel, roleLabel } from "../components/ui";
import { useLoad } from "../session";

const FILTERS = ["champion", "opponent", "role", "result", "mode", "patch", "maxDuration", "limit"] as const;

/** Match Center: filters in one row, simple list, detail on demand. */
export function Matches() {
  const [params, setParams] = useSearchParams();
  const query = Object.fromEntries(FILTERS.flatMap((k) => (params.get(k) ? [[k, params.get(k)!]] : [])));
  const { data, error, loading } = useLoad(() => api.matches({ limit: "100", ...query }), [params.toString()]);

  // Build from the live URL, not `params` (or setParams' `prev`, also taken from the last render):
  // two filter changes before a re-render would otherwise drop the earlier one.
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(window.location.search);
    if (v) next.set(k, v); else next.delete(k);
    setParams(next, { replace: true });
  };
  const select = (k: string, label: string, options: [string, string][]) => (
    <div className="field">
      <label htmlFor={`f-${k}`}>{label}</label>
      <select id={`f-${k}`} value={params.get(k) ?? ""} onChange={(e) => set(k, e.target.value)}>
        <option value="">All</option>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );

  return (
    <div className="stack" style={{ gap: 20 }}>
      <header>
        <h1 className="page-title">Matches</h1>
        <p className="page-sub" style={{ margin: 0 }}>Your analyzed history. Open a game to see the details.</p>
      </header>

      <div className="row" role="search" aria-label="Filters">
        {select("champion", "Champion", (data?.facets.champions ?? []).map((c) => [c, c]))}
        {select("role", "Role", Object.entries(roleLabel).filter(([k]) => k !== "NONE"))}
        {select("result", "Result", [["win", "Wins"], ["loss", "Losses"]])}
        {select("mode", "Mode", (data?.facets.modes ?? []).map((m) => [m, modeLabel[m] ?? m]))}
        {select("patch", "Patch", (data?.facets.patches ?? []).map((p) => [p, p]))}
        {select("maxDuration", "Duration", [["25", "≤ 25 min"], ["30", "≤ 30 min"], ["40", "≤ 40 min"]])}
        {params.get("opponent") && (
          <span className="badge" style={{ alignSelf: "flex-end", marginBottom: 10 }}>
            vs {params.get("opponent")}
            <button className="btn-ghost" style={{ border: 0, background: "none", color: "inherit", cursor: "pointer" }} aria-label="Remove opponent" onClick={() => set("opponent", "")}>✕</button>
          </span>
        )}
        {params.get("limit") && <span className="badge" style={{ alignSelf: "flex-end", marginBottom: 10 }}>last {params.get("limit")}</span>}
        {params.toString() && (
          <button className="btn btn-ghost" style={{ alignSelf: "flex-end" }} onClick={() => setParams({}, { replace: true })}>Clear</button>
        )}
      </div>

      {loading && !data ? <Loading /> : error ? <ErrorNotice error={error} /> : data && (
        <>
          <p className="tile-note" style={{ margin: 0 }} aria-live="polite">{data.total} games{data.matches.length < data.total ? ` · showing ${data.matches.length}` : ""}</p>
          {data.matches.length ? (
            <ul className="match-list">{data.matches.map((m) => <MatchItem key={m.matchId} m={m} />)}</ul>
          ) : (
            <div className="notice">No games match these filters.</div>
          )}
        </>
      )}
    </div>
  );
}
