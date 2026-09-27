import { useEffect, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router";
import { api, type Dashboard, type MatchRow, type RankResponse, type Stat } from "../api";
import { ChampionIcon, useSplash } from "../assets";
import { ActivityCalendar } from "../components/ActivityCalendar";
import { Goals } from "../components/Goals";
import { LpGains, LpSpark, TIER_COLOR, tierTitle } from "../components/LpGains";
import { PoolTable } from "../components/Pools";
import { ago, ErrorNotice, InsightView, Loading, MatchItem, modeLabel, num, pct, roleLabel, SyntheticBadge } from "../components/ui";
import { useLoad, useSession } from "../session";
import { CoachProfile } from "./Profile";

type Tab = "overview" | "champions" | "matchups" | "lp" | "coach";
const TABS: [Tab, string][] = [["overview", "Overview"], ["champions", "Champion pool"], ["matchups", "Matchup pool"], ["lp", "LP gains"], ["coach", "Coach"]];
const QUEUE = { RANKED_SOLO_5x5: "Ranked Solo/Duo", RANKED_FLEX_SR: "Ranked Flex" } as const;
const ROLES = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];

/**
 * Your profile, which is also the home page: who you are in the game (rank, main
 * champions, recent form) on top, and tabs for your games, champion and matchup pools,
 * LP over time and what the Coach knows. Every number comes from your own games.
 */
