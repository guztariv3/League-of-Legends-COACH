import { useState } from "react";
import { api, type DraftAnalysis, type DraftPoint, type ScoutResult } from "../api";
import { ErrorNotice, Loading, pct, roleLabel, SyntheticBadge } from "../components/ui";
import { useLoad } from "../session";

const kindLabel = { fact: "Hecho", observation: "Observación", hypothesis: "Hipótesis" } as const;

/**
 * Pre-game area (brief §41–44): a draft prepared by hand (champions only) and,
 * once the game has started, the game in progress with scouting. The desktop
 * app will feed the same analysis automatically in Phase 4.
 */
export function Game() {
  return (
    <div className="stack" style={{ gap: 24 }}>
      <header>
        <h1 className="page-title">Antes de jugar</h1>
        <p className="page-sub" style={{ margin: 0 }}>Prepara tu partida y, cuando esté en la pantalla de carga, consulta a tus rivales.</p>
      </header>
      <LiveGame />
      <ManualDraft />
    </div>
  );
}

function Points({ draft }: { draft: DraftAnalysis }) {
  const point = (p: DraftPoint) => (
    <article key={p.id} className="insight">
      <span className="badge badge-kind">{kindLabel[p.kind]}</span>
      <p className="insight-title" style={{ marginTop: 6 }}>{p.title}</p>
      {p.detail && <p className="insight-detail">{p.detail}</p>}
    </article>
  );
  return (
    <div className="stack">
      <h3 className="tile-label" style={{ margin: 0 }}>Esto es lo que más importa</h3>
      {draft.keyPoints.length ? draft.keyPoints.map(point) : <p className="page-sub" style={{ margin: 0 }}>No veo nada destacable con la información disponible.</p>}
      {draft.morePoints.length > 0 && (
        <details className="layer">
          <summary>Más detalles ({draft.morePoints.length})</summary>
          <div className="stack" style={{ marginTop: 8 }}>{draft.morePoints.map(point)}</div>
        </details>
      )}
      {draft.unknownChampions.length > 0 && <p className="tile-note" style={{ margin: 0 }}>Sin datos para: {draft.unknownChampions.join(", ")}.</p>}
      <details className="layer">
        <summary>Límites de este análisis</summary>
        <ul className="tile-note">{draft.limits.map((l) => <li key={l}>{l}</li>)}</ul>
      </details>
    </div>
  );
}

