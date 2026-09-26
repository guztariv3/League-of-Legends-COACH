import { useId, useMemo, useState } from "react";
import type { MatchDetail } from "../api";

/**
 * Gold difference vs lane opponent over time. One series (polarity around zero),
 * so the title names it and no legend box is needed. Includes crosshair +
 * tooltip, keyboard navigation and a table view (dataviz skill rules).
 */
export function GoldDiffChart({ curve, events }: { curve: NonNullable<MatchDetail["goldCurve"]>; events: MatchDetail["myEvents"] }) {
  const points = useMemo(
    () => curve.filter((p) => p.opponent !== null).map((p) => ({ minute: p.minute, diff: p.me - (p.opponent ?? 0) })),
    [curve],
  );
  const [active, setActive] = useState<number | null>(null);
  const titleId = useId();

  if (points.length < 2) {
    return <p className="page-sub">There is no identifiable lane opponent in this game, so the gold difference is not shown.</p>;
  }

  const W = 640, H = 220, L = 52, R = 12, T = 12, B = 28;
  const maxAbs = Math.max(500, ...points.map((p) => Math.abs(p.diff)));
  const step = maxAbs > 4000 ? 2000 : maxAbs > 2000 ? 1000 : 500;
  const top = Math.ceil(maxAbs / step) * step;
  const lastMin = points[points.length - 1]!.minute;
  const x = (m: number) => L + (m / Math.max(1, lastMin)) * (W - L - R);
  const y = (v: number) => T + ((top - v) / (2 * top)) * (H - T - B);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(p.minute).toFixed(1)},${y(p.diff).toFixed(1)}`).join("");
  const ticks = [-top, -top / 2, 0, top / 2, top];
  const deaths = new Set((events ?? []).filter((e) => e.type === "death").map((e) => e.minute + 1));
  const a = active !== null ? points[active] : undefined;
  const fmt = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v).toLocaleString("en-US")}`;

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * W;
    const minute = ((mx - L) / (W - L - R)) * lastMin;
    let best = 0;
    points.forEach((p, i) => { if (Math.abs(p.minute - minute) < Math.abs(points[best]!.minute - minute)) best = i; });
    setActive(best);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") setActive((i) => Math.min(points.length - 1, (i ?? -1) + 1));
    if (e.key === "ArrowLeft") setActive((i) => Math.max(0, (i ?? points.length) - 1));
    if (e.key === "Escape") setActive(null);
  };

  return (
    <figure style={{ margin: 0 }}>
      <figcaption id={titleId} className="tile-label" style={{ marginBottom: 8 }}>
        Gold difference vs your lane opponent (per minute)
      </figcaption>
      <div className="chart-wrap">
        <svg
          className="chart"
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-labelledby={titleId}
          tabIndex={0}
          onPointerMove={onMove}
          onPointerLeave={() => setActive(null)}
          onKeyDown={onKey}
          onBlur={() => setActive(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--text-muted)" : "var(--grid)"} strokeWidth={t === 0 ? 1.5 : 1} strokeDasharray={t === 0 ? undefined : "2 4"} />
              <text x={L - 8} y={y(t) + 4} textAnchor="end" fill="var(--text-muted)" fontSize="11">{t === 0 ? "0" : fmt(t)}</text>
            </g>
          ))}
          {[0, 5, 10, 15, 20, 25, 30, 35, 40].filter((m) => m <= lastMin).map((m) => (
            <text key={m} x={x(m)} y={H - 8} textAnchor="middle" fill="var(--text-muted)" fontSize="11">{m}′</text>
          ))}
          <path d={path} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {points.filter((p) => deaths.has(p.minute)).map((p) => (
            <circle key={p.minute} cx={x(p.minute)} cy={y(p.diff)} r={4.5} fill="var(--surface-1)" stroke="var(--text-secondary)" strokeWidth={2}>
              <title>You died at minute {p.minute - 1}</title>
            </circle>
          ))}
          {a && (
            <g>
              <line x1={x(a.minute)} x2={x(a.minute)} y1={T} y2={H - B} stroke="var(--text-muted)" strokeWidth={1} />
              <circle cx={x(a.minute)} cy={y(a.diff)} r={5} fill="var(--series-1)" stroke="var(--surface-1)" strokeWidth={2} />
            </g>
          )}
        </svg>
        {a && (
          <div className="chart-tooltip" role="status" style={{ left: `${Math.min(80, (x(a.minute) / W) * 100)}%`, top: 4 }}>
            <strong>{fmt(a.diff)} gold</strong>
            <span style={{ color: "var(--text-muted)" }}> · minute {a.minute}{deaths.has(a.minute) ? " · you died" : ""}</span>
          </div>
        )}
      </div>
      <details className="layer">
        <summary>View as table</summary>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Minute</th><th>Gold difference</th></tr></thead>
            <tbody>{points.map((p) => <tr key={p.minute}><td>{p.minute}</td><td>{fmt(p.diff)}</td></tr>)}</tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
