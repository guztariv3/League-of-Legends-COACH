/**
 * Riot routing. Platform routes host platform-scoped APIs (summoner, league,
 * spectator); regional routes host account-v1 and match-v5.
 *
 * Source: Riot Developer Portal routing docs (see docs/01-investigacion.md).
 * `enabled` gates regions progressively: only turn one on after verifying it
 * against the portal with a real key.
 */
export type RegionalRoute = "americas" | "europe" | "asia" | "sea";

export interface PlatformInfo {
  readonly id: string;
  readonly label: string;
  readonly matchRoute: RegionalRoute;
  /** account-v1 is served from americas/europe/asia only. */
  readonly accountRoute: Exclude<RegionalRoute, "sea">;
  readonly enabled: boolean;
}

const p = (
  id: string,
  label: string,
  matchRoute: RegionalRoute,
  accountRoute: PlatformInfo["accountRoute"],
): PlatformInfo => ({ id, label, matchRoute, accountRoute, enabled: true });

export const PLATFORMS: readonly PlatformInfo[] = [
  p("na1", "North America", "americas", "americas"),
  p("br1", "Brazil", "americas", "americas"),
  p("la1", "LAN", "americas", "americas"),
  p("la2", "LAS", "americas", "americas"),
  p("euw1", "EU West", "europe", "europe"),
  p("eun1", "EU Nordic & East", "europe", "europe"),
  p("tr1", "Turkey", "europe", "europe"),
  p("ru", "Russia", "europe", "europe"),
  p("me1", "Middle East", "europe", "europe"),
  p("kr", "Korea", "asia", "asia"),
  p("jp1", "Japan", "asia", "asia"),
  p("oc1", "Oceania", "sea", "asia"),
  p("sg2", "Southeast Asia", "sea", "asia"),
  p("tw2", "Taiwan", "sea", "asia"),
  p("vn2", "Vietnam", "sea", "asia"),
];

const byId = new Map(PLATFORMS.map((x) => [x.id, x]));

export function getPlatform(id: string): PlatformInfo | undefined {
  return byId.get(id.toLowerCase());
}

export function isPlatformId(id: string): boolean {
  const info = getPlatform(id);
  return info !== undefined && info.enabled;
}

/** Match IDs are prefixed with the uppercase platform id, e.g. "EUW1_123". */
export function platformFromMatchId(matchId: string): PlatformInfo | undefined {
  const prefix = matchId.split("_")[0];
  return prefix ? getPlatform(prefix) : undefined;
}
