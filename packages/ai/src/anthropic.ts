import Anthropic from "@anthropic-ai/sdk";
import type { AiProvider } from "./index.js";
import { buildUserPrompt, COACH_SYSTEM_PROMPT } from "./prompt.js";

export interface AnthropicProviderOptions {
  apiKey: string;
  /** Default model; configurable (decision D-07 in docs/04-decisiones.md). */
  model?: string;
}

/**
 * Anthropic adapter. Short explanations run at low effort. Server-side refusal
 * fallbacks ("default" routing) are enabled, and a request that still ends in
 * refusal is treated as a failure so the caller falls back to deterministic text.
 */
export function anthropicProvider(opts: AnthropicProviderOptions): AiProvider {
  const client = new Anthropic({ apiKey: opts.apiKey, maxRetries: 1 });
  const model = opts.model ?? "claude-opus-5";
  return {
    name: `anthropic:${model}`,
    async explain(req, signal) {
      const response = await client.beta.messages.create(
        {
          model,
          max_tokens: 1024,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          output_config: { effort: "low" },
          system: [{ type: "text", text: COACH_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
          messages: [{ role: "user", content: buildUserPrompt(req) }],
        },
        { signal },
      );
      if (response.stop_reason === "refusal") throw new Error("refused");
      return response.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
        .map((b) => b.text)
        .join("")
        .trim();
    },
  };
}
