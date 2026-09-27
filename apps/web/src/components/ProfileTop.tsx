import { useId, useState } from "react";
import { api, type Overview, type OverviewRow, type RankPoint, type Stat } from "../api";
import { ChampionIcon, useSplash } from "../assets";
import { useSession } from "../session";
import { TIER_COLOR } from "./LpGains";
import { ago, num, roleLabel, SyntheticBadge } from "./ui";

const TIERS = ["IRON", "BRONZE", "SILVER", "GOLD", "PLATINUM", "EMERALD", "DIAMOND", "MASTER", "GRANDMASTER", "CHALLENGER"];
const DIV_NUM: Record<string, string> = { I: "1", II: "2", III: "3", IV: "4" };
const title = (t: string) => t.charAt(0) + t.slice(1).toLowerCase();
const apex = (t: string) => TIERS.indexOf(t) >= TIERS.indexOf("MASTER");
const pct1 = (x: number) => `${(x * 100).toFixed(1)}%`;

/** Win-rate colour steps, as on the reference: low pink, even white, high teal, very high blue. */
const wrClass = (wr: number) => (wr < 0.45 ? "v-bad" : wr < 0.55 ? "" : wr < 0.75 ? "v-good" : "v-great");

// ------------------------------------------------------------------ banner

export function ProfileBanner({ champion, synthetic, lastSyncedAt }: { champion: string | undefined; synthetic: boolean; lastSyncedAt: string | null }) {
  const splash = useSplash(champion);
  const { me, refresh } = useSession();
  const [busy, setBusy] = useState(false);
  const syncing = busy || !!me?.accounts.some((a) => a.sync.status === "syncing");
  return (
    <div className="pf-banner" style={splash ? { backgroundImage: `linear-gradient(90deg, var(--bg) 0%, rgb(23 18 51 / 0.55) 22%, rgb(23 18 51 / 0) 45%), linear-gradient(0deg, rgb(23 18 51 / 0.6), rgb(23 18 51 / 0) 45%), url(${splash})` } : undefined}>
      <div className="pf-refresh">
        <button type="button" className="pf-refresh-btn" disabled={syncing}
          onClick={async () => { setBusy(true); try { await api.syncAll(); await refresh(); } finally { setBusy(false); } }}>
          Refresh data
        </button>
        <span className="pf-refresh-status" aria-live="polite">
          {syncing ? "Updating your games…" : lastSyncedAt ? `Profile updated ${ago(Date.parse(lastSyncedAt))}` : "Not synced yet"}
        </span>
      </div>
      {synthetic && <span className="pf-banner-badge"><SyntheticBadge /></span>}
    </div>
  );
}

// ------------------------------------------------------------------ left card

/**
 * Riot's ranked emblem for the tier (the art the game client shows), served by CommunityDragon's
 * mirror of the client files. Unranked, or when the image can't load, the original outline crest.
 */
export const EMBLEM_BASE = "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-emblem";
export const emblemUrl = (tier: string) => `${EMBLEM_BASE}/emblem-${tier.toLowerCase()}.png`;

function RankEmblem({ tier }: { tier: string | null }) {
  const [failed, setFailed] = useState(false);
  if (!tier || !TIERS.includes(tier) || failed) return <Crest tier={failed ? tier : null} />;
  return (
    <span className="pf-emblem" aria-hidden="true">
      <img src={emblemUrl(tier)} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />
    </span>
  );
}

/** Original crest (not Riot art): a winged shield in the tier's colour; outline only when unranked. */
function Crest({ tier, size = 64 }: { tier: string | null; size?: number }) {
  const c = tier ? TIER_COLOR[tier] ?? "#8fa3bd" : "var(--text-muted)";
  return (
    <svg className="pf-crest" width={size} height={size * 0.8} viewBox="0 0 80 64" aria-hidden="true">
      <path d="M40 8 52 16v18c0 9-6 15-12 19-6-4-12-10-12-19V16z" fill={tier ? c : "none"} fillOpacity={tier ? 0.35 : 0} stroke={c} strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M40 16 46 20v13c0 5-3 9-6 11-3-2-6-6-6-11V20z" fill={tier ? c : "none"} fillOpacity={tier ? 0.8 : 0} stroke={tier ? "none" : c} strokeWidth="1.5" />
      {[1, -1].map((s) => (
        <g key={s} transform={s === -1 ? "translate(80 0) scale(-1 1)" : undefined} fill="none" stroke={c} strokeWidth="2.5" strokeLinecap="round">
          <path d="M26 20C16 18 8 22 4 30c8-2 14-1 20 2" />
          <path d="M26 30C18 30 12 34 9 41c6-3 12-3 17-1" />
          <path d="M27 39c-5 1-9 4-11 9 5-2 9-2 13-1" />
        </g>
      ))}
    </svg>
  );
}

