/** Typed client for the Coach API. Types mirror apps/api responses. */

export type Mode = "summoners_rift" | "aram" | "unsupported";

export interface AppConfig {
  dataSource: "riot" | "synthetic";
  auth: { rso: boolean; devLogin: boolean };
  aiEnabled: boolean;
  knowledgeVersion: string | null;
  platforms: { id: string; label: string }[];
}

/** Static game data for icons (see apps/api `/assets`). `cdn` is null for the synthetic catalog. */
export interface GameAssets {
  version: string | null;
  cdn: string | null;
  champions: { key: number; id: string; name: string }[];
  spells: { key: number; id: string; name: string }[];
  runes: { id: number; name: string; icon: string; style: boolean }[];
  items: { id: number; name: string }[];
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

export type MemoryCategory = "focus" | "correction" | "note";

export interface Preferences {
  level: "beginner" | "intermediate" | "advanced" | "expert";
  language: "es" | "en";
  memory: Record<MemoryCategory, boolean>;
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
  metric?: string;
  review?: string;
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
  analysis: MatchRow & { championId: number;
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
    players: { championName: string; riotId: string | null; role: string; kills: number; deaths: number; assists: number; cs: number; gold: number; damage: number; championId: number; items: { id: number; name: string }[]; spells: number[]; runes: { keystone: number | null; primary: number | null; secondary: number | null }; isMe: boolean }[];
  }[];
  goldCurve: { minute: number; me: number; opponent: number | null }[] | null;
  myEvents: { minute: number; type: "kill" | "death" | "assist" }[] | null;
}

export interface ChampionList {
  version: string | null;
  source: "ddragon" | "synthetic" | null;
  champions: { id: string; key: number; name: string; title: string; tags: string[]; personal: { games: number; wins: number } }[];
}

export interface Dimension {
  id: string;
  label: string;
  headline: string;
  metrics: { label: string; value: string }[];
  sampleSize: number;
  confidence: number;
  trend: "improving" | "declining" | "stable" | "unknown";
}

export interface StateBucket {
  state: "ahead" | "even" | "behind";
  games: number;
  wins: number;
  winRate: number;
  interval: { low: number; high: number };
  lateDeathsPerMin: number | null;
}

export interface Profile {
  profiles: { mode: Mode; mainRole: string | null; games: number; dimensions: Dimension[] }[];
  gameState: StateBucket[];
}

export interface Goal {
  id: string;
  metric: string;
  target: number;
  title: string;
  note: string | null;
  source: "coach" | "user";
  createdAt: string;
  progress: { games: number; met: number; rate: number; baselineRate: number; status: "collecting" | "in_progress" | "consolidated"; summary: string };
}

export interface GoalSuggestion {
  metric: string;
  target: number;
  title: string;
  reason: string;
}

export interface GoalsResponse {
  goals: Goal[];
  suggestions: GoalSuggestion[];
  max: number;
  metrics: { id: string; label: string }[];
}

export interface MemoryItem {
  id: string;
  category: MemoryCategory;
  content: string;
  ref: string | null;
  createdAt: string;
}

export interface SearchResult {
  type: "champion" | "matchup" | "matches" | "profile" | "insight";
  title: string;
  subtitle?: string;
  href: string;
}

export interface ChampionDetail {
  champion: { id: string; key: number; name: string; title: string; tags: string[] } | null;
  knowledgeVersion: string | null;
  personal: {
    games: number;
    wins: number;
    interval: { low: number; high: number };
    comparisons: { label: string; value: string; others: string | null; verdict: "better" | "worse" | "similar"; sample: number }[];
    opponents: { opponent: string; games: number; wins: number }[];
    recent: { matchId: string; win: boolean; kills: number; deaths: number; assists: number; startedAt: number; mode: Mode }[];
  };
}

export type MomentCategory = "error" | "opportunity" | "good" | "event";

export interface KeyMoment {
  id: string;
  t: number;
  category: MomentCategory;
  kind: "fact" | "observation" | "hypothesis";
  confidence: number;
  title: string;
  detail: string;
  evidence: { label: string; value: string }[];
  goldSwing: number;
  position: { x: number; y: number } | null;
}

export interface MatchReview {
  matchId: string;
  me: number;
  durationSec: number;
  participants: { id: number; championName: string; teamId: number; role: string; isMe: boolean; isAlly: boolean }[];
  frames: { minute: number; positions: { id: number; x: number; y: number }[]; teamGoldDiff: number }[];
  events: { t: number; type: "kill" | "objective" | "structure"; label: string; position: { x: number; y: number } | null; side: "ally" | "enemy"; myInvolvement: "killer" | "victim" | "assist" | null }[];
  moments: KeyMoment[];
  highlights: string[];
  limits: string[];
}

export type ReviewResponse = { available: true; dataSource: "riot" | "synthetic"; review: MatchReview } | { available: false; message: string };

export interface DraftPoint {
  id: string;
  kind: "fact" | "observation" | "hypothesis";
  title: string;
  detail: string;
  weight: number;
}

export interface Composition {
  champions: { id: string; name: string; tags: string[] }[];
  frontline: number;
  classes: Record<string, number>;
  magicShare: number | null;
  unrated: number;
}

export interface DraftAnalysis {
  ally: Composition;
  enemy: Composition;
  keyPoints: DraftPoint[];
  morePoints: DraftPoint[];
  personal: { withChampion: { games: number; wins: number }; vsOpponent: { games: number; wins: number } | null };
  unknownChampions: string[];
  limits: string[];
}

export interface ScoutedPlayer {
  riotId: string | null;
  championId: string;
  championName: string;
  available: boolean;
  games: number;
  wins: number;
  gamesOnChampion: number;
  winsOnChampion: number;
  mainRole: string | null;
  avgKda: number | null;
  smallSample: boolean;
  headline: string;
}

export interface ScoutResult {
  inGame: boolean;
  /** Riot ID of the linked account that is in the game. */
  account?: string;
  simulated?: boolean;
  message?: string;
  myChampion?: { id: string; name: string };
  allies?: { id: string; name: string }[];
  enemies?: ScoutedPlayer[];
  draft?: DraftAnalysis;
}

export interface Inflection {
  metric: string;
  label: string;
  at: number;
  before: { mean: number; n: number };
  after: { mean: number; n: number };
  direction: "improved" | "declined";
  attribution: "player" | "environment_possible" | "unclear";
  kind: "observation" | "hypothesis";
  context: string[];
}

export interface Evolution {
  inflections: Inflection[];
  anomalies: { metric: string; label: string; direction: "better" | "worse"; count: number; verdict: "variance" | "possible_change"; explanation: string }[];
  timeline: { at: number; type: "inflection" | "champion_shift" | "patch"; title: string; detail: string }[];
  adaptation: {
    byOpponentClass: AdaptationContext[];
    lead: AdaptationContext | null;
  };
  games: number;
}

export interface AdaptationContext {
  id: string;
  label: string;
  games: number;
  verdict: "insufficient" | "over" | "no_clear_difference";
  detail: string;
  metrics: { label: string; here: string; elsewhere: string }[];
}

export interface DecisionHistory {
  note: string;
  items: { id: string; kind: "goal_suggestion" | "insight" | "draft"; title: string; decision: "accepted" | "rejected" | "dismissed" | "none" | null; createdAt: string; outcome: string | null }[];
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
  assets: () => request<GameAssets>("/assets"),
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
  savePreferences: (p: Partial<Preferences>) => request<Preferences>("/preferences", { method: "PUT", body: JSON.stringify(p) }),
  profile: () => request<Profile>("/profile"),
  goals: () => request<GoalsResponse>("/goals"),
  createGoal: (metric: string, source: "coach" | "user", target?: number) =>
    request<{ goal: { id: string; title: string } }>("/goals", { method: "POST", body: JSON.stringify({ metric, source, target }) }),
  rejectGoal: (metric: string) => request<{ ok: true }>("/goals/reject", { method: "POST", body: JSON.stringify({ metric }) }),
  closeGoal: (id: string, status: "achieved" | "archived") => request<{ ok: true }>(`/goals/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
  memory: () => request<{ categories: Preferences["memory"]; items: MemoryItem[] }>("/memory"),
  addNote: (content: string) => request<{ item: MemoryItem }>("/memory", { method: "POST", body: JSON.stringify({ category: "note", content }) }),
  setFocus: (metric: string) => request<{ item: MemoryItem }>("/memory", { method: "POST", body: JSON.stringify({ category: "focus", metric }) }),
  deleteMemory: (id: string) => request<{ ok: true }>(`/memory/${id}`, { method: "DELETE" }),
  clearMemory: (category?: MemoryCategory) => request<{ ok: true }>(`/memory${category ? `?category=${category}` : ""}`, { method: "DELETE" }),
  feedback: (insightId: string, title: string) =>
    request<{ ok: true; stored: boolean }>("/coach/feedback", { method: "POST", body: JSON.stringify({ insightId, title }) }),
  search: (q: string) => request<{ results: SearchResult[] }>(`/search?q=${encodeURIComponent(q)}`),
  champion: (name: string) => request<ChampionDetail>(`/champions/${encodeURIComponent(name)}`),
  review: (matchId: string) => request<ReviewResponse>(`/matches/${encodeURIComponent(matchId)}/review`),
  draft: (input: { myChampion: string; allies: string[]; enemies: string[]; laneOpponent?: string }) =>
    request<DraftAnalysis>("/draft", { method: "POST", body: JSON.stringify(input) }),
  scout: () => request<ScoutResult>("/game/scout"),
  evolution: () => request<Evolution>("/evolution"),
  history: () => request<DecisionHistory>("/history"),
  clearHistory: () => request<{ ok: true }>("/history", { method: "DELETE" }),
};
