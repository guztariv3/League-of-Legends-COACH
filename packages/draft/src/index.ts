import { compareMeans, wilson, type MatchAnalysis } from "@coach/analysis";
import type { Champion } from "@coach/knowledge";

/**
 * Pre-game / draft analysis (brief §41–44, decision D-03): works on
 * champions only. It never looks up or reveals players during champion
 * select. Composition signals come from Data Dragon's class tags and 0–10
 * ratings, so they are approximate and always labelled as such. Personal
 * notes come from the player's own games, with sample sizes.
 */
export const DRAFT_VERSION = 1;

export interface Composition {
  champions: { id: string; name: string; tags: string[] }[];
  /** Champions whose class tags include Tank or Fighter. */
  frontline: number;
  classes: Record<string, number>;
  /** Approximate share of magic vs physical damage from Data Dragon ratings; null if unknown. */
  magicShare: number | null;
  /** Champions without ratings (excluded from the damage estimate). */
  unrated: number;
}

export interface DraftPoint {
  id: string;
  kind: "fact" | "observation" | "hypothesis";
  title: string;
  detail: string;
  /** Higher = more important; only the top 3 are shown first. */
  weight: number;
}

export interface DraftInput {
  /** Riot champion ids (e.g. "MonkeyKing"). */
  myChampion: string;
  allies: string[];
  enemies: string[];
  /** Optional: the enemy champion expected in the player's lane. */
  laneOpponent?: string;
}

export interface DraftAnalysis {
  version: number;
  ally: Composition;
  enemy: Composition;
  /** Up to 3 points, most important first ("esto es lo que más importa"). */
  keyPoints: DraftPoint[];
  /** Everything else, on demand. */
  morePoints: DraftPoint[];
  personal: {
    withChampion: { games: number; wins: number; interval: { low: number; high: number } };
    vsOpponent: { games: number; wins: number } | null;
  };
  unknownChampions: string[];
  limits: string[];
}

export const DRAFT_LIMITS = [
  "El perfil de daño es aproximado: se basa en las valoraciones generales de Data Dragon, no en builds ni habilidades concretas.",
  "Las clases (Tank, Fighter…) son etiquetas oficiales generales; no describen engage, peel ni escalado.",
  "En la selección de campeones no se consulta información de otros jugadores.",
];

