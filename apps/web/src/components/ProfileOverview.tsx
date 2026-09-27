import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { api, type GameCard, type OverviewGames, type SummaryGroup } from "../api";
import { ChampionIcon, ItemIcon, RuneIcon, SpellIcon } from "../assets";
import { useLoad } from "../session";
import { RoleIcon } from "./ProfileTop";
import { ErrorNotice, Loading, num, roleLabel } from "./ui";

const QUEUES: [string, string][] = [["", "All Queues"], ["420", "Ranked Solo"], ["440", "Ranked Flex"], ["400", "Normal Draft"], ["430", "Normal Blind"], ["450", "ARAM"]];
const ROLES = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];
const pct1 = (x: number) => `${(x * 100).toFixed(1)}%`;
const wrClass = (wr: number) => (wr < 0.45 ? "v-bad" : wr < 0.55 ? "" : wr < 0.75 ? "v-good" : "v-great");
const kdaClass = (r: number) => (r < 2 ? "v-bad" : r >= 4 ? "v-good" : "");
const agoShort = (t: number) => {
  const m = Math.round((Date.now() - t) / 60_000);
  if (m < 60) return `${Math.max(1, m)}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
};

/**
 * The profile's Overview tab: filters (queue, role, champion), activity and roles on the
 * left, a summary of the last 10 games and the game cards on the right.
 */
export function ProfileOverview() {
  const [params, setParams] = useSearchParams();
  const gq = params.get("gq") ?? "", role = params.get("grole") ?? "", champ = params.get("gchamp") ?? "";
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(window.location.search);
    if (v) next.set(k, v); else next.delete(k);
    setParams(next, { replace: true });
  };
  const query: Record<string, string> = {};
  if (gq) query.queue = gq;
  if (role) query.role = role;
  if (champ) query.champion = champ;
  const data = useLoad(() => api.overviewGames(query), [gq, role, champ]);
  const [champText, setChampText] = useState(champ);

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="ov-filters" role="search" aria-label="Game filters">
        <label className="sr-only" htmlFor="ov-queue">Queue</label>
        <select id="ov-queue" className="ov-select" value={gq} onChange={(e) => set("gq", e.target.value)}>
          {QUEUES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <div className="ov-roles" role="radiogroup" aria-label="Role">
          <button type="button" role="radio" aria-checked={!role} aria-label="All roles" className={!role ? "is-on" : ""} onClick={() => set("grole", "")}>
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1v14M2 4l12 8M14 4 2 12" stroke="currentColor" strokeWidth="2" /></svg>
          </button>
          {ROLES.map((r) => (
            <button key={r} type="button" role="radio" aria-checked={role === r} aria-label={roleLabel[r]} title={roleLabel[r]} className={role === r ? "is-on" : ""} onClick={() => set("grole", r)}>
              <RoleIcon role={r} />
            </button>
          ))}
        </div>
        <form className="ov-champ" onSubmit={(e) => { e.preventDefault(); set("gchamp", champText.trim()); }}>
          <label className="sr-only" htmlFor="ov-champ">Filter by champion</label>
          <input id="ov-champ" list="ov-champs" placeholder="Filter by champion…" value={champText}
            onChange={(e) => { setChampText(e.target.value); if (data.data?.champions.includes(e.target.value) || e.target.value === "") set("gchamp", e.target.value); }} />
          <datalist id="ov-champs">{(data.data?.champions ?? []).map((c) => <option key={c} value={c} />)}</datalist>
        </form>
        <button type="button" className="ov-reset" aria-label="Reset filters" title="Reset filters"
          onClick={() => { setChampText(""); const next = new URLSearchParams(window.location.search); ["gq", "grole", "gchamp"].forEach((k) => next.delete(k)); setParams(next, { replace: true }); }}>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8a5 5 0 1 0 1.5-3.5M3 2v3h3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
        </button>
      </div>

      {data.error ? <ErrorNotice error={data.error} /> : !data.data ? <Loading /> : (
        <div className="pf-overview">
          <aside className="stack" style={{ gap: 16 }}>
            <ActivityCard a={data.data.activity} />
            <TopRoles roles={data.data.roles} />
          </aside>
          <div className="stack" style={{ gap: 16 }}>
            <RecentSummary s={data.data.summary} />
            <GameList cards={data.data.cards} total={data.data.total} />
          </div>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ recent activity

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;
const longDate = (d: Date) => `${ordinal(d.getDate())} ${d.toLocaleDateString("en-US", { month: "long" })} ${d.getFullYear()}`;
const hm = (sec: number) => `${Math.floor(sec / 3600)}h ${Math.round((sec % 3600) / 60)}m`;

/** Day colour from its record: pink (mostly losses) → white → teal → blue (mostly wins). */
const resultStep = (wins: number, games: number) => {
  const wr = games ? wins / games : 0.5;
  return wr < 0.4 ? 0 : wr <= 0.5 ? 1 : wr < 0.75 ? 2 : 3;
};
/** Brightness from how many games: 1 game dim, 7 or more full. */
const volume = (games: number) => 0.35 + 0.65 * Math.min(1, (games - 1) / 6);

function ActivityCard({ a }: { a: OverviewGames["activity"] }) {
  const [hover, setHover] = useState<{ key: string; x: number; y: number } | null>(null);
  const { weeks, byDay, months } = useMemo(() => {
    const byDay = new Map<string, { date: Date; games: number; wins: number; losses: number; sec: number }>();
    for (const g of a.list) {
      const d = new Date(g.t);
      const k = dayKey(d);
      const e = byDay.get(k) ?? { date: new Date(d.getFullYear(), d.getMonth(), d.getDate()), games: 0, wins: 0, losses: 0, sec: 0 };
      e.games++; e.sec += g.durationSec;
      if (g.analyzable) { if (g.win) e.wins++; else e.losses++; }
      byDay.set(k, e);
    }
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - a.days + 1);
    start.setDate(start.getDate() - start.getDay());
    const weeks: Date[][] = [];
    for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
      if (d.getDay() === 0) weeks.push([]);
      weeks.at(-1)!.push(new Date(d));
    }
    const months: { i: number; label: string }[] = [];
    weeks.forEach((w, i) => {
      const first = w.find((d) => d.getDate() <= 7);
      if (first && first.getDate() <= 7 && !months.some((m) => m.label === first.toLocaleDateString("en-US", { month: "short" }))) {
        months.push({ i, label: first.toLocaleDateString("en-US", { month: "short" }) });
      }
    });
    return { weeks, byDay, months };
  }, [a]);
  const h = hover ? byDay.get(hover.key) : undefined;

  return (
    <section className="card ov-card" aria-labelledby="h-activity">
      <h2 id="h-activity" className="ov-h">Recent activity <span>Last {a.days} Days</span></h2>
      <div className="ov-cal-wrap" onPointerLeave={() => setHover(null)}>
        <div className="ov-cal" style={{ gridTemplateColumns: `28px repeat(${weeks.length}, minmax(0, 1fr))` }} role="grid" aria-label={`Games per day, last ${a.days} days`}>
          <span />
          {weeks.map((_, i) => <span key={i} className="ov-cal-month">{months.find((m) => m.i === i)?.label ?? ""}</span>)}
          {DOW.map((dow, r) => (
            <div key={dow} role="row" style={{ display: "contents" }}>
              <span className="ov-cal-dow">{dow}</span>
              {weeks.map((w, ci) => {
                const d = w.find((x) => x.getDay() === r);
                if (!d) return <span key={ci} />;
                const e = byDay.get(dayKey(d));
                const label = e ? `${longDate(d)}: ${e.wins}–${e.losses}, ${hm(e.sec)} played` : `${longDate(d)}: no games`;
                return (
                  <span key={ci} role="gridcell" aria-label={label} tabIndex={e ? 0 : -1}
                    className={`ov-day${e ? ` s${resultStep(e.wins, e.wins + e.losses)}` : ""}`}
                    style={e ? { opacity: volume(e.games) } : undefined}
                    onPointerEnter={(ev) => e && setHover({ key: dayKey(d), x: (ev.currentTarget as HTMLElement).offsetLeft, y: (ev.currentTarget as HTMLElement).offsetTop })}
                    onFocus={(ev) => e && setHover({ key: dayKey(d), x: ev.currentTarget.offsetLeft, y: ev.currentTarget.offsetTop })}
                    onBlur={() => setHover(null)} />
                );
              })}
            </div>
          ))}
        </div>
        {h && hover && (
          <div className="ov-tip" role="status" style={{ left: Math.min(hover.x, 120), top: hover.y - 118 }}>
            <dl>
              <dt>Date:</dt><dd>{longDate(h.date)}</dd>
              <dt>Time Played:</dt><dd>{hm(h.sec)}</dd>
              <dt>Record:</dt><dd>{h.wins} — {h.losses}</dd>
              <dt>Win rate:</dt><dd className={h.wins + h.losses ? wrClass(h.wins / (h.wins + h.losses)) : ""}>{h.wins + h.losses ? pct1(h.wins / (h.wins + h.losses)) : "—"}</dd>
            </dl>
          </div>
        )}
      </div>
      <div className="ov-cal-foot">
        <span><b>{a.games}</b> games played</span>
        <span className="ov-legend">bad day {[0, 1, 2, 3].map((s) => <i key={s} className={`ov-day s${s}`} />)} good day</span>
        <span><b>{a.hours}</b> hours played</span>
        <span className="ov-legend">1 game {[0.35, 0.57, 0.78, 1].map((o) => <i key={o} className="ov-day s1" style={{ opacity: o }} />)} 7+ games</span>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ top roles

function TopRoles({ roles }: { roles: OverviewGames["roles"] }) {
  const max = Math.max(1, ...roles.flatMap((r) => [r.wins, r.games - r.wins]));
  return (
    <section className="card ov-card" aria-labelledby="h-roles">
      <h2 id="h-roles" className="ov-h">Top roles</h2>
      <div className="ov-roles-chart" role="list">
        {roles.map((r) => (
          <div key={r.role} className="ov-role" role="listitem" aria-label={`${roleLabel[r.role]}: ${r.games} games, ${r.wins} wins`}>
            <div className="ov-role-bars" aria-hidden="true">
              <span className="w" style={{ height: `${(100 * r.wins) / max}%` }} />
              <span className="l" style={{ height: `${(100 * (r.games - r.wins)) / max}%` }} />
            </div>
            <RoleIcon role={r.role} />
            <span className="ov-role-games">{r.games}</span>
            <span className="ov-role-wr">{r.games ? pct1(r.wins / r.games) : "—"}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ recent summary

function Kda({ g }: { g: SummaryGroup }) {
  return <span className="ov-kda">{num(g.kills)}<i>/</i>{num(g.deaths)}<i>/</i>{num(g.assists)} <span>(<b className={kdaClass(g.kda)}>{num(g.kda)}</b>)</span> <small>KDA</small></span>;
}

function RecentSummary({ s }: { s: OverviewGames["summary"] }) {
  const n = s.games.length;
  if (!n) return <section className="card ov-card"><h2 className="ov-h">Recent summary</h2><p className="tile-note" style={{ margin: 0 }}>No games with these filters.</p></section>;
  return (
    <section className="card ov-card ov-summary" aria-labelledby="h-summary">
      <h2 id="h-summary" className="ov-h">Recent summary <span>last {n} games</span></h2>
      <div className="ov-sum-top">
        <div className="ov-sum-block">
          <span className="ov-wl">{s.wins}<i>W</i> {n - s.wins}<i>L</i> <span className="pf-dot">·</span><b className={wrClass(s.wins / n)}>{pct1(s.wins / n)}</b></span>
          <span className="pf-wl-bar" aria-hidden="true"><span className="w" style={{ width: `${(100 * s.wins) / n}%` }} /><span className="l" /></span>
        </div>
        <div className="ov-sum-block"><Kda g={s} /></div>
        {s.role && (
          <div className="ov-sum-block ov-sum-with">
            <RoleIcon role={s.role.role} />
            <span><span className="ov-wl">{s.role.wins}<i>W</i> {s.role.games - s.role.wins}<i>L</i> <span className="pf-dot">·</span><b className={wrClass(s.role.wins / s.role.games)}>{pct1(s.role.wins / s.role.games)}</b></span><Kda g={s.role} /></span>
          </div>
        )}
        {s.champions.map((c) => (
          <div key={c.name} className="ov-sum-block ov-sum-with">
            <ChampionIcon champion={c.championId ?? c.name} size={36} />
            <span><span className="ov-wl">{c.wins}<i>W</i> {c.games - c.wins}<i>L</i> <span className="pf-dot">·</span><b className={wrClass(c.wins / c.games)}>{pct1(c.wins / c.games)}</b></span><Kda g={c} /></span>
          </div>
        ))}
      </div>
      <ul className="ov-sum-games">
        {s.games.map((g) => (
          <li key={g.matchId}>
            <Link to={`/matches/${encodeURIComponent(g.matchId)}`} className={g.win ? "is-win" : "is-loss"} title={`${g.championName}: ${g.win ? "win" : "loss"}`}>
              <ChampionIcon champion={g.championId ?? g.championName} size={40} />
              <span className="ov-sg-kda">{g.kills} / {g.deaths} / {g.assists}</span>
              <span className="tile-note">{agoShort(g.startedAt)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ------------------------------------------------------------------ games

function dayLabel(t: number) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(t); d.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - d.getTime()) / 86_400_000);
  return diff <= 0 ? "Today" : diff === 1 ? "A day ago" : `${diff} days ago`;
}

function GameList({ cards, total }: { cards: GameCard[]; total: number }) {
  const groups: { label: string; cards: GameCard[] }[] = [];
  for (const c of cards) {
    const label = dayLabel(c.startedAt);
    const g = groups.find((x) => x.label === label);
    if (g) g.cards.push(c); else groups.push({ label, cards: [c] });
  }
  if (!cards.length) return <p className="page-sub" style={{ margin: 0 }}>No games with these filters.</p>;
  return (
    <section className="stack" aria-label="Games" style={{ gap: 14 }}>
      {groups.map((g) => {
        const counted = g.cards.filter((c) => c.analyzable);
        const w = counted.filter((c) => c.win).length;
        return (
          <div key={g.label} className="stack" style={{ gap: 8 }}>
            <p className="ov-day-h">{g.label} <span>· {w}W {counted.length - w}L · <b className={counted.length ? wrClass(w / counted.length) : ""}>{counted.length ? pct1(w / counted.length) : "—"}</b></span></p>
            {g.cards.map((c) => <GameCardView key={c.matchId} c={c} />)}
          </div>
        );
      })}
      {total > cards.length && <Link to="/matches" className="ov-more">See all {total} games</Link>}
    </section>
  );
}

function GameCardView({ c }: { c: GameCard }) {
  const result = !c.analyzable ? "remake" : c.win ? "win" : "loss";
  const blue = c.players.filter((p) => p.teamId === 100), red = c.players.filter((p) => p.teamId === 200);
  const items = [...c.items.slice(0, 6), ...Array(Math.max(0, 6 - c.items.slice(0, 6).length)).fill(0)];
  return (
    <article className={`gc gc-${result}`} aria-label={`${c.queue}: ${c.championName}, ${c.win ? "victory" : "defeat"}`}>
      <header className="gc-head">
        <b>{c.queue}</b>
        <span>{agoShort(c.startedAt)} · {Math.round(c.durationSec / 60)} minutes · P{c.patch}</span>
        <span className="spacer" />
        <Link to={`/matches/${encodeURIComponent(c.matchId)}`}>Match Details</Link>
      </header>
      <div className="gc-body">
        <div className="gc-champ">
          <span className="gc-portrait">
            <ChampionIcon champion={c.championId ?? c.championName} size={58} />
            {c.role !== "NONE" && <span className="gc-role"><RoleIcon role={c.role} /></span>}
          </span>
          {c.lpChange !== null && <span className={`gc-lp ${c.lpChange >= 0 ? "up" : "down"}`}>{c.lpChange > 0 ? "+" : ""}{c.lpChange}LP</span>}
        </div>
        <div className="gc-loadout">
          {c.spells.slice(0, 2).map((s, i) => <SpellIcon key={`s${i}`} id={s} size={22} />)}
          {c.runes.keystone !== null && <RuneIcon id={c.runes.keystone} size={22} />}
          {c.runes.secondary !== null && <RuneIcon id={c.runes.secondary} size={22} />}
        </div>
        <div className="gc-stat">
          <b>{c.kills} / {c.deaths} / {c.assists}</b>
          <span className={kdaClass(c.kda)}>{num(c.kda)} KDA</span>
        </div>
        <div className="gc-stat">
          <b>{c.cs} {c.csPerMin !== null && <span className="gc-sub">({num(c.csPerMin)})</span>} CS</b>
          {c.csDiff15 !== null && <span className={c.csDiff15 >= 0 ? "v-good" : "v-bad"}>{c.csDiff15 > 0 ? "+" : ""}{num(c.csDiff15)} @ 15m</span>}
        </div>
        <div className="gc-stat">
          <b className={c.killParticipation !== null && c.killParticipation < 0.45 ? "v-bad" : ""}>{c.killParticipation === null ? "—" : pct1(c.killParticipation)} KP</b>
          {c.visionScore !== null && <span>Vision {c.visionScore}</span>}
        </div>
        <div className="gc-items">
          {items.map((id, i) => (id ? <ItemIcon key={i} id={id} size={26} /> : <span key={i} className="gc-empty" />))}
        </div>
        <div className="gc-players">
          {[blue, red].map((team, ti) => (
            <ul key={ti}>
              {team.map((p, i) => (
                <li key={i} className={p.isMe ? "is-me" : ""}>
                  {ti === 0 && <span className="gc-pname">{p.name ?? "—"}</span>}
                  <ChampionIcon champion={p.championId ?? p.championName} size={18} />
                  {ti === 1 && <span className="gc-pname">{p.name ?? "—"}</span>}
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>
      {c.tags.length > 0 && <footer className="gc-tags">{c.tags.map((t) => <span key={t}>{t}</span>)}</footer>}
    </article>
  );
}
