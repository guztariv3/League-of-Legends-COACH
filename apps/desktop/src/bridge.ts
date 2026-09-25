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
