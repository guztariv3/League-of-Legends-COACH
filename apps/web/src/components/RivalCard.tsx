import type { ScoutedPlayer } from "../api";
import { ChampionIcon, LoadingArt } from "../assets";
import { pct, roleLabel } from "./ui";

const TIERS: Record<string, string> = {
  IRON: "Hierro", BRONZE: "Bronce", SILVER: "Plata", GOLD: "Oro", PLATINUM: "Platino", EMERALD: "Esmeralda",
  DIAMOND: "Diamante", MASTER: "Maestro", GRANDMASTER: "Gran Maestro", CHALLENGER: "Retador",
};

function rankText(e: ScoutedPlayer) {
  if (e.rankStatus === "unavailable" || !e.rank) return e.rankStatus === "unranked" ? "Sin clasificar esta temporada" : "Rango no disponible";
  const r = e.rank;
  const tier = r.tier ? TIERS[r.tier] ?? r.tier : "Clasificado";
  // Master and above have no division.
  const division = r.division && !["MASTER", "GRANDMASTER", "CHALLENGER"].includes(r.tier ?? "") ? ` ${r.division}` : "";
  return `${tier}${division}${r.lp !== null ? ` · ${r.lp} LP` : ""}${r.queue === "flex" ? " (flexible)" : ""}`;
}

const points = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)} M` : n >= 1000 ? `${Math.round(n / 1000)} mil` : String(n));

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
        <div className="rival-id" title={e.riotId ?? undefined}>{e.riotId ?? "Jugador sin Riot ID visible"}</div>
        <div className={`rival-rank rank-${(e.rank?.tier ?? e.rankStatus).toLowerCase()}`}>{rankText(e)}</div>
        <div className="rival-wr">
          {ranked ? (
            <>
              <strong>{pct(ranked.wins / (ranked.wins + ranked.losses))}</strong> victorias
              <span className="tile-note">{ranked.wins}V {ranked.losses}D en clasificatoria</span>
            </>
          ) : e.games ? (
            <>
              <strong>{pct(e.wins / e.games)}</strong> victorias
              <span className="tile-note">en sus últimas {e.games} partidas</span>
            </>
          ) : (
            <span className="tile-note">Sin partidas recientes</span>
          )}
        </div>
        {e.topChampions.length > 0 && (
          <div className="rival-top">
            <div className="tile-note">{e.topSource === "mastery" ? "Mejores campeones (maestría)" : "Más jugados recientemente"}</div>
            <div className="row" style={{ gap: 6 }}>
              {e.topChampions.map((c) => (
                <span key={c.id} className="rival-top-champ" title={`${c.name}${c.points !== null ? ` · ${points(c.points)} puntos` : ""}${c.games !== null ? ` · ${c.games} partidas` : ""}`}>
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
            <summary>Ver datos{e.smallSample ? " (muestra pequeña)" : ""}</summary>
            <dl>
              <dt>Con {e.championName}</dt><dd>{e.winsOnChampion} de {e.gamesOnChampion}</dd>
              <dt>Rol más jugado</dt><dd>{e.mainRole ? roleLabel[e.mainRole] : "—"}</dd>
              <dt>KDA medio</dt><dd>{e.avgKda?.toFixed(2) ?? "—"}</dd>
            </dl>
          </details>
        )}
      </div>
    </article>
  );
}
