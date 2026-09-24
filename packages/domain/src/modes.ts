/**
 * Game-mode classification. We classify by `gameMode` + `mapId` from the match
 * payload instead of a hard-coded queue table, because queue ids change over
 * time. Only queue ids needed for a label are listed, and anything unknown
 * falls back to "unsupported" so we never apply the wrong metrics.
 */
export type AnalysisMode = "summoners_rift" | "aram" | "unsupported";

export const MAP_SUMMONERS_RIFT = 11;
export const MAP_HOWLING_ABYSS = 12;

export function classifyMode(gameMode: string, mapId: number): AnalysisMode {
  if (gameMode === "CLASSIC" && mapId === MAP_SUMMONERS_RIFT) return "summoners_rift";
  if (gameMode === "ARAM" && mapId === MAP_HOWLING_ABYSS) return "aram";
  return "unsupported";
}

const RANKED_QUEUES: Record<number, string> = {
  420: "Ranked Solo/Duo",
  440: "Ranked Flex",
};

export function queueLabel(queueId: number, mode: AnalysisMode): string {
  const ranked = RANKED_QUEUES[queueId];
  if (ranked) return ranked;
  if (mode === "aram") return "ARAM";
  if (mode === "summoners_rift") return "Summoner's Rift";
  return "Other mode";
}

export function isRankedQueue(queueId: number): boolean {
  return queueId in RANKED_QUEUES;
}
