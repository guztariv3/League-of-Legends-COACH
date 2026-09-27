/** Display-only protocol: the web never independently recalculates advice. No local credentials. */
export interface LiveSection { title: string; lines: string[]; primary?: boolean }
export interface LiveFrame {
  version: 1; streamId: string; sequence: number; capturedAt: number;
  phase: "idle" | "draft" | "pregame" | "loading" | "live" | "paused" | "reconnecting" | "ended";
  champion: string | null; position: string | null; patch: string | null; time: number | null; gold: number | null;
  allies: string[]; enemies: string[]; headline: string; sections: LiveSection[];
}
export interface DraftReadView {
 champion: string; teamFit: string; versus: string; advantage: string; concern: string; matchup: string; coverage: string; evidence: string[]; unknown: string[];
}
