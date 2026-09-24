import { useEffect, useState } from "react";
import { useLocation } from "react-router";
import { api, type Dimension, type MemoryCategory, type MemoryItem } from "../api";
import { Goals } from "../components/Goals";
import { DecisionHistory, EvolutionSection } from "../components/Evolution";
import { ErrorNotice, Loading, modeLabel, pct, roleLabel } from "../components/ui";
import { useLoad, useSession } from "../session";

const trendText: Record<Dimension["trend"], string | null> = {
  improving: "▲ Mejorando",
  declining: "▼ Bajando",
  stable: "Estable",
  unknown: null,
};

const stateLabel = { ahead: "Por delante al 15", even: "Igualada al 15", behind: "Por detrás al 15" } as const;

/**
 * One area for everything personal (brief §16): profile dimensions, game
 * state, goals and Coach memory. It shows conclusions first and numbers on
 * demand.
 */
export function Profile() {
  const [version, setVersion] = useState(0);
  const bump = () => setVersion((v) => v + 1);
  const profile = useLoad(() => api.profile(), []);
  const goals = useLoad(() => api.goals(), [version]);
  const { hash } = useLocation();

  useEffect(() => {
    if (hash && profile.data) document.getElementById(hash.slice(1))?.scrollIntoView({ block: "start" });
  }, [hash, profile.data]);

  if (profile.loading && !profile.data) return <Loading />;
  if (profile.error) return <ErrorNotice error={profile.error} />;
  const p = profile.data!;

  return (
    <div className="stack" style={{ gap: 24 }}>
      <header>
        <h1 className="page-title">Tu perfil</h1>
        <p className="page-sub" style={{ margin: 0 }}>Cómo juegas, comparado siempre contigo mismo. Sin puntuaciones globales.</p>
      </header>

      {p.profiles.length === 0 && (
        <div className="notice">Todavía no tengo suficiente información fiable para describir cómo juegas. Necesito al menos 5 partidas analizables en un modo.</div>
      )}

      {p.profiles.map((mp) => (
        <section key={mp.mode} className="card stack" aria-labelledby={`h-${mp.mode}`}>
          <h2 id={`h-${mp.mode}`}>
            {modeLabel[mp.mode]} · {mp.games} partidas{mp.mainRole ? ` · rol principal ${roleLabel[mp.mainRole]}` : ""}
          </h2>
          <div className="grid grid-2">
            {mp.dimensions.filter((d) => d.id !== "state").map((d) => (
              <article key={d.id} id={mp.mode === "summoners_rift" ? d.id : `${mp.mode}-${d.id}`} className="tile dimension stack" style={{ gap: 4 }}>
                <div className="row">
                  <span className="tile-label">{d.label}</span>
                  <span className="spacer" />
                  {trendText[d.trend] && <span className={`trend trend-${d.trend}`}>{trendText[d.trend]}</span>}
                </div>
                <strong>{d.headline}</strong>
                {d.metrics.length > 0 && (
                  <details className="layer">
                    <summary>Ver datos</summary>
                    <dl>
                      {d.metrics.map((m) => (
                        <div key={m.label} style={{ display: "contents" }}><dt>{m.label}</dt><dd>{m.value}</dd></div>
                      ))}
                      <dt>Muestra</dt><dd>{d.sampleSize} partidas</dd>
                    </dl>
                  </details>
                )}
              </article>
            ))}
          </div>
        </section>
      ))}

      {p.gameState.some((b) => b.games > 0) && (
        <section className="card stack dimension" aria-labelledby="h-state" id="state">
          <h2 id="h-state">Según cómo va la partida</h2>
          <p className="tile-note" style={{ margin: 0 }}>
            Se clasifica por la diferencia de oro de tu equipo al minuto 15 (±1500). Solo Grieta, con línea temporal disponible.
          </p>
          <div className="tiles">
            {p.gameState.map((b) => (
              <div key={b.state} className="tile">
                <div className="tile-value">{b.games ? `${b.wins}/${b.games}` : "—"}</div>
                <div className="tile-label">{stateLabel[b.state]} · victorias</div>
                {b.games >= 3 && <div className="tile-note">rango probable {pct(b.interval.low)}–{pct(b.interval.high)}</div>}
                {b.lateDeathsPerMin !== null && <div className="tile-note">{b.lateDeathsPerMin.toFixed(2)} muertes/min tras el 15</div>}
              </div>
            ))}
          </div>
        </section>
      )}

      <EvolutionSection />

      <section className="card stack" aria-labelledby="h-goals" id="goals">
        <h2 id="h-goals">Objetivos</h2>
        {goals.data ? <Goals data={goals.data} onChange={bump} /> : goals.error ? <ErrorNotice error={goals.error} /> : <Loading />}
      </section>

      <CoachMemory onChange={bump} metrics={goals.data?.metrics ?? []} />
    </div>
  );
}

