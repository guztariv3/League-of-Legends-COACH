import { api, type AdaptationContext } from "../api";
import { ErrorNotice, Loading } from "./ui";
import { useLoad } from "../session";

const DATE = new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", year: "numeric" });
const typeIcon = { inflection: "▲", champion_shift: "◆", patch: "•" } as const;
const verdictLabel: Record<AdaptationContext["verdict"], string> = {
  insufficient: "Possible under-adaptation",
  over: "Possible over-adaptation",
  no_clear_difference: "No clear difference",
};
const attributionLabel = { player: "Looks like a change in you", environment_possible: "May be due to the environment", unclear: "Unclear origin" } as const;

/** Evolution (brief §54, §81–83): consolidated changes, recent shifts and a compact timeline. */
export function EvolutionSection() {
  const { data, error } = useLoad(() => api.evolution(), []);
  if (error) return <ErrorNotice error={error} />;
  if (!data) return <Loading />;
  const shifts = data.anomalies.filter((a) => a.verdict === "possible_change");

  return (
    <>
      <section className="card stack" aria-labelledby="h-evo" id="evolution">
        <h2 id="h-evo">Your progress</h2>
        {data.inflections.length === 0 && shifts.length === 0 ? (
          <p className="page-sub" style={{ margin: 0 }}>
            There are no consolidated changes in your {data.games} games. That is normal: real changes take time to stand out from game-to-game variation.
          </p>
        ) : (
          <div className="stack">
            {data.inflections.map((inf) => (
              <article key={inf.metric} className="insight">
                <div className="row" style={{ gap: 6 }}>
                  <span className={`badge ${inf.direction === "improved" ? "badge-win" : "badge-loss"}`}>{inf.direction === "improved" ? "▲ Improvement" : "▼ Decline"}</span>
                  <span className="badge badge-kind">{attributionLabel[inf.attribution]}</span>
                </div>
                <p className="insight-title" style={{ marginTop: 6 }}>
                  {inf.label}: {inf.before.mean.toFixed(2)} → {inf.after.mean.toFixed(2)} since {DATE.format(inf.at)}
                </p>
                <p className="insight-detail">{inf.context.join(" ")}</p>
              </article>
            ))}
            {shifts.map((a) => (
              <article key={a.metric + a.direction} className="insight">
                <span className="badge badge-kind">Recent observation</span>
                <p className="insight-detail" style={{ marginTop: 6 }}>{a.explanation}</p>
              </article>
            ))}
          </div>
        )}
        {data.timeline.length > 0 && (
          <details className="layer">
            <summary>See timeline ({data.timeline.length})</summary>
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
          A change only shows up when it clearly exceeds normal variation, and we always check whether it coincides with a patch or champion change.
        </p>
      </section>

      {(data.adaptation.byOpponentClass.length > 0 || data.adaptation.lead) && (
        <section className="card stack" aria-labelledby="h-adapt" id="adaptation">
          <h2 id="h-adapt">How you adapt</h2>
          <p className="tile-note" style={{ margin: 0 }}>Hypotheses from your results by context; we do not know what you were trying to do.</p>
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
                  <summary>See data</summary>
                  <dl>
                    {c.metrics.map((m) => (
                      <div key={m.label} style={{ display: "contents" }}><dt>{m.label}</dt><dd>{m.here} (elsewhere: {m.elsewhere})</dd></div>
                    ))}
                  </dl>
                </details>
              </article>
            );
            return (
              <>
                {notable.length > 0 ? <div className="grid grid-2">{notable.map(card)}</div> : (
                  <p style={{ margin: 0 }}>We see no clear difference in how you play by context ({quiet.length} contexts analyzed).</p>
                )}
                {quiet.length > 0 && notable.length > 0 && <p className="tile-note" style={{ margin: 0 }}>{quiet.length} more contexts show no clear difference.</p>}
                {quiet.length > 0 && (
                  <details className="layer">
                    <summary>See contexts with no difference</summary>
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

const decisionLabel = { accepted: "Accepted", rejected: "Rejected", dismissed: "Marked as not useful", none: "Viewed" } as const;
const kindLabel = { goal_suggestion: "Suggested goal", insight: "Coach conclusion", draft: "Game prep" } as const;

/** Recommendation → decision → what happened next (brief §40, §79). */
export function DecisionHistory() {
  const { data, error } = useLoad(() => api.history(), []);
  if (error) return <ErrorNotice error={error} />;
  if (!data) return <Loading />;
  return (
    <details className="layer">
      <summary>Recommendation and decision history ({data.items.length})</summary>
      <p className="tile-note">{data.note}</p>
      {data.items.length === 0 ? (
        <p className="tile-note">No decisions recorded yet.</p>
      ) : (
        <ul className="stack" style={{ listStyle: "none", margin: 0, padding: 0, gap: 6 }}>
          {data.items.map((i) => (
            <li key={i.id} className="tile stack" style={{ gap: 2 }}>
              <div className="row" style={{ gap: 6 }}>
                <span className="badge">{kindLabel[i.kind]}</span>
                {i.decision && <span className="badge badge-kind">{decisionLabel[i.decision]}</span>}
                <span className="spacer" />
                <span className="tile-note">{new Date(i.createdAt).toLocaleDateString("en-US")}</span>
              </div>
              <span>{i.title}</span>
              {i.outcome && <span className="tile-note">Afterwards: {i.outcome}</span>}
            </li>
          ))}
        </ul>
      )}
      {data.items.length > 0 && (
        <button className="btn btn-ghost" onClick={async () => { await api.clearHistory(); location.reload(); }}>Clear history</button>
      )}
    </details>
  );
}
