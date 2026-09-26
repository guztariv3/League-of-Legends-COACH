import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { api, type PoolEntry, type PoolVerdict } from "../api";
import { ChampionIcon } from "../assets";
import { ActivityCalendar } from "../components/ActivityCalendar";
import { Challenges } from "../components/Challenges";
import { LpChart, rankLabel } from "../components/LpChart";
import { ErrorNotice, Loading, num, pct } from "../components/ui";
import { useLoad } from "../session";

type Tab = "challenges" | "champions" | "matchups" | "lp" | "activity";
const TABS: [Tab, string][] = [["challenges", "Challenges"], ["champions", "Champion pool"], ["matchups", "Matchups"], ["lp", "LP"], ["activity", "Activity"]];

const VERDICT: Record<PoolVerdict, { label: string; cls: string }> = {
  strong: { label: "▲ Clearly winning", cls: "trend-improving" },
  weak: { label: "▼ Clearly losing", cls: "trend-declining" },
  even: { label: "Not clearly above or below 50%", cls: "" },
  few: { label: "Fewer than 5 games", cls: "" },
};
const QUEUE = { RANKED_SOLO_5x5: "Ranked Solo/Duo", RANKED_FLEX_SR: "Ranked Flex" } as const;
const signed = (x: number | null) => (x === null ? "—" : `${x > 0 ? "+" : ""}${Math.round(x)}`);
const ago = (t: number) => {
  const d = Math.floor((Date.now() - t) / 86_400_000);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
};

/**
 * Improve (F6): where you stand with each champion and matchup, your LP over time and
 * when you play. All from your own games; a verdict only when the numbers clearly say so.
 */
export function Improve() {
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find(([k]) => k === params.get("tab"))?.[0] ?? "challenges") as Tab;
  const vs = params.get("champion") ?? "";
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(window.location.search);
    if (v) next.set(k, v); else next.delete(k);
    setParams(next, { replace: true });
  };
  const data = useLoad(() => api.improve(vs || undefined), [vs]);

  return (
    <div className="stack" style={{ gap: 20 }}>
      <header>
        <h1 className="page-title">Improve</h1>
        <p className="page-sub" style={{ margin: 0 }}>Challenges, champions, matchups, rank and activity, all from your own games.</p>
      </header>
      <div className="tabs-row" role="tablist" aria-label="Improve sections">
        {TABS.map(([key, label]) => (
          <button key={key} role="tab" aria-selected={tab === key} className={`tab-btn${tab === key ? " tab-btn-on" : ""}`} onClick={() => set("tab", key === "challenges" ? "" : key)}>{label}</button>
        ))}
      </div>

      {tab === "challenges" ? <Challenges /> : tab === "lp" ? <LpSection /> : data.loading && !data.data ? <Loading /> : data.error ? <ErrorNotice error={data.error} /> : data.data && (
        <>
          {tab === "champions" && (
            <PoolTable title="Champion pool" entries={data.data.champions} what="champion" empty="No analyzable Summoner's Rift games yet."
              note="Summoner's Rift games only. A champion is “clearly winning” or “clearly losing” only when its win rate is clearly away from 50% over at least 5 games." />
          )}
          {tab === "matchups" && (
            <>
              <div className="field" style={{ maxWidth: 280 }}>
                <label htmlFor="mu-champ">Playing</label>
                <select id="mu-champ" value={vs} onChange={(e) => set("champion", e.target.value)}>
                  <option value="">Any champion</option>
                  {data.data.champions.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                </select>
              </div>
              <PoolTable title={vs ? `Lane opponents when you play ${vs}` : "Lane opponents"} entries={data.data.matchups} what="opponent" empty="No lane opponents recorded for this selection."
                note="Your lane opponent is the enemy in your role. Gold and CS differences are at 15:00, from the timeline." />
            </>
          )}
          {tab === "activity" && (
            <section className="card stack" aria-labelledby="h-activity">
              <h2 id="h-activity">Activity</h2>
              <ActivityCalendar activity={data.data.activity} days={data.data.activityDays} />
            </section>
          )}
        </>
      )}
    </div>
  );
}

