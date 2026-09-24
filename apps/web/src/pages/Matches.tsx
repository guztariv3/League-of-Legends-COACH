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

  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    setParams(next, { replace: true });
  };
  const select = (k: string, label: string, options: [string, string][]) => (
    <div className="field">
      <label htmlFor={`f-${k}`}>{label}</label>
      <select id={`f-${k}`} value={params.get(k) ?? ""} onChange={(e) => set(k, e.target.value)}>
        <option value="">Todos</option>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );

  return (
    <div className="stack" style={{ gap: 20 }}>
      <header>
        <h1 className="page-title">Partidas</h1>
        <p className="page-sub" style={{ margin: 0 }}>Tu historial analizado. Abre una partida para ver el detalle.</p>
      </header>

      <div className="row" role="search" aria-label="Filtros">
        {select("champion", "Campeón", (data?.facets.champions ?? []).map((c) => [c, c]))}
        {select("role", "Rol", Object.entries(roleLabel).filter(([k]) => k !== "NONE"))}
        {select("result", "Resultado", [["win", "Victorias"], ["loss", "Derrotas"]])}
        {select("mode", "Modo", (data?.facets.modes ?? []).map((m) => [m, modeLabel[m] ?? m]))}
        {select("patch", "Parche", (data?.facets.patches ?? []).map((p) => [p, p]))}
        {select("maxDuration", "Duración", [["25", "≤ 25 min"], ["30", "≤ 30 min"], ["40", "≤ 40 min"]])}
        {params.get("opponent") && (
          <span className="badge" style={{ alignSelf: "flex-end", marginBottom: 10 }}>
            contra {params.get("opponent")}
            <button className="btn-ghost" style={{ border: 0, background: "none", color: "inherit", cursor: "pointer" }} aria-label="Quitar rival" onClick={() => set("opponent", "")}>✕</button>
          </span>
        )}
        {params.get("limit") && <span className="badge" style={{ alignSelf: "flex-end", marginBottom: 10 }}>últimas {params.get("limit")}</span>}
        {params.toString() && (
          <button className="btn btn-ghost" style={{ alignSelf: "flex-end" }} onClick={() => setParams({}, { replace: true })}>Limpiar</button>
        )}
      </div>

      {loading && !data ? <Loading /> : error ? <ErrorNotice error={error} /> : data && (
        <>
          <p className="tile-note" style={{ margin: 0 }} aria-live="polite">{data.total} partidas{data.matches.length < data.total ? ` · mostrando ${data.matches.length}` : ""}</p>
          {data.matches.length ? (
            <ul className="match-list">{data.matches.map((m) => <MatchItem key={m.matchId} m={m} />)}</ul>
          ) : (
            <div className="notice">Ninguna partida coincide con estos filtros.</div>
          )}
        </>
      )}
    </div>
  );
}
