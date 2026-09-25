import { analyzeMatch, mean, type MatchAnalysis } from "@coach/analysis";
import { normalizeMatch, type RawMatch, type Role } from "@coach/domain";
import { analyzeDraft, type DraftAnalysis } from "@coach/draft";
import type { KnowledgeRegistry } from "@coach/knowledge";
import type { RiotLeagueEntry, RiotMastery } from "@coach/riot";
import { eq } from "drizzle-orm";
import { schema, type Db } from "./db/index.js";
import type { MatchSource } from "./sources.js";

/**
 * Enemy scouting from the loading screen (brief §43, decision D-03). The
 * data comes from spectator-v5, which only answers once the game has started,
 * so nothing is revealed during champion select. For each rival it reads
 * their most recent games (budgeted) and reports small, descriptive facts
 * with sample sizes, plus the rival's top champions (mastery, or most played
 * recently when mastery is unavailable) and ranked record. The league-v4
 * PUUID route could not be verified from the development environment, so any
 * failure there is reported as "unavailable", never guessed.
 */
export const SCOUT_GAMES_PER_PLAYER = 10;
const SMALL_SAMPLE = 10;

export interface ScoutedPlayer {
  riotId: string | null;
  championId: string;
  championName: string;
  /** false when the player can't be scouted (no PUUID, bot, or no recent games). */
  available: boolean;
  games: number;
  wins: number;
  gamesOnChampion: number;
  winsOnChampion: number;
  mainRole: Role | null;
  avgKda: number | null;
  smallSample: boolean;
  headline: string;
  /** "ranked": `rank` holds solo/duo (or flex) data; "unranked": no ranked games this season; "unavailable": Riot didn't say. */
  rankStatus: "ranked" | "unranked" | "unavailable";
  rank: { queue: "solo" | "flex"; tier: string | null; division: string | null; lp: number | null; wins: number; losses: number } | null;
  /** Up to 3 champions; `source` says whether they come from mastery points or from recent games. */
  topChampions: { id: string; name: string; points: number | null; games: number | null }[];
  topSource: "mastery" | "recent" | null;
}

export interface ScoutResult {
  inGame: boolean;
  simulated?: boolean;
  mode?: string;
  myChampion?: { id: string; name: string };
  allies?: { id: string; name: string }[];
  enemies?: ScoutedPlayer[];
  draft?: DraftAnalysis;
  message?: string;
}

async function recentAnalyses(db: Db, source: MatchSource, platform: string, puuid: string): Promise<MatchAnalysis[]> {
  const ids = await source.matchIds(platform, puuid, SCOUT_GAMES_PER_PLAYER, 0);
  const out: MatchAnalysis[] = [];
  for (const id of ids) {
    // Matches are immutable public data: reuse the raw cache, fetch only what's missing.
    const [row] = await db.select().from(schema.rawMatches).where(eq(schema.rawMatches.matchId, id));
    let raw = row?.payload as RawMatch | undefined;
    if (!raw) {
      const fetched = await source.match(platform, id);
      if (!fetched) continue;
      raw = fetched;
      await db.insert(schema.rawMatches).values({ matchId: id, platform, source: source.kind, payload: fetched }).onConflictDoNothing();
    }
    // Scouting doesn't need timelines; analyses of other players are computed on the fly and not stored.
    const a = analyzeMatch(normalizeMatch(raw), null, puuid);
    if (a?.analyzable) out.push(a);
  }
  return out;
}

/** A call whose failure must not break scouting: returns null (logged) instead of throwing. */
async function optional<T>(what: string, call: () => Promise<T> | undefined): Promise<T | null> {
  try {
    return (await call()) ?? null;
  } catch (err) {
    console.warn(`[scout] ${what} unavailable:`, err instanceof Error ? err.message : err);
    return null;
  }
}

function rankOf(entries: RiotLeagueEntry[] | null): Pick<ScoutedPlayer, "rankStatus" | "rank"> {
  if (entries === null) return { rankStatus: "unavailable", rank: null };
  const pick = entries.find((e) => e.queueType === "RANKED_SOLO_5x5") ?? entries.find((e) => e.queueType === "RANKED_FLEX_SR");
  if (!pick) return { rankStatus: "unranked", rank: null };
  return {
    rankStatus: "ranked",
    rank: {
      queue: pick.queueType === "RANKED_SOLO_5x5" ? "solo" : "flex",
      tier: pick.tier ?? null,
      division: pick.rank ?? null,
      lp: pick.leaguePoints ?? null,
      wins: pick.wins,
      losses: pick.losses,
    },
  };
}