function PoolTable({ title, entries, what, empty, note }: { title: string; entries: PoolEntry[]; what: "champion" | "opponent"; empty: string; note: string }) {
  const [all, setAll] = useState(false);
  const shown = all ? entries : entries.slice(0, 15);
  return (
    <section className="card stack" aria-labelledby={`h-pool-${what}`}>
      <h2 id={`h-pool-${what}`}>{title}</h2>
      {entries.length === 0 ? <p className="tile-note" style={{ margin: 0 }}>{empty}</p> : (
        <>
          <div className="table-scroll">
            <table className="pool-table">
              <thead>
                <tr>
                  <th>{what === "champion" ? "Champion" : "Opponent"}</th><th>Games</th><th>Wins</th><th>Verdict</th><th>KDA</th>
                  {what === "champion" ? <><th>CS/min</th><th>Gold @15</th><th>Last played</th></> : <><th>Gold @15</th><th>CS @15</th></>}
                </tr>
              </thead>
              <tbody>
                {shown.map((e) => (
                  <tr key={e.name}>
                    <td>
                      <span className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
                        <ChampionIcon champion={e.name} size={28} />
                        {what === "champion"
                          ? <Link to={`/champions/${encodeURIComponent(e.name)}`}>{e.name}</Link>
                          : <Link to={`/matches?opponent=${encodeURIComponent(e.name)}`}>{e.name}</Link>}
                      </span>
                    </td>
                    <td>{e.games}</td>
                    <td title={e.games >= 5 ? `Likely range ${pct(e.interval.low)}–${pct(e.interval.high)}` : undefined}>{pct(e.wins / e.games)} <span className="tile-note">({e.wins})</span></td>
                    <td className={VERDICT[e.verdict].cls}>{VERDICT[e.verdict].label}</td>
                    <td>{num(e.kda, 2)}</td>
                    {what === "champion"
                      ? <><td>{num(e.csPerMin)}</td><td>{signed(e.goldDiff15)}</td><td className="tile-note">{ago(e.lastPlayed)}</td></>
                      : <><td>{signed(e.goldDiff15)}</td><td>{signed(e.csDiff15)}</td></>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {entries.length > 15 && <button type="button" className="link-btn" onClick={() => setAll((v) => !v)}>{all ? "Show fewer" : `Show all ${entries.length}`}</button>}
        </>
      )}
      <p className="tile-note" style={{ margin: 0 }}>{note}</p>
    </section>
  );
}

function LpSection() {
  const { data, error, loading } = useLoad(() => api.rank(), []);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorNotice error={error} />;
  const queues = (data?.accounts ?? []).flatMap((a) => a.queues.map((q) => ({ ...q, riotId: a.riotId, many: (data?.accounts.length ?? 0) > 1 })));
  if (!queues.length) {
    return <div className="notice">No ranked games recorded yet. Your rank is saved each time your games sync; once you have two snapshots, your LP line appears here.</div>;
  }
  return (
    <>
      {queues.map((q) => (
        <section key={`${q.riotId}-${q.queueType}`} className="card stack" aria-labelledby={`h-lp-${q.queueType}`}>
          <div className="row">
            <h2 id={`h-lp-${q.queueType}`} style={{ margin: 0 }}>{QUEUE[q.queueType]}{q.many ? ` · ${q.riotId.split("#")[0]}` : ""}</h2>
            <span className="spacer" />
            <span className="rank-badge">{rankLabel(q.current)}<small> · {q.current.wins}W {q.current.losses}L</small></span>
          </div>
          <LpChart history={q.history} queue={QUEUE[q.queueType]} />
        </section>
      ))}
      <p className="tile-note" style={{ margin: 0 }}>Riot doesn't provide rank history, so the line starts when you linked your account. No predictions and no hidden MMR.</p>
    </>
  );
}
