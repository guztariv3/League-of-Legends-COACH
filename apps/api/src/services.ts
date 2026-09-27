import type { MatchAnalysis } from "@coach/analysis";
import { playerMemory, type MemoryInput } from "@coach/coach";
import { generateInsights, type GoalMetric, GOAL_METRICS, type InsightOptions } from "@coach/insights";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { schema, type Db } from "./db/index.js";
import { analysesFor, userAccounts } from "./queries.js";
import type { MatchSource } from "./sources.js";

export const MemoryCategories = z.object({
  focus: z.boolean().default(true),
  correction: z.boolean().default(true),
  note: z.boolean().default(true),
  /** Patterns read from the player's own games (recurring mistakes, strengths, playstyle), phase 5. */
  patterns: z.boolean().default(true),
});

export const Preferences = z.object({
  level: z.enum(["beginner", "intermediate", "advanced", "expert"]).default("intermediate"),
  language: z.enum(["es", "en"]).default("en"),
  /** Which Coach memory categories are used and recorded (brief §48). */
  memory: MemoryCategories.default({ focus: true, correction: true, note: true, patterns: true }),
});
export type Preferences = z.infer<typeof Preferences>;

export function makeServices(db: Db, source: MatchSource) {
  const prefsFor = async (userId: string): Promise<Preferences> => {
    const [row] = await db.select().from(schema.preferences).where(eq(schema.preferences.userId, userId));
    return Preferences.parse(row?.data ?? {});
  };

  /** Analyses of the accounts the player chose to include in their profile. */
  const profileAnalyses = async (userId: string) => {
    const accounts = (await userAccounts(db, userId)).filter((a) => a.includeInProfile);
    return { accounts, analyses: await analysesFor(db, accounts) };
  };

  /** Focus and corrections from Coach memory, honouring disabled categories. */
  const insightOptions = async (userId: string): Promise<InsightOptions> => {
    const prefs = await prefsFor(userId);
    const memory = await db.select().from(schema.coachMemory).where(eq(schema.coachMemory.userId, userId));
    const focusRef = prefs.memory.focus ? memory.find((m) => m.category === "focus")?.ref : undefined;
    return {
      focus: focusRef && focusRef in GOAL_METRICS ? (focusRef as GoalMetric) : null,
      dismissed: prefs.memory.correction ? memory.filter((m) => m.category === "correction" && m.ref).map((m) => m.ref!) : [],
    };
  };

  /** Recurring patterns and playstyle from the player's games (phase 5); null when turned off. */
  const memoryFor = async (userId: string, ctx: { champion?: string | null; position?: string | null; reference?: MemoryInput["reference"]; analyses?: MatchAnalysis[] } = {}) => {
    if (!(await prefsFor(userId)).memory.patterns) return null;
    const history = ctx.analyses ?? (await profileAnalyses(userId)).analyses;
    return playerMemory({ history, champion: ctx.champion ?? null, position: ctx.position ?? null, reference: ctx.reference ?? null });
  };

  const insightsFor = async (userId: string, maxVisible = 3) => {
    const { accounts, analyses } = await profileAnalyses(userId);
    const result = generateInsights({ analyses, dataSource: source.kind }, { ...(await insightOptions(userId)), maxVisible });
    return { accounts, analyses, ...result };
  };

  const activeGoals = (userId: string) =>
    db.select().from(schema.goals).where(and(eq(schema.goals.userId, userId), eq(schema.goals.status, "active")));

  /** Records a recommendation and what the player decided; failures never block the user action. */
  const logDecision = async (entry: {
    userId: string;
    kind: "goal_suggestion" | "insight" | "draft";
    ref?: string | null;
    title: string;
    context?: Record<string, unknown>;
    decision: "accepted" | "rejected" | "dismissed" | "none";
  }) => {
    try {
      await db.insert(schema.recommendationLog).values({ ...entry, ref: entry.ref ?? null, context: entry.context ?? {} });
    } catch (err) {
      console.warn("[history] could not record decision", err);
    }
  };

  return { prefsFor, profileAnalyses, insightOptions, insightsFor, memoryFor, activeGoals, logDecision };
}

export type Services = ReturnType<typeof makeServices>;
