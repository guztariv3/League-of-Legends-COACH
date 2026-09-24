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
