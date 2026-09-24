import { describe, expect, it } from "vitest";
import type { Insight } from "@coach/insights";
import { explainInsight, passesIntegrityGuard, type AiProvider } from "./index.js";

const insight: Insight = {
  id: "early-deaths",
  kind: "observation",
  priority: "important",
  confidence: 0.7,
  title: "Mueres 2 o más veces antes del minuto 14 en 12 de 30 partidas",
  detail: "En esas partidas perdiste el 67%; en el resto, el 44%.",
  evidence: [{ label: "Partidas con timeline (SR)", value: "30" }],
  sampleSize: 30,
  matchIds: [],
};

const provider = (text: string | Error): AiProvider => ({
  name: "fake",
  explain: async () => {
    if (text instanceof Error) throw text;
    return text;
  },
});

describe("integrity guard", () => {
  it("accepts text that only reuses known numbers", () => {
    expect(passesIntegrityGuard("En 12 de 30 partidas mueres pronto; revisa esos primeros 14 minutos.", insight)).toBe(true);
  });
  it("rejects invented numbers", () => {
    expect(passesIntegrityGuard("Los jugadores de tu rango mueren 1.2 veces de media.", insight)).toBe(false);
  });
  it("rejects empty or overly long text", () => {
    expect(passesIntegrityGuard("  ", insight)).toBe(false);
    expect(passesIntegrityGuard("a".repeat(700), insight)).toBe(false);
  });
});

describe("explainInsight", () => {
  const req = { insight, level: "intermediate" as const, language: "es" as const };

  it("falls back to deterministic text with no providers", async () => {
    const r = await explainInsight([], req);
    expect(r.source).toBe("deterministic");
    expect(r.text).toContain(insight.title);
  });

  it("uses the next provider when one fails, and rejects hallucinated numbers", async () => {
    const r = await explainInsight([provider(new Error("down")), provider("Tienes 99 muertes."), provider("En 12 de 30 partidas mueres antes del 14.")], req);
    expect(r).toMatchObject({ source: "ai", text: "En 12 de 30 partidas mueres antes del 14." });
  });
});