export function composition(ids: string[], champions: Map<string, Champion>): Composition {
  const list = ids.map((id) => champions.get(id)).filter((c): c is Champion => c !== undefined);
  const classes: Record<string, number> = {};
  for (const c of list) for (const t of c.tags) classes[t] = (classes[t] ?? 0) + 1;
  const rated = list.filter((c) => c.info);
  const magic = rated.reduce((s, c) => s + c.info!.magic, 0);
  const attack = rated.reduce((s, c) => s + c.info!.attack, 0);
  return {
    champions: list.map((c) => ({ id: c.id, name: c.name, tags: c.tags })),
    frontline: list.filter((c) => c.tags.includes("Tank") || c.tags.includes("Fighter")).length,
    classes,
    magicShare: rated.length && magic + attack > 0 ? magic / (magic + attack) : null,
    unrated: list.length - rated.length,
  };
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** What separates the player's wins from their losses on this champion (own data only). */
function personalWinCondition(games: MatchAnalysis[], name: string): DraftPoint | null {
  const wins = games.filter((g) => g.win);
  const losses = games.filter((g) => !g.win);
  if (wins.length < 5 || losses.length < 5) return null;
  const metrics: [string, (a: MatchAnalysis) => number | null, boolean, number][] = [
    ["muertes antes del minuto 14", (a) => a.earlyDeaths, false, 1],
    ["CS por minuto", (a) => a.csPerMin, true, 1],
    ["participación en kills", (a) => a.killParticipation, true, 2],
    ["oro frente a tu rival al 10", (a) => a.goldDiff10, true, 0],
  ];
  let best: { label: string; w: number; l: number; t: number; digits: number } | null = null;
  for (const [label, pick, , digits] of metrics) {
    const w = wins.map(pick).filter((v): v is number => v !== null);
    const l = losses.map(pick).filter((v): v is number => v !== null);
    const cmp = compareMeans(w, l, 5);
    if (cmp.consolidated && (!best || Math.abs(cmp.t) > Math.abs(best.t))) best = { label, w: cmp.a, l: cmp.b, t: cmp.t, digits };
  }
  if (!best) return null;
  const fmt = (x: number) => (best!.label.startsWith("participación") ? pct(x) : x.toFixed(best!.digits));
  return {
    id: "personal-wincon",
    kind: "observation",
    title: `Con ${name}, lo que más separa tus victorias de tus derrotas es tu ${best.label}`,
    detail: `${fmt(best.w)} en victorias frente a ${fmt(best.l)} en derrotas (${wins.length} victorias, ${losses.length} derrotas). Es una diferencia observada en tus partidas, no una causa demostrada.`,
    weight: 0.9,
  };
}

export function analyzeDraft(input: DraftInput, knowledge: Champion[], history: MatchAnalysis[]): DraftAnalysis {
  const champions = new Map(knowledge.map((c) => [c.id, c]));
  const allyIds = [input.myChampion, ...input.allies.filter((a) => a !== input.myChampion)];
  const unknownChampions = [...allyIds, ...input.enemies].filter((id) => !champions.has(id));
  const ally = composition(allyIds, champions);
  const enemy = composition(input.enemies, champions);
  const me = champions.get(input.myChampion);
  const myName = me?.name ?? input.myChampion;
  const points: DraftPoint[] = [];

  // Enemy damage profile (hypothesis from ratings)
  if (enemy.magicShare !== null && enemy.champions.length >= 3) {
    if (enemy.magicShare >= 0.65 || enemy.magicShare <= 0.35) {
      const magic = enemy.magicShare >= 0.65;
      points.push({
        id: "enemy-damage",
        kind: "hypothesis",
        title: `El daño rival parece sobre todo ${magic ? "mágico" : "físico"}`,
        detail: `Según las valoraciones de Data Dragon, alrededor del ${pct(magic ? enemy.magicShare : 1 - enemy.magicShare)} de su perfil de daño es ${magic ? "mágico" : "físico"}. Si compras defensas, la ${magic ? "resistencia mágica" : "armadura"} probablemente rinda más. Confírmalo con sus builds en la partida.`,
        weight: 0.8,
      });
    }
  }
  if (ally.magicShare !== null && ally.champions.length >= 3 && (ally.magicShare >= 0.75 || ally.magicShare <= 0.25)) {
    const magic = ally.magicShare >= 0.75;
    points.push({
      id: "ally-damage",
      kind: "hypothesis",
      title: `Tu equipo depende mucho del daño ${magic ? "mágico" : "físico"}`,
      detail: `Si el rival acumula ${magic ? "resistencia mágica" : "armadura"}, a tu equipo le puede costar más. Es una estimación a partir de valoraciones generales.`,
      weight: 0.6,
    });
  }

  // Frontline (fact about tags, hypothesis about the consequence)
  if (ally.champions.length >= 3 && ally.frontline === 0) {
    points.push({
      id: "no-frontline",
      kind: "hypothesis",
      title: "Tu equipo no tiene primera línea clara",
      detail: "Ningún aliado tiene la etiqueta Tank o Fighter. Las peleas largas de frente podrían costaros; pelear con ventaja de posición suele importar más.",
      weight: 0.7,
    });
  } else if (enemy.frontline >= 3 && ally.frontline <= 1) {
    points.push({
      id: "frontline-gap",
      kind: "hypothesis",
      title: "El rival tiene bastante más primera línea",
      detail: `${enemy.frontline} rivales son Tank o Fighter frente a ${ally.frontline} de tu equipo.`,
      weight: 0.55,
    });
  }
  if ((enemy.classes["Assassin"] ?? 0) >= 2) {
    points.push({
      id: "enemy-assassins",
      kind: "hypothesis",
      title: "Varios asesinos en el equipo rival",
      detail: "Con dos o más campeones de tipo Assassin, suelen buscar eliminaciones sobre objetivos frágiles; la visión y no ir solo cobran importancia.",
      weight: 0.5,
    });
  }

  // Personal layer (facts from the player's own games)
  const mine = history.filter((a) => a.analyzable && a.championName === input.myChampion);
  const wins = mine.filter((a) => a.win).length;
  const vs = input.laneOpponent ? mine.filter((a) => a.laneOpponentChampion === input.laneOpponent) : null;
  const opponentName = input.laneOpponent ? champions.get(input.laneOpponent)?.name ?? input.laneOpponent : null;
  if (mine.length === 0) {
    points.push({ id: "new-champion", kind: "fact", title: `Aún no tienes partidas analizadas con ${myName}`, detail: "No hay historial propio en el que apoyarse para este campeón.", weight: 0.4 });
  } else {
    points.push({
      id: "champion-record",
      kind: "fact",
      title: `Con ${myName}: ${wins} ${wins === 1 ? "victoria" : "victorias"} en ${mine.length} ${mine.length === 1 ? "partida" : "partidas"}`,
      detail: mine.length < 10 ? "Es una muestra pequeña; tómalo como referencia, no como tendencia." : `Rango probable de victorias: ${pct(wilson(wins, mine.length).low)}–${pct(wilson(wins, mine.length).high)}.`,
      weight: 0.45,
    });
  }
  if (vs && opponentName) {
    const vsWins = vs.filter((a) => a.win).length;
    points.push({
      id: "matchup-record",
      kind: "fact",
      title: vs.length ? `Contra ${opponentName} en línea: ${vsWins} de ${vs.length}` : `No tienes partidas con ${myName} contra ${opponentName} en línea`,
      detail: vs.length && vs.length < 5 ? "Muy pocas partidas para sacar conclusiones." : "",
      weight: vs.length >= 3 ? 0.65 : 0.35,
    });
  }
  const wincon = personalWinCondition(mine, myName);
  if (wincon) points.push(wincon);

  points.sort((a, b) => b.weight - a.weight);
  return {
    version: DRAFT_VERSION,
    ally,
    enemy,
    keyPoints: points.slice(0, 3),
    morePoints: points.slice(3),
    personal: {
      withChampion: { games: mine.length, wins, interval: wilson(wins, mine.length) },
      vsOpponent: vs ? { games: vs.length, wins: vs.filter((a) => a.win).length } : null,
    },
    unknownChampions,
    limits: DRAFT_LIMITS,
  };
}
