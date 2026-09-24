import type { Insight } from "@coach/insights";

/**
 * Provider-agnostic AI layer. The LLM only rephrases insights that the
 * deterministic pipeline already produced. It never decides whether an insight
 * exists, its priority or its kind, and every output passes an integrity
 * guard. If no provider is configured, or any step fails, the caller gets the
 * deterministic text.
 */

export type ExplanationLevel = "beginner" | "intermediate" | "advanced" | "expert";

export interface ExplainRequest {
  insight: Insight;
  level: ExplanationLevel;
  language: "es" | "en";
}

export interface AiProvider {
  readonly name: string;
  explain(req: ExplainRequest, signal?: AbortSignal): Promise<string>;
}

export interface Explanation {
  text: string;
  source: "ai" | "deterministic";
  provider?: string;
}

/** Deterministic explanation: always available, never invents anything. */
export function deterministicExplanation(insight: Insight): string {
  return `${insight.title}. ${insight.detail}`;
}

const NUMBER = /[-+]?\d+(?:[.,]\d+)?/g;

/**
 * Integrity guard: every number in the generated text must already appear in
 * the insight's own text or evidence. This stops the model from inventing
 * statistics. Long outputs are rejected too (the Coach must stay concise).
 */
export function passesIntegrityGuard(text: string, insight: Insight, maxChars = 600): boolean {
  if (!text.trim() || text.length > maxChars) return false;
  const source = [insight.title, insight.detail, ...insight.evidence.flatMap((e) => [e.label, e.value]), String(insight.sampleSize)].join(" ");
  const allowed = new Set((source.match(NUMBER) ?? []).map((n) => n.replace(",", ".").replace(/^\+/, "")));
  return (text.match(NUMBER) ?? []).every((n) => allowed.has(n.replace(",", ".").replace(/^\+/, "")));
}

/** Try providers in order (fallback chain); fall back to deterministic text. */
export async function explainInsight(
  providers: AiProvider[],
  req: ExplainRequest,
  opts: { timeoutMs?: number } = {},
): Promise<Explanation> {
  for (const provider of providers) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 20_000);
    try {
      const text = (await provider.explain(req, ctrl.signal)).trim();
      if (passesIntegrityGuard(text, req.insight)) return { text, source: "ai", provider: provider.name };
    } catch {
      // Next provider. Failures are logged by the caller's observability layer.
    } finally {
      clearTimeout(timer);
    }
  }
  return { text: deterministicExplanation(req.insight), source: "deterministic" };
}

export { COACH_SYSTEM_PROMPT, buildUserPrompt } from "./prompt.js";
export { anthropicProvider } from "./anthropic.js";
