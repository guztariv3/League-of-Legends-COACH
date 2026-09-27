import type { ReactNode } from "react";

/**
 * A Coach recommendation, visually distinct from statistics (hextech blue, with
 * the Coach's voice): what to do, the main reason, and whether it is a change.
 * It takes the shape of a CoachDecision without depending on the engine.
 */
export interface CoachCardProps {
  headline: string;
  reasons: string[];
  basis: "fact" | "observation" | "hypothesis";
  /** The recommendation changed since the last one of the same kind. */
  adjustment?: boolean;
  /** Picture of what is recommended (item, ability…). */
  art?: ReactNode;
  /** Visible heading; also names the region for assistive tech. */
  label?: string;
  /** How sure the recommendation is, in words (no number). */
  certainty?: "strong" | "preferred" | "uncertain";
  /** A viable alternative and what sets it apart; only when there is a real one. */
  alternative?: { label: string; reason?: string } | null;
  /** The deeper reasoning (more reasons, the evidence), behind "Show reasoning". */
  details?: string[];
}

const CERTAINTY: Record<NonNullable<CoachCardProps["certainty"]>, string> = {
  strong: "Strong recommendation",
  preferred: "Preferred option",
  uncertain: "Uncertain: weigh the alternative",
};

const BASIS: Record<CoachCardProps["basis"], string> = {
  fact: "From this game's data",
  observation: "From your own games",
  hypothesis: "Coach's read of this game",
};

export function CoachCard({ headline, reasons, basis, adjustment = false, art, label = "Coach", certainty, alternative, details = [] }: CoachCardProps) {
  return (
    <section className={`coach-card${adjustment ? " coach-card-adjust" : ""}`} aria-label={adjustment ? "Coach adjustment" : label}>
      <div className="coach-card-label">{adjustment ? "Coach adjustment" : label}</div>
      <div className="coach-card-head">
        {art}
        <div className="coach-card-headline">{headline}</div>
      </div>
      {reasons[0] && <p className="coach-card-why">{reasons[0]}</p>}
      {alternative && <p className="coach-card-alt"><b>Alternative: {alternative.label}</b>{alternative.reason ? ` · ${alternative.reason}` : ""}</p>}
      {details.length > 0 && (
        <details className="coach-card-more">
          <summary>Show reasoning</summary>
          <ul>{details.map((d) => <li key={d}>{d}</li>)}</ul>
        </details>
      )}
      <div className="coach-card-basis">{BASIS[basis]}{certainty ? ` · ${CERTAINTY[certainty]}` : ""}</div>
    </section>
  );
}
