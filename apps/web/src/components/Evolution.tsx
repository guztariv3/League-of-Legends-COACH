import { api, type AdaptationContext } from "../api";
import { ErrorNotice, Loading } from "./ui";
import { useLoad } from "../session";

const DATE = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric" });
const typeIcon = { inflection: "▲", champion_shift: "◆", patch: "•" } as const;
const verdictLabel: Record<AdaptationContext["verdict"], string> = {
  insufficient: "Posible falta de adaptación",
  over: "Posible sobre-adaptación",
  no_clear_difference: "Sin diferencias claras",
};
const attributionLabel = { player: "Parece un cambio tuyo", environment_possible: "Puede deberse al entorno", unclear: "Origen poco claro" } as const;

/** Evolution (brief §54, §81–83): consolidated changes, recent shifts and a compact timeline. */
export function EvolutionSection() {
  const { data, error } = useLoad(() => api.evolution(), []);
  if (error) return <ErrorNotice error={error} />;
  if (!data) return <Loading />;
  const shifts = data.anomalies.filter((a) => a.verdict === "possible_change");

  return (
    <>
      <section className="card stack" aria-labelledby="h-evo" id="evolution">
        <h2 id="h-evo">Tu evolución</h2>
        {data.inflections.length === 0 && shifts.length === 0 ? (
          <p className="page-sub" style={{ margin: 0 }}>
            En tus {data.games} partidas no hay cambios consolidados. Eso es normal: los cambios reales tardan en distinguirse de la variación entre partidas.
          </p>
        ) : (
          <div className="stack">
            {data.inflections.map((inf) => (
              <article key={inf.metric} className="insight">
                <div className="row" style={{ gap: 6 }}>
                  <span className={`badge ${inf.direction === "improved" ? "badge-win" : "badge-loss"}`}>{inf.direction === "improved" ? "▲ Mejora" : "▼ Bajada"}</span>
                  <span className="badge badge-kind">{attributionLabel[inf.attribution]}</span>
                </div>
                <p className="insight-title" style={{ marginTop: 6 }}>
                  {inf.label}: {inf.before.mean.toFixed(2)} → {inf.after.mean.toFixed(2)} desde el {DATE.format(inf.at)}
                </p>
                <p className="insight-detail">{inf.context.join(" ")}</p>
              </article>
            ))}
            {shifts.map((a) => (
              <article key={a.metric + a.direction} className="insight">
                <span className="badge badge-kind">Observación reciente</span>
                <p className="insight-detail" style={{ marginTop: 6 }}>{a.explanation}</p>
              </article>
            ))}
          </div>
        )}
        {data.timeline.length > 0 && (
          <details className="layer">
            <summary>Ver línea temporal ({data.timeline.length})</summary>
            <ol className="stack" style={{ listStyle: "none", margin: "8px 0 0", padding: 0, gap: 6 }}>
              {data.timeline.map((e, i) => (
                <li key={i} className="row" style={{ alignItems: "baseline", gap: 8 }}>
                  <span className="tile-note" style={{ minWidth: 90 }}>{DATE.format(e.at)}</span>
                  <span aria-hidden="true">{typeIcon[e.type]}</span>
                  <span><strong>{e.title}</strong> <span className="tile-note">{e.detail}</span></span>
                </li>
              ))}
            </ol>
          </details>
        )}
        <p className="tile-note" style={{ margin: 0 }}>
          Un cambio solo aparece cuando supera con claridad la variación normal, y siempre comprobamos si coincide con un cambio de parche o de campeones.
        </p>
      </section>

      {(data.adaptation.byOpponentClass.length > 0 || data.adaptation.lead) && (
        <section className="card stack" aria-labelledby="h-adapt" id="adaptation">
          <h2 id="h-adapt">Cómo te adaptas</h2>
          <p className="tile-note" style={{ margin: 0 }}>Hipótesis a partir de tus resultados según el contexto; no sabemos qué intentabas hacer.</p>
          {(() => {
            const all = [...(data.adaptation.lead ? [data.adaptation.lead] : []), ...data.adaptation.byOpponentClass];
            const notable = all.filter((c) => c.verdict !== "no_clear_difference");
            const quiet = all.filter((c) => c.verdict === "no_clear_difference");
            const card = (c: AdaptationContext) => (
              <article key={c.id} className="tile stack" style={{ gap: 4 }}>
                <div className="row">
                  <strong>{c.label}</strong>
                  <span className="spacer" />
                  <span className={`badge ${c.verdict === "no_clear_difference" ? "" : "badge-kind"}`}>{verdictLabel[c.verdict]}</span>
                </div>
                <span className="tile-note">{c.detail}</span>
                <details className="layer">
                  <summary>Ver datos</summary>
                  <dl>
                    {c.metrics.map((m) => (
                      <div key={m.label} style={{ display: "contents" }}><dt>{m.label}</dt><dd>{m.here} (resto: {m.elsewhere})</dd></div>
                    ))}
                  </dl>
                </details>
              </article>
            );
            return (
              <>
                {notable.length > 0 ? <div className="grid grid-2">{notable.map(card)}</div> : (
                  <p style={{ margin: 0 }}>No detectamos diferencias claras en cómo juegas según el contexto ({quiet.length} contextos analizados).</p>
                )}
                {quiet.length > 0 && notable.length > 0 && <p className="tile-note" style={{ margin: 0 }}>En {quiet.length} contextos más no hay diferencias claras.</p>}
                {quiet.length > 0 && (
                  <details className="layer">
                    <summary>Ver contextos sin diferencias</summary>
                    <div className="grid grid-2" style={{ marginTop: 8 }}>{quiet.map(card)}</div>
                  </details>
                )}
              </>
            );
          })()}
        </section>
      )}
    </>
  );
}

const decisionLabel = { accepted: "Aceptado", rejected: "Rechazado", dismissed: "Marcado como no útil", none: "Consultado" } as const;
const kindLabel = { goal_suggestion: "Objetivo sugerido", insight: "Conclusión del Coach", draft: "Preparación de partida" } as const;

/** Recommendation → decision → what happened next (brief §40, §79). */
export function DecisionHistory() {
  const { data, error } = useLoad(() => api.history(), []);
  if (error) return <ErrorNotice error={error} />;
  if (!data) return <Loading />;
  return (
    <details className="layer">
      <summary>Historial de recomendaciones y decisiones ({data.items.length})</summary>
      <p className="tile-note">{data.note}</p>
      {data.items.length === 0 ? (
        <p className="tile-note">Aún no hay decisiones registradas.</p>
      ) : (
        <ul className="stack" style={{ listStyle: "none", margin: 0, padding: 0, gap: 6 }}>
          {data.items.map((i) => (
            <li key={i.id} className="tile stack" style={{ gap: 2 }}>
              <div className="row" style={{ gap: 6 }}>
                <span className="badge">{kindLabel[i.kind]}</span>
                {i.decision && <span className="badge badge-kind">{decisionLabel[i.decision]}</span>}
                <span className="spacer" />
                <span className="tile-note">{new Date(i.createdAt).toLocaleDateString("es-ES")}</span>
              </div>
              <span>{i.title}</span>
              {i.outcome && <span className="tile-note">Después: {i.outcome}</span>}
            </li>
          ))}
        </ul>
      )}
      {data.items.length > 0 && (
        <button className="btn btn-ghost" onClick={async () => { await api.clearHistory(); location.reload(); }}>Borrar historial</button>
      )}
    </details>
  );
}
