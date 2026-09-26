import { suggestItems, suggestStarter, type Catalog, type StarterSuggestion, type Suggestions } from "@coach/itemization";
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
  const starter = opening
    ? suggestStarter({ catalog, map: state.map, position: me.position, championId: me.championId, laneOpponentId: laneOpponent(state)?.championId ?? null })
    : null;
  const items = catalog
    ? suggestItems({ catalog, map: state.map, gold: state.gold, me, enemies: state.enemies, usual: input.usualItems ?? [], previous: input.previousItem ?? null })
    : null;
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
