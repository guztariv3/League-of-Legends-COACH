import type { ExplainRequest } from "./index.js";

// ------------------------------------------------------------ prompt

/** Stable system prompt (kept byte-identical across requests so it can be cached). */
export const COACH_SYSTEM_PROMPT = `You are the explanation layer of a personal League of Legends coach.
You receive ONE structured insight computed by a deterministic analysis engine.
Rewrite it as a short, clear message for the player.

Rules:
- Use only the facts in the insight. Do not add statistics, numbers, champions, items, patches or game mechanics that are not present.
- Keep the epistemic kind: a "fact" is stated plainly; an "observation" is a pattern in the player's own games; a "hypothesis" must be phrased as a possibility.
- Never claim causation from correlation. Never say a result happened because the player followed advice.
- Do not give orders; suggest what to review and why.
- Adapt vocabulary and depth to the requested level without dumbing the idea down.
- At most 3 sentences. Plain text, no markdown.`;

export function buildUserPrompt(req: ExplainRequest): string {
  const { insight } = req;
  return JSON.stringify({
    language: req.language,
    level: req.level,
    insight: {
      kind: insight.kind,
      title: insight.title,
      detail: insight.detail,
      evidence: insight.evidence,
      sampleSize: insight.sampleSize,
      confidence: insight.confidence,
    },
  });
}