export function ProfileCard({ gameName, tagLine, avatarChampion, chips, overview, selected, onSelect }: {
  gameName: string; tagLine: string | undefined; avatarChampion: string | undefined; chips: string[];
  overview: Overview | undefined; selected: number | null; onSelect: (queueId: number) => void;
}) {
  return (
    <section className="pf-card" aria-label="Player">
      <div className="pf-id">
        <span className="pf-avatar">{avatarChampion ? <ChampionIcon champion={avatarChampion} size={96} /> : null}</span>
        <h1 className="pf-name">{gameName}{tagLine && <span className="pf-tag"> #{tagLine}</span>}</h1>
        {chips.length > 0 && <div className="pf-tags">{chips.map((c) => <span key={c} className="pf-chip">{c}</span>)}</div>}
      </div>
      <div className="pf-queues" role="radiogroup" aria-label="Queue">
        {(overview?.queues ?? []).map((q) => {
          const wins = q.rank ? q.rank.wins : q.wins, losses = q.rank ? q.rank.losses : q.games - q.wins;
          const total = wins + losses;
          const can = q.games > 0;
          return (
            <button key={q.queueId} type="button" role="radio" aria-checked={selected === q.queueId} disabled={!can}
              title={can ? undefined : "No analyzed games in this queue yet"}
              className={`pf-queue${selected === q.queueId ? " is-on" : ""}`} onClick={() => onSelect(q.queueId)}>
              <RankEmblem tier={q.rank?.tier ?? null} />
              <span className="pf-queue-text">
                <span className="pf-queue-label">{q.label}</span>
                {q.rank && (
                  <span className="pf-queue-rank">
                    <b>{title(q.rank.tier)}{apex(q.rank.tier) ? "" : ` ${DIV_NUM[q.rank.division] ?? q.rank.division}`}</b>
                    <span className="pf-dot">·</span><span className="pf-lp">{q.rank.lp} LP</span>
                  </span>
                )}
                <span className="pf-wl">
                  {wins}<i>W</i> {losses}<i>L</i><span className="pf-dot">·</span><b>{total ? pct1(wins / total) : "—"}</b>
                </span>
                {total > 0 && (
                  <span className="pf-wl-bar" aria-hidden="true">
                    <span className="w" style={{ width: `${(100 * wins) / total}%` }} /><span className="l" />
                  </span>
                )}
              </span>
            </button>
          );
        })}
        {overview && overview.queues.length === 0 && <p className="tile-note" style={{ margin: 0, padding: "14px 16px" }}>No ranked or normal games analyzed yet.</p>}
      </div>
      {overview?.lpTrack.queue && <LpTracking history={overview.lpTrack.history} />}
    </section>
  );
}

/** Short division label ("G4", "S3", "M") of the division starting at `points`. */
function shortDiv(points: number) {
  const t = Math.floor(points / 400);
  if (t >= TIERS.indexOf("MASTER")) return "M";
  return `${(TIERS[t] ?? "?").charAt(0)}${4 - Math.floor((points % 400) / 100)}`;
}

/** The last 50 snapshots on the continuous ladder; the line takes the colour of the tier it is in. */
function LpTracking({ history }: { history: RankPoint[] }) {
  const points = history.filter((p): p is RankPoint & { points: number } => p.points !== null)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).slice(-51);
  const steps = points.length - 1;
  const perGame = points.slice(1).every((p) => p.lpChange !== null);
  if (points.length < 2) {
    return (
      <div className="pf-lptrack">
        <h2>LP progress tracking</h2>
        <p className="tile-note" style={{ margin: 0 }}>The line starts after your second rank snapshot.</p>
      </div>
    );
  }
  const W = 276, H = 100;
  const minP = Math.min(...points.map((p) => p.points)), maxP = Math.max(...points.map((p) => p.points));
  const lo = Math.floor(minP / 100) * 100, hi = Math.max(lo + 100, Math.ceil(maxP / 100) * 100);
  const x = (i: number) => (i / steps) * W;
  const y = (v: number) => 4 + ((hi - v) / (hi - lo)) * (H - 8);
  const divs: number[] = [];
  for (let v = lo; v <= hi; v += 100) divs.push(v);
  const tierOf = (v: number) => TIERS[Math.min(TIERS.indexOf("MASTER"), Math.floor(v / 400))] ?? "IRON";
  // Tier bands and line segments, one colour per tier.
  const bands: { tier: string; from: number; to: number }[] = [];
  for (let t = Math.floor(lo / 400); t * 400 < hi; t++) bands.push({ tier: TIERS[Math.min(t, 7)]!, from: Math.max(lo, t * 400), to: Math.min(hi, (t + 1) * 400) });
  const segs = points.slice(1).map((p, i) => ({ d: `M${x(i)},${y(points[i]!.points)}L${x(i + 1)},${y(p.points)}`, tier: tierOf(Math.min(p.points, points[i]!.points)) }));
  const label = perGame ? `last ${steps} games` : `last ${steps} snapshots`;
  return (
    <div className="pf-lptrack">
      <h2>LP progress tracking <span>{label}</span></h2>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`LP over the ${label}`}>
        {bands.map((b) => <rect key={b.tier} x={0} width={W} y={y(b.to)} height={y(b.from) - y(b.to)} fill={TIER_COLOR[b.tier]} opacity={0.14} />)}
        {divs.map((v) => (
          <g key={v}>
            <line x1={0} x2={W} y1={y(v)} y2={y(v)} stroke="var(--border-strong)" strokeDasharray="2 3" />
            {v < hi && <text x={3} y={y(v) - 3} fontSize="10" fontWeight="700" fill={TIER_COLOR[tierOf(v)]}>{shortDiv(v)}</text>}
          </g>
        ))}
        <line x1={W / 2} x2={W / 2} y1={0} y2={H} stroke="var(--border-strong)" strokeDasharray="2 3" />
        {segs.map((s, i) => <path key={i} d={s.d} stroke={TIER_COLOR[s.tier]} strokeWidth={1.6} fill="none" strokeLinecap="round" />)}
      </svg>
      <div className="pf-lptrack-axis"><span>{steps} {perGame ? "games" : "snapshots"} ago</span><span>{Math.round(steps / 2)}</span><span>{perGame ? "Last game" : "Latest"}</span></div>
    </div>
  );
}

