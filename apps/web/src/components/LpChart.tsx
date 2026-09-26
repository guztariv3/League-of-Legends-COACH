import { useId, useState } from "react";
import type { RankPoint } from "../api";

const TIERS = ["IRON", "BRONZE", "SILVER", "GOLD", "PLATINUM", "EMERALD", "DIAMOND", "MASTER", "GRANDMASTER", "CHALLENGER"];
const DIVISIONS = ["IV", "III", "II", "I"];
const title = (t: string) => t.charAt(0) + t.slice(1).toLowerCase();
export const rankLabel = (p: Pick<RankPoint, "tier" | "rank" | "lp">) =>
  `${title(p.tier)}${TIERS.indexOf(p.tier) >= TIERS.indexOf("MASTER") ? "" : ` ${p.rank}`} · ${p.lp} LP`;

/** Name of the division that starts at `points` on the continuous ladder (100 per division). */
function divisionAt(points: number): string {
  const t = Math.floor(points / 400);
  if (t >= TIERS.indexOf("MASTER")) return "Master+";
  return `${title(TIERS[t] ?? "")} ${DIVISIONS[Math.floor((points % 400) / 100)] ?? ""}`;
}

/**
 * LP over time on one continuous ladder (every division is 100 points), so promotions and
 * demotions read as one line. One series: the title names it, no legend. Points are the
 * snapshots we took after syncs; Riot doesn't provide older history.
 */
export function LpChart({ history, queue }: { history: RankPoint[]; queue: string }) {
  const points = history.filter((p): p is RankPoint & { points: number } => p.points !== null);
  const [active, setActive] = useState<number | null>(null);
  const titleId = useId();
  if (points.length < 2) {
    return <p className="tile-note" style={{ margin: 0 }}>We need at least two rank snapshots to draw the line. They are taken each time your games sync, starting from when you linked your account.</p>;
  }

  const W = 640, H = 220, L = 96, R = 12, T = 12, B = 28;
  const lo = Math.floor(Math.min(...points.map((p) => p.points)) / 100) * 100;
  const hi = Math.max(lo + 100, Math.ceil(Math.max(...points.map((p) => p.points)) / 100) * 100);
  const t0 = Date.parse(points[0]!.at), t1 = Date.parse(points.at(-1)!.at);
  const x = (i: number) => L + (points.length === 1 ? 0 : (i / (points.length - 1)) * (W - L - R));
  const y = (v: number) => T + ((hi - v) / (hi - lo)) * (H - T - B);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.points).toFixed(1)}`).join("");
  const step = Math.max(100, Math.ceil((hi - lo) / 400) * 100);
  const ticks: number[] = [];
  for (let v = lo; v <= hi; v += step) ticks.push(v);
  const a = active !== null ? points[active] : undefined;
  const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * W;
    setActive(Math.max(0, Math.min(points.length - 1, Math.round(((mx - L) / (W - L - R)) * (points.length - 1)))));
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") setActive((i) => Math.min(points.length - 1, (i ?? -1) + 1));
    if (e.key === "ArrowLeft") setActive((i) => Math.max(0, (i ?? points.length) - 1));
    if (e.key === "Escape") setActive(null);
  };

  return (
    <figure style={{ margin: 0 }}>
      <figcaption id={titleId} className="tile-label" style={{ marginBottom: 8 }}>
        {queue}: rank after each sync ({day(points[0]!.at)} – {day(points.at(-1)!.at)})
      </figcaption>
      <div className="chart-wrap">
        <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={titleId} tabIndex={0}
          onPointerMove={onMove} onPointerLeave={() => setActive(null)} onKeyDown={onKey} onBlur={() => setActive(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth={1} strokeDasharray="2 4" />
              <text x={L - 8} y={y(t) + 4} textAnchor="end" fill="var(--text-muted)" fontSize="11">{divisionAt(t)}</text>
            </g>
          ))}
          <path d={path} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {points.length <= 40 && points.map((p, i) => <circle key={p.at} cx={x(i)} cy={y(p.points)} r={3} fill="var(--series-1)" />)}
          {a && (
            <g>
              <line x1={x(active!)} x2={x(active!)} y1={T} y2={H - B} stroke="var(--text-muted)" strokeWidth={1} />
              <circle cx={x(active!)} cy={y(a.points)} r={5} fill="var(--series-1)" stroke="var(--surface-1)" strokeWidth={2} />
            </g>
          )}
          <text x={L} y={H - 8} fill="var(--text-muted)" fontSize="11">{day(points[0]!.at)}</text>
          {t1 > t0 && <text x={W - R} y={H - 8} textAnchor="end" fill="var(--text-muted)" fontSize="11">{day(points.at(-1)!.at)}</text>}
        </svg>
        {a && (
          <div className="chart-tooltip" role="status" style={{ left: `${Math.min(70, (x(active!) / W) * 100)}%`, top: 4 }}>
            <strong>{rankLabel(a)}</strong>
            <span style={{ color: "var(--text-muted)" }}> · {day(a.at)}{a.lpChange !== null ? ` · ${a.lpChange > 0 ? "+" : ""}${a.lpChange} LP` : ""}</span>
          </div>
        )}
      </div>
      <details className="layer">
        <summary>View as table</summary>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Date</th><th>Rank</th><th>Change</th><th>Wins – losses</th></tr></thead>
            <tbody>{[...points].reverse().map((p) => (
              <tr key={p.at}><td>{day(p.at)}</td><td>{rankLabel(p)}</td><td>{p.lpChange === null ? "—" : `${p.lpChange > 0 ? "+" : ""}${p.lpChange}`}</td><td>{p.wins} – {p.losses}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
