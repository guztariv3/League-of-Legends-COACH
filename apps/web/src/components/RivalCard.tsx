import type { ScoutedPlayer } from "../api";
import { ChampionIcon, LoadingArt } from "../assets";
import { pct, roleLabel } from "./ui";

const TIERS: Record<string, string> = {
  IRON: "Iron", BRONZE: "Bronze", SILVER: "Silver", GOLD: "Gold", PLATINUM: "Platinum", EMERALD: "Emerald",
  DIAMOND: "Diamond", MASTER: "Master", GRANDMASTER: "Grandmaster", CHALLENGER: "Challenger",
};

function rankText(e: ScoutedPlayer) {
  if (e.rankStatus === "unavailable" || !e.rank) return e.rankStatus === "unranked" ? "Unranked this season" : "Rank unavailable";
  const r = e.rank;
  const tier = r.tier ? TIERS[r.tier] ?? r.tier : "Ranked";
  // Master and above have no division.
  const division = r.division && !["MASTER", "GRANDMASTER", "CHALLENGER"].includes(r.tier ?? "") ? ` ${r.division}` : "";
  return `${tier}${division}${r.lp !== null ? ` · ${r.lp} LP` : ""}${r.queue === "flex" ? " (flex)" : ""}`;
}

const points = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));

/** One rival as on the loading screen: art, Riot ID, rank, win rate and best champions — facts only, with sample sizes. */
export function RivalCard({ e }: { e: ScoutedPlayer }) {
  const ranked = e.rank && e.rank.wins + e.rank.losses > 0 ? e.rank : null;
  return (
    <article className="rival">
      <div className="rival-art">
        <LoadingArt champion={e.championId} />
        <div className="rival-champ">{e.championName}</div>
      </div>
      <div className="rival-body">
        <div className="rival-id" title={e.riotId ?? undefined}>{e.riotId ?? "Player with no visible Riot ID"}</div>
        <div className={`rival-rank rank-${(e.rank?.tier ?? e.rankStatus).toLowerCase()}`}>{rankText(e)}</div>
        <div className="rival-wr">
          {ranked ? (
            <>
              <strong>{pct(ranked.wins / (ranked.wins + ranked.losses))}</strong> win rate
              <span className="tile-note">{ranked.wins}W {ranked.losses}L in ranked</span>
            </>
          ) : e.games ? (
            <>
              <strong>{pct(e.wins / e.games)}</strong> win rate
              <span className="tile-note">in their last {e.games} games</span>
            </>
          ) : (
            <span className="tile-note">No recent games</span>
          )}
        </div>
        {e.topChampions.length > 0 && (
          <div className="rival-top">
            <div className="tile-note">{e.topSource === "mastery" ? "Top champions (mastery)" : "Most played recently"}</div>
            <div className="row" style={{ gap: 6 }}>
              {e.topChampions.map((c) => (
                <span key={c.id} className="rival-top-champ" title={`${c.name}${c.points !== null ? ` · ${points(c.points)} points` : ""}${c.games !== null ? ` · ${c.games} games` : ""}`}>
                  <ChampionIcon champion={c.id} size={34} />
                  <small>{c.points !== null ? points(c.points) : `${c.games} p.`}</small>
                </span>
              ))}
            </div>
          </div>
        )}
        <p className="rival-headline">{e.headline}</p>
        {e.available && (
          <details className="layer">
            <summary>See data{e.smallSample ? " (small sample)" : ""}</summary>
            <dl>
              <dt>On {e.championName}</dt><dd>{e.winsOnChampion} of {e.gamesOnChampion}</dd>
              <dt>Most played role</dt><dd>{e.mainRole ? roleLabel[e.mainRole] : "—"}</dd>
              <dt>Average KDA</dt><dd>{e.avgKda?.toFixed(2) ?? "—"}</dd>
            </dl>
          </details>
        )}
      </div>
    </article>
  );
}
