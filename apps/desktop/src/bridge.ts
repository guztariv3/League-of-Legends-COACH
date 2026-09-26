import { invoke } from "@tauri-apps/api/core";
import type { LoadSample } from "@coach/live";

/** True inside the Tauri desktop shell; false in a normal browser (demo mode only). */
export const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export type SnapshotResult = { ok: true; data: unknown } | { ok: false; reason: "not_in_game" | "unexpected_live_data" | "unavailable" };

/** One read of the game's own Live Client Data API (via the Rust side). */
export async function readSnapshot(): Promise<SnapshotResult> {
  if (!inTauri) return { ok: false, reason: "unavailable" };
  try {
    return { ok: true, data: await invoke<unknown>("live_snapshot") };
  } catch (e) {
    return { ok: false, reason: e === "unexpected_live_data" ? "unexpected_live_data" : "not_in_game" };
  }
}

export async function readLoad(): Promise<LoadSample | null> {
  if (!inTauri) return null;
  try {
    return await invoke<LoadSample>("system_load");
  } catch {
    return null;
  }
}

export async function minimizeWindow(): Promise<void> {
  if (!inTauri) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().minimize();
}

export interface UpdateInfo {
  version: string;
  notes: string | null;
}

/** Signed update available from the release feed (null in dev builds or when up to date). */
export async function checkUpdate(): Promise<UpdateInfo | null> {
  if (!inTauri) return null;
  try {
    return await invoke<UpdateInfo | null>("check_update");
  } catch {
    return null; // offline or feed unavailable: never bother the player about it
  }
}

/** Downloads, verifies and installs, then restarts. On failure the current version stays installed. */
export async function installUpdate(): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await invoke("install_update");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/** Why a call to the player's KOI Master site failed (see desktop_claim / desktop_scout in lib.rs). */
export type SiteError = "invalid_url" | "insecure_url" | "offline" | "unauthorized" | "rate_limited" | "server_error" | "unexpected_response" | "unavailable";
export type SiteResult<T> = { ok: true; data: T } | { ok: false; error: SiteError };

async function site<T>(cmd: string, args: Record<string, unknown>): Promise<SiteResult<T>> {
  if (!inTauri) return { ok: false, error: "unavailable" };
  try {
    return { ok: true, data: await invoke<T>(cmd, args) };
  } catch (e) {
    return { ok: false, error: (typeof e === "string" ? e : "server_error") as SiteError };
  }
}

/** Exchanges the one-time code from the web (Ajustes) for a device token. */
export const claimDevice = (baseUrl: string, code: string, label: string) =>
  site<{ token: string; origin: string }>("desktop_claim", { baseUrl, code, label });

/** The rival scouting for the player's current game (read-only). */
export const fetchScout = <T>(baseUrl: string, token: string) => site<T>("desktop_scout", { baseUrl, token });

/** The player's own build with the champion they are playing (from their history on the site). */
export const fetchBuild = <T>(baseUrl: string, token: string, champion: string, mode: "summoners_rift" | "aram") =>
  site<T>("desktop_build", { baseUrl, token, champion, mode });

/** The Coach's game plan for the champions of this game (champions only). */
export const fetchPlan = <T>(baseUrl: string, token: string, c: { me: string; allies: string[]; enemies: string[]; opponent: string | null }) =>
  site<T>("desktop_plan", { baseUrl, token, me: c.me, allies: c.allies.join(","), enemies: c.enemies.join(","), opponent: c.opponent ?? "" });

/** What the optional overlay shows (D-11): the gold difference and the next items. */
export interface OverlayState {
  art: { cdn: string | null; version: string | null };
  rows: { ally: { id: string; name: string }; enemy: { id: string; name: string }; diff: number }[];
  allyTotal: number;
  enemyTotal: number;
  next: { id: number; name: string }[];
  gold: number | null;
}

export const OVERLAY_EVENT = "overlay-state";

/** Shows or hides the overlay window (an ordinary click-through window; nothing touches the game). */
export async function setOverlay(visible: boolean): Promise<void> {
  if (!inTauri) return;
  try { await invoke("set_overlay", { visible }); } catch { /* the side window keeps working */ }
}

/** Sends the overlay what to draw. */
export async function sendOverlay(state: OverlayState): Promise<void> {
  if (!inTauri) return;
  const { emitTo } = await import("@tauri-apps/api/event");
  await emitTo("overlay", OVERLAY_EVENT, state).catch(() => { /* overlay closed */ });
}

/** Champion select as the League Client reports it (read-only, champions and your own position only). */
export interface ChampSelect {
  phase: string;
  me?: { championId: number; locked: boolean; position: string } | null;
  allies?: number[];
  enemies?: number[];
}
export type ChampSelectResult = { ok: true; data: ChampSelect } | { ok: false; reason: "no_client" | "unavailable" };

/** One read of champion select from the League Client (D-13). */
export async function readChampSelect(): Promise<ChampSelectResult> {
  if (!inTauri) return { ok: false, reason: "unavailable" };
  try {
    return { ok: true, data: await invoke<ChampSelect>("lcu_champ_select") };
  } catch {
    return { ok: false, reason: "no_client" };
  }
}
