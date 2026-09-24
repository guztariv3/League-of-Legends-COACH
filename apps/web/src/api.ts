/** Typed client for the Coach API. Types mirror apps/api responses. */

export type Mode = "summoners_rift" | "aram" | "unsupported";

export interface AppConfig {
  dataSource: "riot" | "synthetic";
  auth: { rso: boolean; devLogin: boolean };
  aiEnabled: boolean;
  knowledgeVersion: string | null;
  platforms: { id: string; label: string }[];
}

export interface Account {
  id: string;
  riotId: string;
  platform: string;
  verified: boolean;
  includeInProfile: boolean;
  source: "riot" | "synthetic";
  sync: { status: "never" | "syncing" | "ok" | "error"; error: string | null; lastSyncedAt: string | null; progress: { done: number; total: number } | null };
}

export interface Preferences {
  level: "beginner" | "intermediate" | "advanced" | "expert";
  language: "es" | "en";
}

export interface Me {
  user: { id: string; displayName: string };
  accounts: Account[];
  preferences: Preferences;
}

export interface Insight {
  id: string;
  kind: "fact" | "observation" | "hypothesis";
  priority: "critical" | "important" | "info" | "suppressed";
  confidence: number;
  title: string;
  detail: string;
  evidence: { label: string; value: string }[];
  sampleSize: number;
  matchIds: string[];
}

export interface MatchRow {
  matchId: string;
  accountId: string;
  startedAt: number;
  durationSec: number;
  mode: Mode;
  queue: string;
  patch: string;
  analyzable: boolean;
  win: boolean;
  championName: string;
  role: string;
  kills: number;
  deaths: number;
  assists: number;
  kda: number;
  csPerMin: number | null;
  goldDiff15: number | null;
  headline: string | null;
}

export interface ModeSummary {
  mode: Mode;
  games: number;
  wins: number;
  winRate: number;
  winRateInterval: { low: number; high: number };
  avgKda: number;
  avgCsPerMin: number | null;
  avgGoldDiff10: number | null;
  mainRole: string | null;
  champions: { championName: string; games: number; wins: number }[];
}

export interface Dashboard {
  dataSource: "riot" | "synthetic";
  syncing: boolean;
  summary: { totalGames: number; analyzableGames: number; timelineCoverage: number; modes: ModeSummary[] };
  insights: Insight[];
  insufficientData: boolean;
  recent: MatchRow[];
}

export interface MatchList {
  total: number;
  matches: MatchRow[];
  facets: { champions: string[]; patches: string[]; modes: Mode[] };
}

export interface MatchDetail {
  dataSource: "riot" | "synthetic";
  analysis: MatchRow & {
    killParticipation: number | null;
    damageShare: number | null;
    visionPerMin: number | null;
    goldDiff10: number | null;
    earlyDeaths: number | null;
    laneOpponentChampion: string | null;
    hasTimeline: boolean;
  };
  headline: string | null;
  teams: {
    teamId: number;
    win: boolean;
    players: { championName: string; riotId: string | null; role: string; kills: number; deaths: number; assists: number; cs: number; gold: number; damage: number; items: string[]; isMe: boolean }[];
  }[];
  goldCurve: { minute: number; me: number; opponent: number | null }[] | null;
  myEvents: { minute: number; type: "kill" | "death" | "assist" }[] | null;
}

export interface ChampionList {
  version: string | null;
  source: "ddragon" | "synthetic" | null;
  champions: { id: string; key: number; name: string; title: string; tags: string[]; personal: { games: number; wins: number } }[];
}

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  const res = await fetch(`/api${path}`, { ...init, headers, credentials: "same-origin" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body.error ?? "error", body.message ?? "No se pudo completar la acción.");
  return body as T;
}

export const api = {
  config: () => request<AppConfig>("/config"),
  me: () => request<Me>("/me"),
  devLogin: (displayName: string) => request<{ user: Me["user"] }>("/auth/dev-login", { method: "POST", body: JSON.stringify({ displayName }) }),
  logout: () => request<{ ok: true }>("/auth/logout", { method: "POST", body: "{}" }),
  deleteMe: () => request<{ ok: true }>("/me", { method: "DELETE" }),
  linkAccount: (gameName: string, tagLine: string, platform: string) =>
    request<{ account: Account }>("/accounts", { method: "POST", body: JSON.stringify({ gameName, tagLine, platform }) }),
  updateAccount: (id: string, includeInProfile: boolean) =>
    request<{ account: Account }>(`/accounts/${id}`, { method: "PATCH", body: JSON.stringify({ includeInProfile }) }),
  deleteAccount: (id: string) => request<{ ok: true }>(`/accounts/${id}`, { method: "DELETE" }),
  syncAll: () => request<{ started: string[] }>("/sync", { method: "POST", body: "{}" }),
  dashboard: () => request<Dashboard>("/dashboard"),
  matches: (params: Record<string, string>) => request<MatchList>(`/matches?${new URLSearchParams(params)}`),
  match: (id: string) => request<MatchDetail>(`/matches/${encodeURIComponent(id)}`),
  champions: () => request<ChampionList>("/champions"),
  explain: (insightId: string) =>
    request<{ text: string; source: "ai" | "deterministic" }>("/coach/explain", { method: "POST", body: JSON.stringify({ insightId }) }),
  savePreferences: (p: Preferences) => request<Preferences>("/preferences", { method: "PUT", body: JSON.stringify(p) }),
};
