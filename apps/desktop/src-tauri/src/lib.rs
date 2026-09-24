//! Kairos desktop: a separate side window for the Live Coach.
//!
//! Integrity rules (brief §23, §90–91):
//! - It only *reads* the Live Client Data API that the game itself exposes on
//!   127.0.0.1:2999 during a match.
//! - No memory reading, injection, overlays drawn into the game, input
//!   automation, or access to protected processes/files. Nothing here touches
//!   the game process or Vanguard.
//! - Polling is driven by the UI (and slowed down by Safe Mode), with short
//!   timeouts so the Coach never waits on the game.

use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;
use sysinfo::{MemoryRefreshKind, RefreshKind, System, CpuRefreshKind};

const LIVE_URL: &str = "https://127.0.0.1:2999/liveclientdata/allgamedata";

struct AppState {
    http: reqwest::Client,
    sys: Mutex<System>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LoadSample {
    cpu: f32,
    mem_available: f64,
}

/// Reads one Live Client Data snapshot. Returns `Err("not_in_game")` when the
/// game isn't running or the API isn't up yet (connection refused/timeout).
#[tauri::command]
async fn live_snapshot(state: tauri::State<'_, AppState>) -> Result<serde_json::Value, String> {
    let res = state.http.get(LIVE_URL).send().await.map_err(|_| "not_in_game".to_string())?;
    if !res.status().is_success() {
        return Err("not_in_game".into());
    }
    res.json::<serde_json::Value>().await.map_err(|_| "unexpected_live_data".to_string())
}

/// CPU and memory pressure for Safe Mode.
#[tauri::command]
fn system_load(state: tauri::State<'_, AppState>) -> LoadSample {
    let mut sys = state.sys.lock().expect("system mutex");
    sys.refresh_cpu_usage();
    sys.refresh_memory();
    let total = sys.total_memory().max(1) as f64;
    LoadSample { cpu: sys.global_cpu_usage(), mem_available: sys.available_memory() as f64 / total }
}

#[derive(Serialize)]
struct UpdateInfo {
    version: String,
    notes: Option<String>,
}

/// Checks the signed release feed. Returns `None` when there is nothing new or
/// when this build was compiled without the `updater` feature (development).
#[tauri::command]
async fn check_update(app: tauri::AppHandle) -> Result<Option<UpdateInfo>, String> {
    #[cfg(feature = "updater")]
    {
        use tauri_plugin_updater::UpdaterExt;
        let updater = app.updater().map_err(|e| e.to_string())?;
        let update = updater.check().await.map_err(|e| e.to_string())?;
        return Ok(update.map(|u| UpdateInfo { version: u.version.clone(), notes: u.body.clone() }));
    }
    #[cfg(not(feature = "updater"))]
    {
        let _ = app;
        Ok(None)
    }
}

/// Downloads, verifies the signature and installs the update, then restarts.
/// If anything fails, the installed version is left untouched and the error is returned.
#[tauri::command]
async fn install_update(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(feature = "updater")]
    {
        use tauri_plugin_updater::UpdaterExt;
        let updater = app.updater().map_err(|e| e.to_string())?;
        let Some(update) = updater.check().await.map_err(|e| e.to_string())? else {
            return Err("no_update".into());
        };
        update.download_and_install(|_, _| {}, || {}).await.map_err(|e| e.to_string())?;
        app.restart();
    }
    #[cfg(not(feature = "updater"))]
    {
        let _ = app;
        Err("updates_disabled".into())
    }
}

fn live_client() -> reqwest::Client {
    reqwest::Client::builder()
        // The game serves this local endpoint with a certificate signed by Riot's own
        // root, which is not in the system store. Invalid certificates are accepted
        // only by this client, which is only ever used for the fixed 127.0.0.1 URL above.
        // TODO(verify): pin Riot's published root certificate (riotgames.pem) instead.
        .danger_accept_invalid_certs(true)
        .no_proxy()
        .connect_timeout(Duration::from_millis(400))
        .timeout(Duration::from_millis(900))
        .build()
        .expect("http client")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let sys = System::new_with_specifics(
        RefreshKind::nothing()
            .with_cpu(CpuRefreshKind::nothing().with_cpu_usage())
            .with_memory(MemoryRefreshKind::nothing().with_ram()),
    );
    let builder = tauri::Builder::default();
    #[cfg(feature = "updater")]
    let builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    builder
        .manage(AppState { http: live_client(), sys: Mutex::new(sys) })
        .invoke_handler(tauri::generate_handler![live_snapshot, system_load, check_update, install_update])
        .run(tauri::generate_context!())
        .expect("error while running Kairos desktop");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Instant;

    /// With no game running, a read must fail fast (never block the Coach).
    #[test]
    fn live_read_fails_fast_without_a_game() {
        let client = live_client();
        let started = Instant::now();
        let result = tauri::async_runtime::block_on(async { client.get(LIVE_URL).send().await });
        assert!(result.is_err());
        assert!(started.elapsed() < Duration::from_millis(1500));
    }
}
