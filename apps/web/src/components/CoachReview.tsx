import { useState } from "react";
import { api, type CoachDecision, type CoachReview as Review, type ReviewSectionId } from "../api";
import { ItemIcon } from "../assets";
import { pct } from "./ui";

const BASIS: Record<CoachDecision["basis"], string> = { fact: "Fact", observation: "Observation", hypothesis: "Hypothesis" };
const SOURCE: Record<CoachDecision["evidence"][number]["source"], string> = {
  this_game: "this game", your_games: "your games", game_data: "game data", global_stats: "global stats",
};
const ICON: Record<ReviewSectionId, string> = {
  went_well: "✓", hurt: "▼", biggest_mistake: "!", missed_opportunity: "◆", build: "⬡", skills: "Q", macro: "⚑", focus: "◎",
};
/** Goal metrics the Coach can remember as your focus (see the memory API). */
const FOCUS_METRICS = new Set(["earlyDeaths", "csPerMin", "deathsPerMin", "goldDiff10", "visionPerMin", "killParticipation"]);

/**
 * Coach Review (F5): eight short sections after a game. Every line shows what it rests on
 * (fact, observation from your own games, or hypothesis) and its evidence on demand. A
 * section without enough data says so. Moments link to the map below.
 */
export function CoachReview({ review, onMoment }: { review: Review; onMoment: (id: string) => void }) {
  return (
    <section className="stack" aria-labelledby="h-coach-review" style={{ gap: 12 }}>
      <div className="row">
        <h2 id="h-coach-review" style={{ margin: 0 }}>Coach Review</h2>
        <span className="spacer" />
        <span className="tile-note">Compared with {review.baseline.games} of {review.baseline.scope}</span>
      </div>
      <div className="coach-review">
        {review.sections.map((s) => (
          <section key={s.id} className={`card stack review-section review-${s.id}`} aria-labelledby={`h-rs-${s.id}`}>
            <h3 id={`h-rs-${s.id}`} className="review-section-title"><span aria-hidden="true" className="review-icon">{ICON[s.id]}</span> {s.title}</h3>
            {s.decisions.length === 0 ? (
              <p className="tile-note" style={{ margin: 0 }}>{s.empty}</p>
            ) : (
              s.decisions.map((d) => <Line key={d.id} d={d} section={s.id} onMoment={onMoment} />)
            )}
          </section>
        ))}
      </div>
    </section>
  );
}

function Line({ d, section, onMoment }: { d: CoachDecision; section: ReviewSectionId; onMoment: (id: string) => void }) {
  const [saved, setSaved] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const moment = (section === "biggest_mistake" || section === "missed_opportunity" || d.id.startsWith("review:good:")) && d.ref;
  return (
    <div className="review-line">
      <div className="row" style={{ gap: 8, flexWrap: "nowrap", alignItems: "flex-start" }}>
        {section === "build" && d.ref && <ItemIcon id={Number(d.ref)} size={28} />}
        <strong className="review-headline">{d.headline}</strong>
      </div>
      <p className="insight-detail">{d.reasons[0]}</p>
      <div className="row" style={{ gap: 8 }}>
        <span className="badge badge-kind">{BASIS[d.basis]}</span>
        {moment && <button type="button" className="link-btn" onClick={() => onMoment(d.ref!)}>Show on the map</button>}
        {section === "focus" && d.ref && FOCUS_METRICS.has(d.ref) && (
          <button type="button" className="btn" disabled={saved === "saving" || saved === "saved"}
            onClick={() => { setSaved("saving"); api.setFocus(d.ref!).then(() => setSaved("saved"), () => setSaved("error")); }}>
            {saved === "saved" ? "Saved as your focus" : saved === "error" ? "Couldn't save — retry" : "Make it my focus"}
          </button>
        )}
      </div>
      {(d.evidence.length > 0 || d.reasons.length > 1 || d.alternatives.length > 0) && (
        <details className="layer">
          <summary>See evidence</summary>
          {d.reasons.length > 1 && <ul className="tile-note" style={{ margin: "6px 0 0", paddingLeft: 18 }}>{d.reasons.slice(1).map((r) => <li key={r}>{r}</li>)}</ul>}
          <dl>
            {d.evidence.map((e, i) => (
              <div key={i} style={{ display: "contents" }}>
                <dt>{e.label}</dt>
                <dd>{e.value} <span className="tile-note">({SOURCE[e.source]}{e.sampleSize ? `, ${e.sampleSize} games` : ""})</span></dd>
              </div>
            ))}
            <dt>Confidence</dt><dd>{pct(d.confidence)}</dd>
          </dl>
        </details>
      )}
    </div>
  );
}
