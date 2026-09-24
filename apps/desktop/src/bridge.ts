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
