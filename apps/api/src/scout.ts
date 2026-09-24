import { analyzeMatch, mean, type MatchAnalysis } from "@coach/analysis";
import { normalizeMatch, type RawMatch, type Role } from "@coach/domain";
import { analyzeDraft, type DraftAnalysis } from "@coach/draft";
import type { KnowledgeRegistry } from "@coach/knowledge";
import { eq } from "drizzle-orm";
import { schema, type Db } from "./db/index.js";
import type { MatchSource } from "./sources.js";

/**
 * Enemy scouting from the loading screen (brief §43, decision D-03). The
 * data comes from spectator-v5, which only answers once the game has started,
 * so nothing is revealed during champion select. For each rival it reads
 * their most recent games (budgeted) and reports small, descriptive facts
 * with sample sizes. Rank is not shown because its PUUID endpoint has not
 * been verified (docs/01-investigacion.md).
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
      enemies.push({ ...base, available: false, games: 0, wins: 0, gamesOnChampion: 0, winsOnChampion: 0, mainRole: null, avgKda: null, smallSample: true, headline: "Información no disponible para este jugador." });
      continue;
    }
    const list = await recentAnalyses(deps.db, deps.source, account.platform, p.puuid);
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
