import { useId, useMemo, useState } from "react";
import { Link } from "react-router";
import type { MatchRow, RankPoint } from "../api";
import { ChampionIcon } from "../assets";
import { rankLabel } from "./LpChart";
import { num, pct } from "./ui";

const TIERS = ["IRON", "BRONZE", "SILVER", "GOLD", "PLATINUM", "EMERALD", "DIAMOND", "MASTER", "GRANDMASTER", "CHALLENGER"];
const TIER_COLOR: Record<string, string> = {
  IRON: "#7b7b8f", BRONZE: "#a0674a", SILVER: "#8fa3bd", GOLD: "#d4a64a", PLATINUM: "#3fb6a8",
  EMERALD: "#3fbf74", DIAMOND: "#6b8cff", MASTER: "#b36bff", GRANDMASTER: "#ff5a5a", CHALLENGER: "#f2d36b",
};
const QUEUE_ID = { RANKED_SOLO_5x5: 420, RANKED_FLEX_SR: 440 } as const;
const title = (t: string) => t.charAt(0) + t.slice(1).toLowerCase();
const day = (iso: string | number) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const signed = (x: number) => `${x > 0 ? "+" : ""}${x}`;

/** Short label of the division starting at `points` (100 per division): "G1", "P4", "M". */
function shortDivision(points: number): string {
  const t = Math.floor(points / 400);
  if (t >= TIERS.indexOf("MASTER")) return "M";
  return `${(TIERS[t] ?? "?").charAt(0)}${4 - Math.floor((points % 400) / 100)}`;
}

type Point = RankPoint & { points: number };

/**
 * LP after each rank snapshot on one continuous ladder (100 points per division), over
 * bands tinted by tier. Pick a point (pointer, tap or arrow keys) to see what changed and
 * the ranked games played since the previous snapshot. One series, so no legend.
 */