const categoryLabel: Record<MemoryCategory, string> = {
  focus: "Enfoque",
  correction: "Correcciones",
  note: "Notas para el Coach",
};

function CoachMemory({ onChange, metrics }: { onChange: () => void; metrics: { id: string; label: string }[] }) {
  const { refresh } = useSession();
  const [version, setVersion] = useState(0);
  const mem = useLoad(() => api.memory(), [version]);
  const [note, setNote] = useState("");
  const reload = () => { setVersion((v) => v + 1); onChange(); };

  if (!mem.data) return mem.error ? <ErrorNotice error={mem.error} /> : <Loading />;
  const { items, categories } = mem.data;
  const focus = items.find((i) => i.category === "focus");

  return (
    <section className="card stack" aria-labelledby="h-memory" id="memory">
      <h2 id="h-memory">Lo que el Coach sabe de ti</h2>
      <p className="tile-note" style={{ margin: 0 }}>
        El Coach solo recuerda lo que ves aquí. Puedes corregirlo o borrarlo cuando quieras.
      </p>

      <div className="row">
        <div className="field">
          <label htmlFor="focus">¿En qué quieres centrarte?</label>
          <select
            id="focus"
            value={focus?.ref ?? ""}
            disabled={!categories.focus}
            onChange={async (e) => {
              if (e.target.value) await api.setFocus(e.target.value);
              else if (focus) await api.deleteMemory(focus.id);
              reload();
            }}
          >
            <option value="">Lo que el Coach considere más útil</option>
            {metrics.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </div>
      </div>
      <p className="tile-note" style={{ margin: 0 }}>
        Si eliges un enfoque, el Coach pondrá primero lo relacionado con él, pero seguirá avisándote de lo demás si es importante.
      </p>

      <form
        className="row"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!note.trim()) return;
          await api.addNote(note.trim());
          setNote("");
          reload();
        }}
      >
        <div className="field" style={{ flex: 1, minWidth: 200 }}>
          <label htmlFor="note">Añadir una nota para el Coach</label>
          <input id="note" value={note} maxLength={300} disabled={!categories.note} onChange={(e) => setNote(e.target.value)} placeholder="Por ejemplo: juego con mando, estoy aprendiendo jungla…" />
        </div>
        <button className="btn" style={{ alignSelf: "flex-end" }} disabled={!categories.note || !note.trim()}>Guardar</button>
      </form>

      {items.length > 0 ? (
        <ul className="stack" style={{ listStyle: "none", margin: 0, padding: 0, gap: 6 }}>
          {items.map((m: MemoryItem) => (
            <li key={m.id} className="tile memory-item">
              <span className="badge">{categoryLabel[m.category]}</span>
              <span style={{ flex: 1 }}>{m.content}</span>
              <button className="btn btn-ghost" aria-label={`Olvidar: ${m.content}`} onClick={async () => { await api.deleteMemory(m.id); reload(); }}>Olvidar</button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="page-sub" style={{ margin: 0 }}>El Coach todavía no ha guardado nada.</p>
      )}

      <DecisionHistory />

      <details className="layer">
        <summary>Controlar qué recuerda el Coach</summary>
        <div className="stack" style={{ marginTop: 8 }}>
          {(Object.keys(categoryLabel) as MemoryCategory[]).map((cat) => (
            <div key={cat} className="row">
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={categories[cat]}
                  onChange={async (e) => {
                    await api.savePreferences({ memory: { ...categories, [cat]: e.target.checked } });
                    await refresh();
                    reload();
                  }}
                />
                {categoryLabel[cat]}
              </label>
              <span className="spacer" />
              <button className="btn btn-ghost" onClick={async () => { await api.clearMemory(cat); reload(); }}>Borrar {categoryLabel[cat].toLowerCase()}</button>
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}