// ------------------------------------------------------------------ right panel

const AXIS_ICON: Record<string, string> = {
  fighting: "M3 3l10 10M13 3 3 13M3 11l2 2M11 13l2-2",
  damage: "M8 1l1.8 4.2L14 4l-2.2 4L14 12l-4.2-1.2L8 15l-1.8-4.2L2 12l2.2-4L2 4l4.2 1.2z",
  laning: "M2 14 14 2M9 2h5v5M2 9v5h5",
  farming: "M8 2 14 13H2zM8 7v3",
  vision: "M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5zM8 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4z",
  survival: "M8 1 14 3v5c0 3.5-2.5 6-6 7-3.5-1-6-3.5-6-7V3z",
  early: "M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2zM8 5v3l2 2",
  economy: "M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2zM6 6h3a1.5 1.5 0 0 1 0 3H7a1.5 1.5 0 0 0 0 3h3M8 4v8",
};

function Radar({ row }: { row: OverviewRow }) {
  const [hover, setHover] = useState<string | null>(null);
  const tipId = useId();
  const R = 100, C = 150, n = row.radar.length;
  const pt = (i: number, r: number) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return [C + Math.cos(a) * r, C + Math.sin(a) * r] as const;
  };
  const ring = (r: number) => row.radar.map((_, i) => pt(i, r).join(",")).join(" ");
  const shape = row.radar.map((a, i) => pt(i, ((a.score ?? 0) / 100) * R).join(",")).join(" ");
  const h = row.radar.find((a) => a.id === hover);
  return (
    <div className="pf-radar">
      <svg viewBox="0 0 300 300" role="img" aria-describedby={tipId}
        aria-label={`Radar for ${row.kind === "role" ? roleLabel[row.name] ?? row.name : row.name}: ${row.radar.map((a) => `${a.label} ${a.score ?? "no data"}`).join(", ")}`}>
        {[1, 0.75, 0.5, 0.25].map((f, i) => <polygon key={f} points={ring(R * f)} fill={i % 2 ? "var(--surface-2)" : "var(--surface-3)"} stroke="var(--border)" strokeWidth={1} />)}
        {row.radar.map((_, i) => { const [x2, y2] = pt(i, R); return <line key={i} x1={C} y1={C} x2={x2} y2={y2} stroke="var(--border)" />; })}
        <polygon points={shape} fill="rgb(242 191 67 / 0.18)" stroke="var(--accent)" strokeWidth={1.8} strokeLinejoin="round" />
        {row.radar.map((a, i) => {
          const [ix, iy] = pt(i, R + 26);
          return (
            <g key={a.id} transform={`translate(${ix - 9} ${iy - 9})`} className="pf-axis" tabIndex={0}
              onPointerEnter={() => setHover(a.id)} onPointerLeave={() => setHover(null)} onFocus={() => setHover(a.id)} onBlur={() => setHover(null)}>
              <title>{a.label}</title>
              <rect width="18" height="18" fill="transparent" />
              <path d={AXIS_ICON[a.id] ?? ""} transform="translate(1 1)" fill="none" stroke={hover === a.id ? "var(--accent)" : "var(--text-primary)"} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
            </g>
          );
        })}
      </svg>
      <p id={tipId} className="pf-radar-tip" aria-live="polite">
        {h ? <><b>{h.label}</b>: {h.score === null ? "not enough games" : `${h.score}/100`} <span>({h.games} games)</span></> : "Hover an icon for its score."}
      </p>
    </div>
  );
}

