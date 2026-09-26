import { useEffect, useState } from "react";
import { fetchHome } from "./bridge";
import { ChampArt, type Art } from "./board";
import type { SiteLink } from "./rivals";

/** What /api/desktop/home returns: the same profile the website shows. */
export interface HomeData {
  accounts: string[];
  ranks: { riotId: string; queueType: "RANKED_SOLO_5x5" | "RANKED_FLEX_SR"; tier: string; rank: string; lp: number; wins: number; losses: number }[];
  record: { games: number; wins: number };
  recent: { matchId: string; championName: string; win: boolean; kills: number; deaths: number; assists: number; startedAt: number; mode: string }[];
  champions: { name: string; games: number; wins: number }[];
  focus: string | null;
  challenges: { title: string; met: number; played: number; summary: string }[];
}

const QUEUE = { RANKED_SOLO_5x5: "Solo/Duo", RANKED_FLEX_SR: "Flex" } as const;
const title = (t: string) => t.charAt(0) + t.slice(1).toLowerCase();
const APEX = ["MASTER", "GRANDMASTER", "CHALLENGER"];

/**
 * Home: the player's profile between games (the same account and data as the website).
 * It is reloaded every time it is shown, so a finished game appears as soon as it syncs.
 */
export function Home({ link, art, refreshKey }: { link: SiteLink | null; art: Art; refreshKey: number }) {
  const [data, setData] = useState<HomeData | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    setProblem(null);
    if (!link) return;
    let stopped = false;
    void fetchHome<HomeData>(link.origin, link.token).then((r) => {
      if (stopped) return;
      if (r.ok) setData(r.data);
      else setProblem(r.error === "offline" ? "The website isn't answering right now." : "Your profile couldn't be loaded.");
    });
    return () => { stopped = true; };
  }, [link, refreshKey]);

  if (!link) return null;
  if (problem) return <p className="quiet" role="status">{problem}</p>;
  if (!data) return <p className="quiet" role="status">Loading your profile…</p>;
  const wr = data.record.games ? Math.round((data.record.wins / data.record.games) * 100) : null;

  return (
    <section className="home" aria-label="Your profile">
      <header className="home-head">
        <h2>{data.accounts[0]?.split("#")[0] ?? "Your profile"}</h2>
        {data.ranks.map((r) => (
          <span key={`${r.riotId}-${r.queueType}`} className="rank-chip">
            {QUEUE[r.queueType]}: {title(r.tier)}{APEX.includes(r.tier) ? "" : ` ${r.rank}`} · {r.lp} LP
          </span>
        ))}
      </header>

      {wr !== null && (
        <p className="home-record"><strong>{data.record.wins}W {data.record.games - data.record.wins}L</strong> <span className="quiet">in your last {data.record.games} games ({wr}%)</span></p>
      )}

      {data.focus && <p className="home-focus"><span className="label">Focus</span> {data.focus.replace(/^I want to focus on: /, "")}</p>}

      {data.challenges.length > 0 && (
        <div className="home-block">
          <h3 className="label">Challenges</h3>
          <ul className="home-list">
            {data.challenges.map((c) => <li key={c.title}><span>{c.title}</span><span className="quiet small">{c.summary}</span></li>)}
          </ul>
        </div>
      )}

      {data.recent.length > 0 && (
        <div className="home-block">
          <h3 className="label">Recent games</h3>
          <ul className="home-games">
            {data.recent.map((g) => (
              <li key={g.matchId} className={g.win ? "won" : "lost"}>
                <ChampArt id={g.championName} name={g.championName} size={26} art={art} />
                <span className="result">{g.win ? "Win" : "Loss"}</span>
                <span>{g.kills}/{g.deaths}/{g.assists}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.champions.length > 0 && (
        <div className="home-block">
          <h3 className="label">Most played</h3>
          <ul className="home-games">
            {data.champions.map((c) => (
              <li key={c.name}>
                <ChampArt id={c.name} name={c.name} size={26} art={art} />
                <span>{c.name}</span>
                <span className="quiet small">{c.games} games · {Math.round((c.wins / c.games) * 100)}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="quiet small">The full profile, reviews and challenges are on the website ({new URL(link.origin).host}).</p>
    </section>
  );
}
