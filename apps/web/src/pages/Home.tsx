import { useEffect, useState } from "react";
import { useLocation, useSearchParams } from "react-router";
import { api, type RankResponse } from "../api";
import { LpGains } from "../components/LpGains";
import { OverviewPanel, ProfileBanner, ProfileCard } from "../components/ProfileTop";
import { PoolTable } from "../components/Pools";
import { ErrorNotice, InsightView, Loading, modeLabel, roleLabel } from "../components/ui";
import { useLoad, useSession } from "../session";
import { CoachProfile } from "./Profile";
import { ProfileOverview } from "../components/ProfileOverview";

type Tab = "overview" | "champions" | "matchups" | "lp" | "coach";
const TABS: [Tab, string][] = [["overview", "Overview"], ["champions", "Champion pool"], ["matchups", "Matchup pool"], ["lp", "LP gains"], ["coach", "Coach"]];
const QUEUE = { RANKED_SOLO_5x5: "Ranked Solo/Duo", RANKED_FLEX_SR: "Ranked Flex" } as const;

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
  const queue = Number(params.get("queue")) || undefined;
  const overview = useLoad(() => api.overview(queue), [syncKey, queue]);

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
      <div className="pf-hero">
        <ProfileBanner champion={topChampion} synthetic={data.dataSource === "synthetic"} lastSyncedAt={overview.data?.lastSyncedAt ?? null} />
        <div className="pf-top">
          <ProfileCard gameName={gameName ?? ""} tagLine={tagLine} avatarChampion={topChampion}
            chips={[main?.mainRole ? `Main role: ${roleLabel[main.mainRole]}` : "", main ? `${main.games} games in ${modeLabel[main.mode]}` : ""].filter(Boolean)}
            overview={overview.data} selected={overview.data?.selected ?? null} onSelect={(q) => set("queue", String(q))} />
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
            <OverviewPanel key={overview.data?.selected ?? 0} overview={overview.data} onAllChampions={() => set("tab", "champions")} />
            <p className="tile-note pf-basis">Hi, {me?.user.displayName}. Based on {data.summary.analyzableGames} analyzable games.</p>
          </div>
        </div>
      </div>

      <div className="tabs-row" role="tablist" aria-label="Profile sections">
        {TABS.map(([key, label]) => (
          <button key={key} role="tab" aria-selected={tab === key} className={`tab-btn${tab === key ? " tab-btn-on" : ""}`} onClick={() => set("tab", key === "overview" ? "" : key)}>{label}</button>
        ))}
      </div>

      {tab === "overview" && <ProfileOverview />}
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
      {tab === "coach" && (
        <>
          <section className="card stack" aria-labelledby="insights-h">
            <h2 id="insights-h" style={{ margin: 0 }}>What matters most now</h2>
            {data.insufficientData ? (
              <p className="page-sub" style={{ margin: 0 }}>I do not have enough reliable information to draw conclusions yet. With more analyzed games I will start spotting patterns.</p>
            ) : (
              data.insights.map((i) => (
                <InsightView key={i.id} insight={i}>
                  <button className="btn btn-ghost" style={{ padding: "4px 0", fontSize: "0.8rem", color: "var(--text-muted)" }}
                    onClick={async () => { await api.feedback(i.id, i.title); reload(); }}>Not useful to me</button>
                </InsightView>
              ))
            )}
          </section>
          <CoachProfile />
        </>
      )}
    </div>
  );
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