export function RoleIcon({ role }: { role: string }) {
  const p: Record<string, string> = {
    TOP: "M2 2h9l-3 3H5v3L2 11zM14 5v9H5l3-3h3V8z",
    JUNGLE: "M8 1c3 3 4 7 0 14C4 8 5 4 8 1zM3 5c2 1 3 3 3 6M13 5c-2 1-3 3-3 6",
    MIDDLE: "M2 11l9-9h3v3l-9 9H2zM2 2h5L2 7zM14 14H9l5-5z",
    BOTTOM: "M14 14H5l3-3h3V8l3-3zM2 11V2h9L8 5H5v3z",
    UTILITY: "M8 3l2 3H6zM3 6h10l-3 3H6zM8 9l2 5H6z",
  };
  return <svg className="pf-role-ico" viewBox="0 0 16 16" aria-hidden="true"><path d={p[role] ?? "M3 3h10v10H3z"} fill="currentColor" fillRule="evenodd" /></svg>;
}

const kdaClass = (r: number) => (r < 2 ? "v-bad" : r >= 4 ? "v-good" : "");
const csClass = (c: number | null) => (c === null ? "" : c < 6 ? "v-bad" : c >= 7 ? "v-good" : "");
const kpClass = (k: number | null) => (k === null ? "" : k < 0.45 ? "v-bad" : "");