function LiveGame() {
  const [state, setState] = useState<{ loading: boolean; data?: ScoutResult; error?: unknown }>({ loading: false });
  const load = async () => {
    setState({ loading: true });
    try { setState({ loading: false, data: await api.scout() }); } catch (error) { setState({ loading: false, error }); }
  };
  const d = state.data;

  return (
    <section className="card stack" aria-labelledby="h-live">
      <div className="row">
        <h2 id="h-live" style={{ margin: 0 }}>Partida en curso</h2>
        <span className="spacer" />
        {d?.simulated && <SyntheticBadge />}
        <button className="btn btn-primary" onClick={load} disabled={state.loading}>{state.loading ? "Buscando…" : d ? "Actualizar" : "Buscar mi partida"}</button>
      </div>
      <p className="tile-note" style={{ margin: 0 }}>
        Solo funciona desde la pantalla de carga: durante la selección de campeones no se consulta información de otros jugadores.
      </p>
      {state.loading && <Loading label="Consultando la partida y el historial reciente de tus rivales…" />}
      {state.error ? <ErrorNotice error={state.error} /> : null}
      {d && !d.inGame && <div className="notice">{d.message}</div>}
      {d?.inGame && (
        <div className="grid grid-2">
          <div className="stack">
            <p style={{ margin: 0 }}>
              Juegas <strong>{d.myChampion!.name}</strong> con {d.allies!.map((a) => a.name).join(", ")}.
              {d.account && <span className="tile-note"> Cuenta: {d.account}</span>}
            </p>
            <Points draft={d.draft!} />
          </div>
          <div className="stack">
            <h3 className="tile-label" style={{ margin: 0 }}>Rivales</h3>
            <ul className="stack" style={{ listStyle: "none", margin: 0, padding: 0, gap: 6 }}>
              {d.enemies!.map((e, i) => (
                <li key={i} className="tile stack" style={{ gap: 2 }}>
                  <div className="row">
                    <strong>{e.championName}</strong>
                    <span className="tile-note">{e.riotId ?? "Jugador"}</span>
                    <span className="spacer" />
                    {e.available && e.smallSample && <span className="badge">Muestra pequeña</span>}
                  </div>
                  <span className="tile-note">{e.headline}</span>
                  {e.available && (
                    <details className="layer">
                      <summary>Ver datos</summary>
                      <dl>
                        <dt>Partidas recientes analizadas</dt><dd>{e.games}</dd>
                        <dt>Victorias</dt><dd>{e.wins} de {e.games}{e.games ? ` (${pct(e.wins / e.games)})` : ""}</dd>
                        <dt>Con {e.championName}</dt><dd>{e.winsOnChampion} de {e.gamesOnChampion}</dd>
                        <dt>Rol más jugado</dt><dd>{e.mainRole ? roleLabel[e.mainRole] : "—"}</dd>
                        <dt>KDA medio</dt><dd>{e.avgKda?.toFixed(2) ?? "—"}</dd>
                      </dl>
                    </details>
                  )}
                </li>
              ))}
            </ul>
            <p className="tile-note" style={{ margin: 0 }}>Con tan pocas partidas no se puede juzgar el nivel de nadie: es solo contexto.</p>
          </div>
        </div>
      )}
    </section>
  );
}

function ManualDraft() {
  const champs = useLoad(() => api.champions(), []);
  const [me, setMe] = useState("");
  const [opponent, setOpponent] = useState("");
  const [allies, setAllies] = useState<string[]>(["", "", "", ""]);
  const [enemies, setEnemies] = useState<string[]>(["", "", "", "", ""]);
  const [result, setResult] = useState<{ data?: DraftAnalysis; error?: unknown }>({});

  if (!champs.data) return champs.error ? <ErrorNotice error={champs.error} /> : <Loading />;
  const options = [...champs.data.champions].sort((a, b) => a.name.localeCompare(b.name));
  const select = (id: string, label: string, value: string, onChange: (v: string) => void) => (
    <div className="field" key={id}>
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {options.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    </div>
  );
  const clean = (xs: string[]) => xs.filter(Boolean);

  return (
    <section className="card stack" aria-labelledby="h-draft">
      <h2 id="h-draft">Preparar una partida</h2>
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!me) return;
          try {
            setResult({ data: await api.draft({ myChampion: me, allies: clean(allies), enemies: clean(enemies), laneOpponent: opponent || undefined }) });
          } catch (error) { setResult({ error }); }
        }}
      >
        <div className="row">
          {select("draft-me", "Tu campeón", me, setMe)}
          {select("draft-opp", "Rival de línea (opcional)", opponent, setOpponent)}
        </div>
        <details className="layer" open>
          <summary>Aliados y rivales</summary>
          <div className="row" style={{ marginTop: 8 }}>
            {allies.map((v, i) => select(`draft-ally-${i}`, `Aliado ${i + 1}`, v, (x) => setAllies(allies.map((a, j) => (j === i ? x : a)))))}
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            {enemies.map((v, i) => select(`draft-enemy-${i}`, `Rival ${i + 1}`, v, (x) => setEnemies(enemies.map((a, j) => (j === i ? x : a)))))}
          </div>
        </details>
        <div><button className="btn btn-primary" disabled={!me}>Analizar</button></div>
      </form>
      {result.error ? <ErrorNotice error={result.error} /> : null}
      {result.data && <Points draft={result.data} />}
    </section>
  );
}
