import { purchasePath, suggestItems, suggestStarter, type Catalog, type CatalogItem, type StarterSuggestion, type Suggestion, type Suggestions } from "@coach/itemization";
import { goldDifference, laneOpponent, objectives, type GameState, type GoldDifference, type Objectives } from "@coach/live";
import { fromItemSuggestions } from "./adapters.js";
import { decide, type CoachDecision } from "./decision.js";
import { adviseSkill, type Slot } from "./skills.js";
import { strategyFacts } from "./strategy.js";

/**
 * Everything the live window shows, computed in one place from the game state.
 * The window only renders this; it never decides.
 */

export interface LiveCoachInput {
  state: GameState;
  /** Data Dragon catalog; without it there are no item suggestions. */
  catalog: Catalog | null;
  /** Items the player usually finishes with this champion. */
  usualItems?: number[];
  /** The previous item suggestion, kept unless another is clearly better. */
  previousItem?: number | null;
  /** The player's past levelling orders with this champion. */
  skillHistory?: Slot[][];
  /**
   * The site's build engine answer for this moment of the game (packages/build). When present it
   * replaces the local suggestions; without a connected site the local rules still run.
   */
  engine?: EngineItems | null;
}

interface EnginePick { id: number; name: string; score: number; why: string[] }
/** The part of the build engine's answer (BuildRecommendation) the live window uses. */
export interface EngineItems {
  first: EnginePick | null;
  next: EnginePick[];
  boots: EnginePick | null;
  situational: (EnginePick & { when: string })[];
  starter: { items: { id: number; name: string; gold: number }[]; why: string[] } | null;
}

/** The engine's answer in the live window's shape, with the purchase path from the catalog. */
export function fromEngine(engine: EngineItems, local: Suggestions | null, catalog: Catalog, inventory: number[], gold: number | null): Suggestions {
  const one = (p: EnginePick | null, extra: string[] = []): Suggestion | null => {
    const item = p ? catalog.items.get(p.id) : undefined;
    return p && item ? { item, score: p.score, reasons: [...p.why, ...extra], path: purchasePath(item, inventory, gold, catalog) } : null;
  };
  const alternatives = [
    ...engine.next.map((p) => one(p)),
    ...engine.situational.map((p) => one(p, [p.when])),
  ].filter((x): x is Suggestion => x !== null).slice(0, 3);
  const next = one(engine.first);
  return {
    next,
    alternatives,
    boots: one(engine.boots),
    enemy: local?.enemy ?? { magicShare: 0.5, healers: [], armor: 0, magicResist: 0 },
    note: next ? null : "Nothing left to suggest for this game.",
  };
}

export interface LiveCoach {
  decisions: CoachDecision[];
  items: Suggestions | null;
  starter: StarterSuggestion | null;
  skill: CoachDecision | null;
  strategy: CoachDecision[];
  gold: GoldDifference | null;
  objectives: Objectives | null;
}

/** The starting shop visit: the first minutes, before anything but trinkets was bought. */
export const STARTER_WINDOW_SEC = 150;

function starterDecision(s: StarterSuggestion): CoachDecision {
  return decide({
    id: `starter:${s.items.map((i) => i.id).join("+")}`,
    kind: "item",
    basis: "hypothesis",
    priority: "important",
    confidence: 0.8,
    headline: `Start: ${s.items.map((i) => i.name).join(" + ")}`,
    ref: String(s.items[0]!.id),
    reasons: s.reasons,
    alternatives: s.alternatives.map((a) => ({ label: a.name, ref: String(a.id) })),
  });
}

export function liveCoach(input: LiveCoachInput): LiveCoach {
  const { state, catalog } = input;
  const me = state.me;
  const gold = goldDifference(state);
  const obj = objectives(state);
  if (!me) return { decisions: [], items: null, starter: null, skill: null, strategy: [], gold, objectives: obj };

  const opening = catalog && state.time < STARTER_WINDOW_SEC && me.itemGold < 300;
  const engine = input.engine ?? null;
  const engineStarter = engine?.starter
    ? { items: engine.starter.items.map((i) => catalog?.items.get(i.id)).filter((i): i is CatalogItem => i !== undefined), reasons: engine.starter.why, alternatives: [] }
    : null;
  const starter = opening
    ? engineStarter?.items.length
      ? engineStarter
      : suggestStarter({ catalog, map: state.map, position: me.position, championId: me.championId, laneOpponentId: laneOpponent(state)?.championId ?? null })
    : null;
  const local = catalog
    ? suggestItems({ catalog, map: state.map, gold: state.gold, me, enemies: state.enemies, usual: input.usualItems ?? [], previous: input.previousItem ?? null })
    : null;
  const items = catalog && engine ? fromEngine(engine, local, catalog, me.items, state.gold) : local;
  const skill = state.abilities && state.skillPoints !== null
    ? adviseSkill({ champion: me.champion, level: me.level, ranks: state.abilities, skillPoints: state.skillPoints, history: input.skillHistory ?? [] })
    : null;
  const strategy = strategyFacts({ gold, objectives: obj, myName: me.name });

  const decisions = [
    ...(starter ? [starterDecision(starter)] : items ? fromItemSuggestions(items) : []),
    ...(skill ? [skill] : []),
    ...strategy,
  ];
  return { decisions, items, starter, skill, strategy, gold, objectives: obj };
}