export function OverviewPanel({ overview, onAllChampions }: { overview: Overview | undefined; onAllChampions: () => void }) {
  const [pick, setPick] = useState(0);
  const rows = overview?.rows ?? [];
  const row = rows[Math.min(pick, rows.length - 1)];
  const info = useId();
  if (!overview) return <section className="pf-panel"><p className="tile-note" style={{ padding: 16 }}>Loading…</p></section>;
  return (
    <section className="pf-panel" aria-label="Overview for the selected queue">
      <div className="pf-panel-top">
        <div className="pf-gpi">
          <h2 className="pf-h"><SquareIcon />Radar
            <span className="spacer" />
            <span className="pf-info" tabIndex={0} aria-describedby={info}>i<span id={info} role="tooltip">Each point compares these games with all your analyzed games: 50 is your typical game, 100 better than all of them. Never compared with other players.</span></span>
          </h2>
          {row ? <Radar row={row} /> : <p className="tile-note" style={{ padding: 16 }}>No games in this queue yet.</p>}
        </div>
        <div className="pf-role-table">
          <h2 className="pf-h"><SquareIcon />Primary role overview
            <span className="spacer" />
            <button type="button" className="link-btn" onClick={onAllChampions}>See all champions ⇥</button>
          </h2>
          {rows.length === 0 ? <p className="tile-note" style={{ padding: 16 }}>No games with a role in this queue yet.</p> : (
            <div className="table-scroll">
              <table className="pf-rt">
                <thead><tr><th scope="col"><span className="sr-only">Show on the radar</span></th><th scope="col">Champions</th><th scope="col">Games</th><th scope="col">Win Rate</th><th scope="col">KDA</th><th scope="col">CS/M</th><th scope="col">{overview.lpColumn ? "LP" : "KP"}</th></tr></thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={`${r.kind}-${r.name}`} className={`${r.kind === "role" ? "is-role" : ""}${i === pick ? " is-picked" : ""}`} onClick={() => setPick(i)}>
                      <td><button type="button" className="pf-pick" aria-pressed={i === pick} aria-label={`Show ${r.kind === "role" ? roleLabel[r.name] : r.name} on the radar`} onClick={(e) => { e.stopPropagation(); setPick(i); }} /></td>
                      <td className="pf-rt-name">
                        {r.kind === "role" ? <><RoleIcon role={r.name} /><span>{roleLabel[r.name] ?? r.name}</span></> : <><ChampionIcon champion={r.championId ?? r.name} size={24} /><span>{r.name}</span></>}
                      </td>
                      <td>{r.games}</td>
                      <td className={wrClass(r.wins / r.games)}>{pct1(r.wins / r.games)}</td>
                      <td className="pf-kda">{num(r.kills)}<i>/</i>{num(r.deaths)}<i>/</i>{num(r.assists)} <span className={kdaClass(r.kda)}>({num(r.kda)})</span></td>
                      <td className={csClass(r.csPerMin)}>{num(r.csPerMin)}</td>
                      <td className="pf-small">{overview.lpColumn
                        ? (r.lp ? <span className={r.lp.value >= 0 ? "v-good" : "v-bad"} title={`${r.lp.games} games with a known LP change`}>{r.lp.value > 0 ? "+" : ""}{r.lp.value}</span> : "—")
                        : <span className={kpClass(r.killParticipation)}>{r.killParticipation === null ? "—" : pct1(r.killParticipation)}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      {row && <PerformanceTiles p={row.performance} />}
    </section>
  );
}

function SquareIcon() {
  return <svg className="pf-h-ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M1 1h14v14H1zM4 4v8h8V4z" fill="currentColor" fillRule="evenodd" /><path d="M6 6h4v4H6z" fill="currentColor" /></svg>;
}

function PerformanceTiles({ p }: { p: OverviewRow["performance"] }) {
  const signed = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}`;
  const tiles: [string, Stat, (v: number) => string, string][] = [
    ["GD@15", p.goldDiff15, signed, "Gold compared with your lane opponent at 15:00"],
    ["Gold Share", p.goldShare, pct1, "Your share of your team's gold"],
    ["Damage Share", p.damageShare, pct1, "Your share of your team's damage to champions"],
    ["DMG/M-D", p.damagePerMinDiff, signed, "Your damage per minute minus your lane opponent's"],
    ["Solo Deaths", p.soloDeaths, (v) => v.toFixed(1), "Deaths with no enemy assisting, per game"],
    ["Vision Score", p.visionScore, (v) => v.toFixed(1), "Vision score per game"],
  ];
  return (
    <div className="pf-perf-wrap">
      <h2 className="pf-h"><SquareIcon />Performance overview</h2>
      <div className="pf-perf">
        {tiles.map(([label, s, fmt, help]) => (
          <div key={label} className="pf-perf-tile" title={s ? `${help} · ${s.games} games` : `${help} · no data yet`}>
            <span className="pf-perf-value">{s ? fmt(s.value) : "—"}</span>
            <span className="pf-perf-label">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