export function Home() {
  const { me } = useSession();
  const syncKey = me?.accounts.map((a) => `${a.id}:${a.sync.status}`).join(",");
  const [version, setVersion] = useState(0);
  const reload = () => setVersion((v) => v + 1);
  const [params, setParams] = useSearchParams();
  const { hash } = useLocation();
  const tab = (TABS.find(([k]) => k === params.get("tab"))?.[0] ?? "overview") as Tab;
  const vs = params.get("champion") ?? "";
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(window.location.search);
    if (v) next.set(k, v); else next.delete(k);
    setParams(next, { replace: true });
  };

  const dash = useLoad(() => api.dashboard(), [syncKey, version]);
  const improve = useLoad(() => api.improve(vs || undefined), [syncKey, vs]);
  const rank = useLoad(() => api.rank(), [syncKey]);
  const goals = useLoad(() => api.goals(), [syncKey, version]);

  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: "start" });
  }, [hash, tab, dash.data]);

  if (dash.loading && !dash.data) return <Loading />;
  if (dash.error) return <ErrorNotice error={dash.error} />;
  const data = dash.data!;
  const main = data.summary.modes[0];
  const syncing = me?.accounts.find((a) => a.sync.status === "syncing");
  const account = me?.accounts[0];
  const [gameName, tagLine] = (account?.riotId ?? me?.user.displayName ?? "").split("#");
  const topChampion = main?.champions[0]?.championName;

  return (
    <div className="stack pf" style={{ gap: 24 }}>
      <Banner champion={topChampion} synthetic={data.dataSource === "synthetic"} />

      <div className="pf-top">
        <aside className="pf-side stack" style={{ gap: 12 }}>
          <section className="card pf-id" aria-label="Player">
            <span className="pf-avatar">{topChampion ? <ChampionIcon champion={topChampion} size={96} /> : <span className="pf-avatar-empty" />}</span>
            <h1 className="pf-name">{gameName}{tagLine && <span className="pf-tag"> #{tagLine}</span>}</h1>
            <p className="tile-note" style={{ margin: 0 }}>Hi, {me?.user.displayName}</p>
            <div className="pf-tags">
              {main?.mainRole && <span className="pf-chip">Main role: {roleLabel[main.mainRole]}</span>}
              {main && <span className="pf-chip">{modeLabel[main.mode]} · {main.games} games</span>}
              <span className="pf-chip">Based on {data.summary.analyzableGames} analyzable games.</span>
            </div>
          </section>
          <RankCards rank={rank.data} loading={rank.loading && !rank.data} onLp={() => set("tab", "lp")} />
        </aside>

        <div className="pf-main stack" style={{ gap: 12 }}>
          {syncing && (
            <div className="card stack" aria-live="polite">
              <h2>Analyzing your games</h2>
              <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={syncing.sync.progress?.total ?? 50} aria-valuenow={syncing.sync.progress?.done ?? 0}>
                <span style={{ width: `${syncing.sync.progress?.total ? (100 * syncing.sync.progress.done) / syncing.sync.progress.total : 5}%` }} />
              </div>
              <p className="tile-note" style={{ margin: 0 }}>Keep browsing; this page will update on its own.</p>
            </div>
          )}
          <section className="card stack" aria-labelledby="h-main-champs">
            <div className="row">
              <h2 id="h-main-champs" style={{ margin: 0 }}>{main ? `Most played champions · ${modeLabel[main.mode]}` : "Most played champions"}</h2>
              <span className="spacer" />
              <button type="button" className="link-btn" onClick={() => set("tab", "champions")}>See all champions</button>
            </div>
            <ChampionSummary entries={improve.data?.champions.slice(0, 5) ?? []} fallback={main?.champions.slice(0, 5) ?? []} />
          </section>
          <Performance p={data.performance} />
        </div>
      </div>

      <div className="tabs-row" role="tablist" aria-label="Profile sections">
        {TABS.map(([key, label]) => (
          <button key={key} role="tab" aria-selected={tab === key} className={`tab-btn${tab === key ? " tab-btn-on" : ""}`} onClick={() => set("tab", key === "overview" ? "" : key)}>{label}</button>
        ))}
      </div>

      {tab === "overview" && <Overview data={data} improve={improve.data} goals={goals.data} onChange={reload} />}
      {(tab === "champions" || tab === "matchups") && (improve.loading && !improve.data ? <Loading /> : improve.error ? <ErrorNotice error={improve.error} /> : improve.data && (
        tab === "champions" ? (
          <PoolTable title="Champion pool" entries={improve.data.champions} what="champion" empty="No analyzable Summoner's Rift games yet."
            note="Summoner's Rift games only. A champion is “clearly winning” or “clearly losing” only when its win rate is clearly away from 50% over at least 5 games." />
        ) : (
          <>
            <div className="field" style={{ maxWidth: 280 }}>
              <label htmlFor="mu-champ">Playing</label>
              <select id="mu-champ" value={vs} onChange={(e) => set("champion", e.target.value)}>
                <option value="">Any champion</option>
                {improve.data.champions.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
            </div>
            <PoolTable title={vs ? `Lane opponents when you play ${vs}` : "Lane opponents"} entries={improve.data.matchups} what="opponent" empty="No lane opponents recorded for this selection."
              note="Your lane opponent is the enemy in your role. Gold and CS differences are at 15:00, from the timeline." />
          </>
        )
      ))}
      {tab === "lp" && <LpTab rank={rank.data} error={rank.error} />}
      {tab === "coach" && <CoachProfile />}
    </div>
  );
}

function Banner({ champion, synthetic }: { champion: string | undefined; synthetic: boolean }) {
  const splash = useSplash(champion);
  return (
    <div className="pf-banner" style={splash ? { backgroundImage: `linear-gradient(90deg, var(--bg) 0%, rgb(23 18 51 / 0.2) 45%, var(--bg) 100%), url(${splash})` } : undefined}>
      {synthetic && <SyntheticBadge />}
    </div>
  );
}

function RankCards({ rank, loading, onLp }: { rank: RankResponse | undefined; loading: boolean; onLp: () => void }) {
  if (loading) return <section className="card"><Loading /></section>;
  const queues = (rank?.accounts ?? []).flatMap((a) => a.queues.map((q) => ({ ...q, riotId: a.riotId })));
  const solo = queues.find((q) => q.queueType === "RANKED_SOLO_5x5") ?? queues[0];
  return (
    <section className="card pf-ranks" aria-label="Rank">
      {queues.length === 0 && <p className="tile-note" style={{ margin: 0 }}>No ranked games recorded yet. Your rank is saved each time your games sync.</p>}
      {queues.map((q) => {
        const c = q.current;
        const total = c.wins + c.losses;
        return (
          <div key={`${q.riotId}-${q.queueType}`} className="pf-rank">
            <span className="pf-emblem" style={{ color: TIER_COLOR[c.tier] }} aria-hidden="true">{c.tier.charAt(0)}</span>
            <div className="pf-rank-text">
              <span className="tile-note">{QUEUE[q.queueType]}</span>
              <strong><span style={{ color: TIER_COLOR[c.tier] }}>{tierTitle(c.tier)}{["MASTER", "GRANDMASTER", "CHALLENGER"].includes(c.tier) ? "" : ` ${c.rank}`}</span> <span className="quiet-num">· {c.lp} LP</span></strong>
              <span className="pf-wl">{c.wins}W {c.losses}L · <b>{total ? pct(c.wins / total) : "—"}</b></span>
              {total > 0 && <span className="pf-wl-bar" aria-hidden="true"><span style={{ width: `${(100 * c.wins) / total}%` }} /></span>}
            </div>
          </div>
        );
      })}
      {solo && (
        <div className="pf-lp-mini">
          <div className="row">
            <h2 style={{ margin: 0 }}>LP progress</h2>
            <span className="spacer" />
            <button type="button" className="link-btn" onClick={onLp}>Open</button>
          </div>
          <LpSpark history={solo.history} />
        </div>
      )}
    </section>
  );
}

function ChampionSummary({ entries, fallback }: { entries: { name: string; games: number; wins: number; kda: number; csPerMin: number | null }[]; fallback: { championName: string; games: number; wins: number }[] }) {
  const rows = entries.length ? entries.map((e) => ({ ...e, kda: e.kda as number | null })) : fallback.map((c) => ({ name: c.championName, games: c.games, wins: c.wins, kda: null, csPerMin: null }));
  if (!rows.length) return <p className="tile-note" style={{ margin: 0 }}>No games yet.</p>;
  return (
    <div className="table-scroll">
      <table className="champ-table pf-champs">
        <thead><tr><th>Champion</th><th className="num-col">Games</th><th className="num-col">Win rate</th><th className="num-col">KDA</th><th className="num-col">CS/min</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <td><Link to={`/champions/${encodeURIComponent(r.name)}`} className="champ-cell champ-link"><ChampionIcon champion={r.name} size={30} /><span className="match-title">{r.name}</span></Link></td>
              <td className="num-col">{r.games}</td>
              <td className={`num-col ${r.wins / r.games >= 0.5 ? "num-good" : "num-bad"}`}>{pct(r.wins / r.games)}</td>
              <td className="num-col">{num(r.kda, 2)}</td>
              <td className="num-col">{num(r.csPerMin)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Performance({ p }: { p: Dashboard["performance"] }) {
  const tile = (label: string, stat: Stat, fmt: (v: number) => string, help: string) => ({ label, stat, fmt, help });
  const signedNum = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v)}`;
  const tiles = [
    ...[
      tile("Gold diff @15", p.goldDiff15, signedNum, "Gold compared with your lane opponent at 15:00"),
      tile("Gold share", p.goldShare, pct, "Your share of your team's gold"),
      tile("Damage share", p.damageShare, pct, "Your share of your team's damage to champions"),
      tile("Kill participation", p.killParticipation, pct, "Kills and assists over your team's kills"),
      tile("Solo deaths", p.soloDeaths, (v) => num(v), "Deaths with no enemy assisting, per game"),
      tile("Vision / min", p.visionPerMin, (v) => num(v), "Vision score per minute"),
    ].filter((t) => t.stat).map((t) => ({ label: t.label, value: t.fmt(t.stat!.value), note: `${t.help} · ${t.stat!.games} games` })),
  ];
  return (
    <section className="card stack" aria-labelledby="h-perf">
      <h2 id="h-perf" style={{ margin: 0 }}>Performance overview <span className="quiet-num" style={{ textTransform: "none" }}>· last {p.games} games{p.mode ? ` in ${modeLabel[p.mode]}` : ""}</span></h2>
      <div className="pf-perf">
        {tiles.map((t) => (
          <div key={t.label} className="tile" title={t.note}>
            <div className="tile-value">{t.value}</div>
            <div className="tile-label">{t.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Overview({ data, improve, goals, onChange }: {
  data: Dashboard;
  improve: import("../api").Improve | undefined;
  goals: import("../api").GoalsResponse | undefined;
  onChange: () => void;
}) {
  const recent = data.recent.filter((m) => m.analyzable);
  const wins = recent.filter((m) => m.win).length;
  const k = recent.reduce((s, m) => s + m.kills, 0), d = recent.reduce((s, m) => s + m.deaths, 0), a = recent.reduce((s, m) => s + m.assists, 0);
  const n = Math.max(1, recent.length);
  const roles = ROLES.map((r) => data.performance.roles.find((x) => x.role === r) ?? { role: r, games: 0, wins: 0 });
  const maxRole = Math.max(1, ...roles.map((r) => r.games));
  const days = groupByDay(data.recent);

  return (
    <div className="pf-overview">
      <aside className="stack" style={{ gap: 12 }}>
        <section className="card stack" aria-labelledby="h-activity">
          <h2 id="h-activity" style={{ margin: 0 }}>Recent activity <span className="quiet-num" style={{ textTransform: "none" }}>· last {Math.min(120, improve?.activityDays ?? 120)} days</span></h2>
          {improve ? <ActivityCalendar activity={improve.activity} days={Math.min(120, improve.activityDays)} compact /> : <Loading />}
        </section>
        <section className="card stack" aria-labelledby="h-roles">
          <h2 id="h-roles" style={{ margin: 0 }}>Top roles</h2>
          <div className="pf-roles" role="list">
            {roles.map((r) => (
              <div key={r.role} className="pf-role" role="listitem" aria-label={`${roleLabel[r.role]}: ${r.games} games${r.games ? `, ${pct(r.wins / r.games)} wins` : ""}`}>
                <span className="pf-role-bar"><span style={{ height: `${(100 * r.games) / maxRole}%` }} /></span>
                <strong>{r.games}</strong>
                <span className="tile-note">{r.games ? pct(r.wins / r.games) : "—"}</span>
                <span className="pf-role-name">{roleLabel[r.role]}</span>
              </div>
            ))}
          </div>
        </section>
        {goals && (goals.goals.length > 0 || goals.suggestions.length > 0) && (
          <section className="card stack" aria-labelledby="goals-h">
            <div className="row">
              <h2 id="goals-h" style={{ margin: 0 }}>Your goals</h2>
              <span className="spacer" />
              <Link to="/?tab=coach#goals">Manage</Link>
            </div>
            <Goals data={goals} onChange={onChange} compact />
          </section>
        )}
      </aside>

      <div className="stack" style={{ gap: 12 }}>
        <section className="card stack" aria-labelledby="h-summary">
          <h2 id="h-summary" style={{ margin: 0 }}>Recent summary <span className="quiet-num" style={{ textTransform: "none" }}>· last {recent.length} games</span></h2>
          {recent.length === 0 ? <p className="tile-note" style={{ margin: 0 }}>No games yet.</p> : (
            <>
              <div className="pf-summary">
                <span><b>{wins}W {recent.length - wins}L</b> · <span className={wins / n >= 0.5 ? "num-good" : "num-bad"}>{pct(wins / n)}</span></span>
                <span><b>{num(k / n)} / {num(d / n)} / {num(a / n)}</b> <span className="quiet-num">({num((k + a) / Math.max(1, d), 2)} KDA)</span></span>
              </div>
              <ul className="pf-recent">
                {recent.map((m) => (
                  <li key={m.matchId}>
                    <Link to={`/matches/${encodeURIComponent(m.matchId)}`} className={`pf-recent-game ${m.win ? "is-win" : "is-loss"}`} title={`${m.championName}: ${m.win ? "win" : "loss"}`}>
                      <ChampionIcon champion={m.championId ?? m.championName} size={40} />
                      <span>{m.kills} / {m.deaths} / {m.assists}</span>
                      <span className="tile-note">{ago(m.startedAt)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <section className="card stack" aria-labelledby="insights-h">
          <h2 id="insights-h" style={{ margin: 0 }}>What matters most now</h2>
          {data.insufficientData ? (
            <p className="page-sub" style={{ margin: 0 }}>I do not have enough reliable information to draw conclusions yet. With more analyzed games I will start spotting patterns.</p>
          ) : (
            data.insights.map((i) => (
              <InsightView key={i.id} insight={i}>
                <button className="btn btn-ghost" style={{ padding: "4px 0", fontSize: "0.8rem", color: "var(--text-muted)" }}
                  onClick={async () => { await api.feedback(i.id, i.title); onChange(); }}>Not useful to me</button>
              </InsightView>
            ))
          )}
        </section>

        <section className="stack" aria-labelledby="recent-h" style={{ gap: 8 }}>
          <div className="row">
            <h2 id="recent-h" className="section-title" style={{ margin: 0 }}>Recent games</h2>
            <span className="spacer" />
            <Link to="/matches">See all</Link>
          </div>
          {days.map((g) => (
            <div key={g.label} className="stack" style={{ gap: 8 }}>
              <p className="pf-day">{g.label} · {g.wins}W {g.losses}L{g.wins + g.losses ? ` · ${pct(g.wins / (g.wins + g.losses))}` : ""}</p>
              <ul className="match-list">{g.games.map((m) => <MatchItem key={m.matchId} m={m} />)}</ul>
            </div>
          ))}
          {days.length === 0 && <p className="page-sub" style={{ margin: 0 }}>No games yet.</p>}
        </section>
      </div>
    </div>
  );
}

function groupByDay(games: MatchRow[]) {
  const out: { label: string; games: MatchRow[]; wins: number; losses: number }[] = [];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  for (const m of games) {
    const d = new Date(m.startedAt); d.setHours(0, 0, 0, 0);
    const diff = Math.round((today.getTime() - d.getTime()) / 86_400_000);
    const label = diff <= 0 ? "Today" : diff === 1 ? "Yesterday" : `${diff} days ago`;
    let g = out.find((x) => x.label === label);
    if (!g) out.push(g = { label, games: [], wins: 0, losses: 0 });
    g.games.push(m);
    if (m.analyzable) { if (m.win) g.wins++; else g.losses++; }
  }
  return out;
}

function LpTab({ rank, error }: { rank: RankResponse | undefined; error: unknown }) {
  const matches = useLoad(() => api.matches({ limit: "100" }), []);
  if (error) return <ErrorNotice error={error} />;
  if (!rank || !matches.data) return <Loading />;
  const queues = rank.accounts.flatMap((a) => a.queues.map((q) => ({ ...q, riotId: a.riotId, many: rank.accounts.length > 1 })));
  if (!queues.length) {
    return <div className="notice">No ranked games recorded yet. Your rank is saved each time your games sync; once you have two snapshots, your LP line appears here.</div>;
  }
  return (
    <>
      {queues.map((q) => (
        <section key={`${q.riotId}-${q.queueType}`} className="card stack" aria-labelledby={`h-lp-${q.queueType}`}>
          <h2 id={`h-lp-${q.queueType}`} style={{ margin: 0 }}>{QUEUE[q.queueType]}{q.many ? ` · ${q.riotId.split("#")[0]}` : ""}</h2>
          <LpGains history={q.history} queueType={q.queueType} queue={QUEUE[q.queueType]} matches={matches.data!.matches} />
        </section>
      ))}
      <p className="tile-note" style={{ margin: 0 }}>Riot doesn't provide rank history, so the line starts when you linked your account. No predictions and no hidden MMR.</p>
    </>
  );
}
