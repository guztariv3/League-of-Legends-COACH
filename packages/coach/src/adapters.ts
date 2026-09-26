import type { Insight } from "@coach/insights";
import type { Suggestion, Suggestions } from "@coach/itemization";
import { decide, type CoachDecision, type DecisionEvidence } from "./decision.js";

/**
 * Adapters from the existing engines to the decision contract. They add no
 * judgement of their own: they only reshape what each engine already concluded.
 */

function enemyEvidence(s: Suggestions): DecisionEvidence[] {
  const e = s.enemy;
  const out: DecisionEvidence[] = [
    { label: "Enemy magic damage", value: `${Math.round(e.magicShare * 100)}%`, source: "this_game" },
  ];
  if (e.healers.length) out.push({ label: "Enemy healing", value: e.healers.join(", "), source: "this_game" });
  if (e.armor > 0) out.push({ label: "Enemy armor from items", value: String(Math.round(e.armor)), source: "this_game" });
  if (e.magicResist > 0) out.push({ label: "Enemy magic resist from items", value: String(Math.round(e.magicResist)), source: "this_game" });
  return out;
}

function itemDecision(kind: "item" | "boots", s: Suggestion, all: Suggestions, alternatives: Suggestion[]): CoachDecision {
  const path = s.path;
  const buyNow = path.affordableNow;
  const evidence = enemyEvidence(all);
  if (buyNow) evidence.push({ label: "You can buy now", value: `${buyNow.name} (${buyNow.gold} gold)`, source: "this_game" });
  else if (path.remaining > 0) evidence.push({ label: "Gold still needed", value: String(path.remaining), source: "this_game" });
  return decide({
    id: `${kind}:${s.item.id}`,
    kind,
    // The item choice is an interpretation of the enemy team; the numbers behind it are facts.
    basis: "hypothesis",
    priority: kind === "item" ? "important" : "info",
    // Reasons carry the confidence: a suggestion with several independent reasons is firmer.
    confidence: Math.min(0.9, 0.5 + 0.15 * s.reasons.length),
    headline: `${kind === "boots" ? "Boots" : "Next"}: ${s.item.name}`,
    ref: String(s.item.id),
    reasons: s.reasons.length ? s.reasons : [`${s.item.name} fits your champion best right now.`],
    evidence,
    alternatives: alternatives.map((a) => ({ label: a.item.name, ref: String(a.item.id), reason: a.reasons[0] })),
  });
}

/** Item and boots suggestions as decisions; empty when the engine had nothing to suggest. */
export function fromItemSuggestions(s: Suggestions): CoachDecision[] {
  const out: CoachDecision[] = [];
  if (s.next) out.push(itemDecision("item", s.next, s, s.alternatives));
  if (s.boots) out.push(itemDecision("boots", s.boots, s, []));
  return out;
}

/** An insight as an improvement focus. Suppressed insights are not shown, so they give no decision. */
export function fromInsight(i: Insight): CoachDecision | null {
  if (i.priority === "suppressed") return null;
  return decide({
    id: `focus:${i.id}`,
    kind: "focus",
    basis: i.kind,
    priority: i.priority,
    confidence: i.confidence,
    headline: i.title,
    ref: i.metric,
    reasons: [i.detail, i.review ?? ""],
    evidence: i.evidence.map((e) => ({ label: e.label, value: e.value, source: "your_games", sampleSize: i.sampleSize })),
  });
}