export function LpGains({ history, queueType, queue, matches }: {
  history: RankPoint[];
  queueType: keyof typeof QUEUE_ID;
  queue: string;
  matches: MatchRow[];
}) {
  const points = useMemo(() => history.filter((p): p is Point => p.points !== null), [history]);
  const [picked, setPicked] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const titleId = useId();

  if (points.length < 2) {
    return (
      <p className="tile-note" style={{ margin: 0 }}>
        We need at least two rank snapshots to draw the line. One is taken each time your games sync, starting when you linked your account.
      </p>
    );
  }

  const W = 880, H = 360, L = 44, R = 14, T = 14, B = 44;
  const minP = Math.min(...points.map((p) => p.points)), maxP = Math.max(...points.map((p) => p.points));
  const lo = Math.max(0, Math.floor(minP / 100) * 100 - 50);
  const hi = Math.max(lo + 200, Math.ceil(maxP / 100) * 100 + 50);
  const x = (i: number) => L + (i / (points.length - 1)) * (W - L - R);
  const y = (v: number) => T + ((hi - v) / (hi - lo)) * (H - T - B);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.points).toFixed(1)}`).join("");

  const divisions: number[] = [];
  for (let v = Math.ceil(lo / 100) * 100; v <= hi; v += 100) divisions.push(v);
  const bands = TIERS.map((t, i) => ({ t, from: i * 400, to: t === "MASTER" ? 1e9 : (i + 1) * 400 }))
    .filter((b) => b.to > lo && b.from < hi && TIERS.indexOf(b.t) <= TIERS.indexOf("MASTER"));
  const xTicks = [...new Set([0, Math.round((points.length - 1) / 3), Math.round((2 * (points.length - 1)) / 3), points.length - 1])];

  const sel = picked ?? points.length - 1;
  const shown = hover ?? sel;
  const cur = points[sel]!;
  const prev = points[sel - 1];
  const queueId = QUEUE_ID[queueType];
  const between = matches
    .filter((m) => m.queueId === queueId && m.startedAt <= Date.parse(cur.at) && (!prev || m.startedAt > Date.parse(prev.at)))
    .sort((a, b) => b.startedAt - a.startedAt);
  const gamesBetween = prev ? cur.wins + cur.losses - (prev.wins + prev.losses) : null;
  const change = prev ? cur.points - prev.points : null;
  const one = gamesBetween === 1 ? between[0] : undefined;

  const indexAt = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * W;
    return Math.max(0, Math.min(points.length - 1, Math.round(((mx - L) / (W - L - R)) * (points.length - 1))));
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") { e.preventDefault(); setPicked(Math.min(points.length - 1, sel + 1)); }
    if (e.key === "ArrowLeft") { e.preventDefault(); setPicked(Math.max(0, sel - 1)); }
    if (e.key === "Home") setPicked(0);
    if (e.key === "End") setPicked(points.length - 1);
  };

  return (
    <div className="lp-gains">
      <figure className="lp-chart">
        <figcaption id={titleId} className="sr-only">
          {queue}: rank after each snapshot, {day(points[0]!.at)} to {day(points.at(-1)!.at)}. Use the arrow keys to move between points.
        </figcaption>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={titleId} tabIndex={0}
          onPointerMove={(e) => setHover(indexAt(e))} onPointerLeave={() => setHover(null)}
          onClick={(e) => setPicked(indexAt(e as unknown as React.PointerEvent<SVGSVGElement>))} onKeyDown={onKey}>
          <defs>
            <clipPath id={`${titleId}-clip`}><rect x={L} y={T} width={W - L - R} height={H - T - B} /></clipPath>
          </defs>
          <g clipPath={`url(#${titleId}-clip)`}>
            {bands.map((b) => (
              <rect key={b.t} x={L} width={W - L - R} y={y(Math.min(hi, b.to))} height={y(Math.max(lo, b.from)) - y(Math.min(hi, b.to))} fill={TIER_COLOR[b.t]} opacity={0.1} />
            ))}
          </g>
          {divisions.map((v) => (
            <g key={v}>
              <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--grid)" strokeDasharray="3 5" />
              <text x={L - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fontWeight="700" fill={TIER_COLOR[TIERS[Math.floor(v / 400)] ?? "MASTER"]}>{shortDivision(v)}</text>
            </g>
          ))}
          {xTicks.map((i) => (
            <g key={i}>
              <line x1={x(i)} x2={x(i)} y1={T} y2={H - B} stroke="var(--grid)" strokeDasharray="3 5" />
              <text x={x(i)} y={H - B + 18} textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"} fontSize="11" fill="var(--text-muted)">{day(points[i]!.at)}</text>
            </g>
          ))}
          <path d={path} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {points.length <= 60 && points.map((p, i) => <circle key={p.at} cx={x(i)} cy={y(p.points)} r={3} fill="var(--accent)" />)}
          <line x1={x(shown)} x2={x(shown)} y1={T} y2={H - B} stroke="var(--text-secondary)" strokeWidth={1} />
          <circle cx={x(sel)} cy={y(cur.points)} r={6} fill="var(--text-primary)" stroke="var(--accent)" strokeWidth={2} />
          {hover !== null && hover !== sel && <circle cx={x(hover)} cy={y(points[hover]!.points)} r={5} fill="var(--accent)" stroke="var(--surface-1)" strokeWidth={2} />}
        </svg>
        {hover !== null && hover !== sel && (
          <div className="chart-tooltip" style={{ left: `${Math.min(72, (x(hover) / W) * 100)}%`, top: 8 }}>
            <strong>{rankLabel(points[hover]!)}</strong> <span className="quiet-num">· {day(points[hover]!.at)}</span>
          </div>
        )}
      </figure>

      <aside className="lp-detail" aria-live="polite" aria-label="Selected point">
        <div className="row" style={{ gap: 8 }}>
          {one ? <span className={`result-pill ${one.win ? "is-win" : "is-loss"}`}>{one.win ? "Victory" : "Defeat"}</span> : <span className="result-pill">Snapshot</span>}
          <span className="spacer" />
          <span className="tile-note">{day(cur.at)}</span>
        </div>
        {one && (
          <div className="lp-matchup">
            <span className="lp-champ"><ChampionIcon champion={one.championId ?? one.championName} size={48} className="portrait" />{one.championName}</span>
            <span className="tile-note">vs</span>
            <span className="lp-champ">{one.opponent ? <><ChampionIcon champion={one.opponent} size={48} className="portrait" />{one.opponent}</> : <span className="tile-note">Opponent unknown</span>}</span>
          </div>
        )}
        <div className="lp-change">
          {change === null ? <span className="tile-note">First snapshot</span> : (
            <><span className={change >= 0 ? "num-good" : "num-bad"}>{signed(change)}</span><small>LP</small></>
          )}
        </div>
        <dl className="lp-facts">
          <dt>Rank</dt><dd><span style={{ color: TIER_COLOR[cur.tier] }}>{title(cur.tier)}{cur.rank && TIERS.indexOf(cur.tier) < TIERS.indexOf("MASTER") ? ` ${cur.rank}` : ""}</span> · {cur.lp} LP</dd>
          <dt>Season</dt><dd>{cur.wins}W {cur.losses}L · {pct(cur.wins / Math.max(1, cur.wins + cur.losses))}</dd>
          {one && <>
            <dt>KDA</dt><dd>{one.kills} / {one.deaths} / {one.assists} <span className="quiet-num">({num(one.kda, 1)})</span></dd>
            <dt>CS</dt><dd>{one.cs}{one.csPerMin !== null && <span className="quiet-num"> ({num(one.csPerMin)})</span>}</dd>
            {one.killParticipation !== null && <><dt>KP</dt><dd>{pct(one.killParticipation)}</dd></>}
            {one.visionPerMin !== null && <><dt>Vision</dt><dd>{num(one.visionPerMin)}/min</dd></>}
          </>}
        </dl>
        {one ? <Link to={`/matches/${encodeURIComponent(one.matchId)}`} className="btn btn-primary" style={{ alignSelf: "flex-start" }}>Match details</Link> : prev && (
          <p className="tile-note" style={{ margin: 0 }}>
            {gamesBetween === 0 ? "No ranked games between these snapshots." : `${gamesBetween ?? "Several"} ranked games between these snapshots, so the change is not split per game.`}
            {between.length > 0 && <> Games: {between.slice(0, 5).map((m, i) => <span key={m.matchId}>{i ? ", " : ""}<Link to={`/matches/${encodeURIComponent(m.matchId)}`}>{m.championName} ({m.win ? "W" : "L"})</Link></span>)}.</>}
          </p>
        )}
        <p className="tile-note" style={{ margin: "auto 0 0" }}>Click any point on the graph to see what changed.</p>
      </aside>

      <details className="layer lp-table">
        <summary>View as table</summary>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Date</th><th>Rank</th><th>Change</th><th>Wins – losses</th></tr></thead>
            <tbody>{[...points].reverse().map((p) => (
              <tr key={p.at}><td>{day(p.at)}</td><td>{rankLabel(p)}</td><td>{p.lpChange === null ? "—" : signed(p.lpChange)}</td><td>{p.wins} – {p.losses}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

export { TIER_COLOR };
