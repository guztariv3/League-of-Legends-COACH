import { planPurchases, purchasePath, suggestItems, type PurchasePlan, suggestStarter, type Catalog, type CatalogItem, type StarterSuggestion, type Suggestion, type Suggestions } from "@coach/itemization";
import { goldDifference, laneOpponent, objectives, type GameState, type GoldDifference, type Objectives } from "@coach/live";
import { fromItemSuggestions } from "./adapters.js";
import { decide, type CoachDecision } from "./decision.js";
import { phaseDecisions } from "./phase.js";
import { adviseSkill, type SkillReference, type Slot } from "./skills.js";
import { readSituation, situationDecisions, type Situation } from "./situation.js";
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
  /** What Master+ players level with this champion on this patch (only used without enough of the player's own games). */
  skillReference?: SkillReference | null;
  /**
   * The site's build engine answer for this moment of the game (packages/build). When present it
   * replaces the local suggestions; without a connected site the local rules still run.
   */
  engine?: EngineItems | null;
}

interface EnginePick { id: number; name: string; score: number; why: string[]; timing?: { remaining: number; seconds: number | null; reason: string } }
/** The part of the build engine's answer (BuildRecommendation) the live window uses. */
export interface EngineItems {
  componentUtility?: Record<number, number>;
  first: EnginePick | null;
  next: EnginePick[];
  boots: EnginePick | null;
  situational: (EnginePick & { when: string })[];
  starter: { items: { id: number; name: string; gold: number }[]; why: string[] } | null;
  /** Phase 3: how sure the next item is, its close runner-up, and the standard core it keeps or replaces. */
  certainty?: "strong" | "preferred" | "close" | null;
  alternative?: (EnginePick & { difference: string }) | null;
  adaptation?: { standard: boolean; standardCore: { id: number; name: string }[]; note: string } | null;
}

/** The engine's certainty as a decision confidence (the words come from certaintyOf). */
const ENGINE_CONFIDENCE = { strong: 0.85, preferred: 0.7, close: 0.5 } as const;

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
  /** What to buy with the gold you have now, and when the next items arrive at your pace. */
  purchase: PurchasePlan | null;
  /** Where you stand (lane, team, health, next spike): the live game plan is built from it. */
  situation: Situation | null;
  /** The live plan and warnings (also among `decisions`), most important first. */
  plan: CoachDecision[];
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
  if (!me) return { decisions: [], items: null, starter: null, skill: null, strategy: [], gold, objectives: obj, purchase: null, situation: null, plan: [] };

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
  // The build in order (the engine's core when the site is connected, else the local suggestion).
  const targets = catalog
    ? (engine ? [engine.first, ...engine.next] : [local?.next ?? null]).map((p) => (p ? catalog.items.get("item" in p ? p.item.id : p.id) : undefined)).filter((i): i is CatalogItem => i !== undefined)
    : [];
  const purchase = catalog && targets.length && !opening
    ? planPurchases({ targets, inventory: me.items, gold: state.gold, time: state.time, itemGold: me.itemGold, catalog, ...(engine?.componentUtility ? { utility: engine.componentUtility } : {}) })
    : null;
  const skill = state.abilities && state.skillPoints !== null
    ? adviseSkill({ champion: me.champion, level: me.level, ranks: state.abilities, skillPoints: state.skillPoints, history: input.skillHistory ?? [], reference: input.skillReference ?? null })
    : null;
  const strategy = strategyFacts({ gold, objectives: obj, myName: me.name });

  // The next-item decision carries what the gold in your pocket buys toward it right now.
  const itemDecisions = (items ? fromItemSuggestions(items) : []).map((d) => d.kind === "item" && purchase?.now
    ? { ...d, evidence: [...d.evidence.filter((e) => e.label !== "You can buy now"), { label: "Buy now", value: `${purchase.now.buys.map((b) => b.name).join(" + ")} (${purchase.now.spent} gold)`, source: "this_game" as const }] }
    : d)
    // The engine says how sure it is, whether the standard core still holds, and which close option it weighed.
    .map((d) => d.kind === "item" && engine?.first && d.ref === String(engine.first.id) && engine.certainty
      ? {
          ...d,
          confidence: ENGINE_CONFIDENCE[engine.certainty],
          reasons: engine.adaptation ? [engine.adaptation.note, ...d.reasons] : d.reasons,
          alternatives: engine.alternative ? [{ label: engine.alternative.name, ref: String(engine.alternative.id), reason: engine.alternative.difference }] : d.alternatives,
        }
      : d);
  const situation = readSituation(state, gold, obj, purchase, catalog);
  const plan = [
    ...(situation && !opening ? situationDecisions(situation, { time: state.time, isDead: me.isDead, purchase }) : []),
    // Windows the game just opened: an enemy died, a level edge, long death timers (phase 6).
    ...(!opening ? phaseDecisions({ state, turretsDown: obj ? obj.ally.turrets + obj.enemy.turrets : 0, purchase }) : []),
  ];
  const decisions = [
    ...plan,
    ...(starter ? [starterDecision(starter)] : itemDecisions),
    ...(skill ? [skill] : []),
    ...strategy,
  ];
  return { decisions, items, starter, skill, strategy, gold, objectives: obj, purchase, situation, plan };
}
