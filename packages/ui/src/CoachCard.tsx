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
}

const BASIS: Record<CoachCardProps["basis"], string> = {
  fact: "From this game's data",
  observation: "From your own games",
  hypothesis: "Coach's read of this game",
};

export function CoachCard({ headline, reasons, basis, adjustment = false, art, label = "Coach" }: CoachCardProps) {
  return (
    <section className={`coach-card${adjustment ? " coach-card-adjust" : ""}`} aria-label={adjustment ? "Coach adjustment" : label}>
      <div className="coach-card-label">{adjustment ? "Coach adjustment" : label}</div>
      <div className="coach-card-head">
        {art}
        <div className="coach-card-headline">{headline}</div>
      </div>
      {reasons[0] && <p className="coach-card-why">{reasons[0]}</p>}
      <div className="coach-card-basis">{BASIS[basis]}</div>
    </section>
  );
}