function topChampionsOf(
  mastery: RiotMastery[] | null,
  recent: MatchAnalysis[],
  champ: (key: number) => { id: string; name: string },
): Pick<ScoutedPlayer, "topChampions" | "topSource"> {
  if (mastery && mastery.length) {
    return { topSource: "mastery", topChampions: mastery.slice(0, 3).map((m) => ({ ...champ(m.championId), points: m.championPoints, games: null })) };
  }
  if (!recent.length) return { topSource: null, topChampions: [] };
  const counts = new Map<number, number>();
  for (const a of recent) counts.set(a.championId, (counts.get(a.championId) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  return { topSource: "recent", topChampions: top.map(([key, games]) => ({ ...champ(key), points: null, games })) };
}

export async function scoutActiveGame(
  deps: { db: Db; source: MatchSource; knowledge: KnowledgeRegistry },
  account: { platform: string; puuid: string },
  myHistory: MatchAnalysis[],
): Promise<ScoutResult> {
  const game = await deps.source.activeGame(account.platform, account.puuid);
  if (!game) return { inGame: false, message: "No estás en una partida ahora mismo. El scouting empieza en la pantalla de carga." };

  const champs = deps.knowledge.active()?.champions ?? [];
  const byKey = new Map(champs.map((c) => [c.key, c]));
  const champ = (key: number) => {
    const c = byKey.get(key);
    return { id: c?.id ?? String(key), name: c?.name ?? `Campeón ${key}` };
  };
  const me = game.participants.find((p) => p.puuid === account.puuid);
  if (!me) return { inGame: false, message: "No encontramos tu cuenta dentro de la partida." };

  const allies = game.participants.filter((p) => p.teamId === me.teamId && p !== me).map((p) => champ(p.championId));
  const enemyParticipants = game.participants.filter((p) => p.teamId !== me.teamId);

  const enemies: ScoutedPlayer[] = [];
  for (const p of enemyParticipants) {
    const c = champ(p.championId);
    const base = { riotId: p.riotId, championId: c.id, championName: c.name };
    if (!p.puuid) {
      enemies.push({ ...base, available: false, games: 0, wins: 0, gamesOnChampion: 0, winsOnChampion: 0, mainRole: null, avgKda: null, smallSample: true, headline: "Información no disponible para este jugador.", rankStatus: "unavailable", rank: null, topChampions: [], topSource: null });
      continue;
    }
    const puuid = p.puuid;
    const [list, mastery, league] = await Promise.all([
      recentAnalyses(deps.db, deps.source, account.platform, puuid),
      optional("mastery", () => deps.source.topMasteries?.(account.platform, puuid, 3)),
      optional("ranked", () => deps.source.leagueEntries?.(account.platform, puuid)),
    ]);
    const onChamp = list.filter((a) => a.championName === c.id);
    const roles = new Map<Role, number>();
    for (const a of list) if (a.role !== "NONE") roles.set(a.role, (roles.get(a.role) ?? 0) + 1);
    const mainRole = [...roles.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const wins = list.filter((a) => a.win).length;
    const small = list.length < SMALL_SAMPLE;
    enemies.push({
      ...base,
      available: list.length > 0,
      games: list.length,
      wins,
      gamesOnChampion: onChamp.length,
      winsOnChampion: onChamp.filter((a) => a.win).length,
      mainRole,
      avgKda: list.length ? mean(list.map((a) => a.kda)) : null,
      smallSample: small,
      ...rankOf(league),
      ...topChampionsOf(mastery, list, champ),
      headline: !list.length
        ? "Sin partidas recientes analizables."
        : onChamp.length === 0
          ? `No ha jugado ${c.name} en sus últimas ${list.length} partidas.`
          : `${onChamp.length} de sus últimas ${list.length} partidas con ${c.name}.`,
    });
  }

  const myChampion = champ(me.championId);
  const draft = analyzeDraft(
    { myChampion: myChampion.id, allies: allies.map((a) => a.id), enemies: enemies.map((e) => e.championId) },
    champs,
    myHistory,
  );
  return { inGame: true, simulated: game.simulated, mode: game.gameMode, myChampion, allies, enemies, draft };
}
