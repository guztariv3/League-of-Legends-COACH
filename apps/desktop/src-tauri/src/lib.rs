//! KOI Master desktop: a separate side window for the Live Coach.
//!
//! Integrity rules (brief §23, §90–91):
//! - It only *reads* the Live Client Data API that the game itself exposes on
//!   127.0.0.1:2999 during a match.
//! - No memory reading, injection, overlays drawn into the game, input
//!   automation, or access to protected processes/files. Nothing here touches
//!   the game process or Vanguard.
//! - The optional overlay (D-11, off by default) is an ordinary transparent
//!   window placed above the others and click-through; it never hooks into the
//!   game's rendering.
//! - Polling is driven by the UI (and slowed down by Safe Mode), with short
//!   timeouts so the Coach never waits on the game.

use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;
use tauri::Manager;
use sysinfo::{MemoryRefreshKind, RefreshKind, System, CpuRefreshKind};

const LIVE_URL: &str = "https://127.0.0.1:2999/liveclientdata/allgamedata";

struct AppState {
    http: reqwest::Client,
    /// Ordinary, certificate-checking client for the player's own KOI Master site.
    site: reqwest::Client,
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

/// Shows or hides the optional overlay: a separate, transparent, always-on-top window that lets
/// every click through to the game. It sits on the left edge, a third of the way down the screen.
#[tauri::command]
fn set_overlay(app: tauri::AppHandle, visible: bool) -> Result<(), String> {
    let window = app.get_webview_window("overlay").ok_or("no_overlay")?;
    if !visible {
        return window.hide().map_err(|e| e.to_string());
    }
    window.set_ignore_cursor_events(true).map_err(|e| e.to_string())?;
    if let Ok(Some(monitor)) = window.current_monitor() {
        let y = (monitor.size().height as f64 * 0.30) as i32;
        let origin = monitor.position();
        window
            .set_position(tauri::PhysicalPosition::new(origin.x + 12, origin.y + y))
            .map_err(|e| e.to_string())?;
    }
    window.show().map_err(|e| e.to_string())
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

/// Origin of the player's KOI Master site: `https://…`, or `http://` only on this machine
/// (local development). Anything else is refused so the device token never travels in clear.
fn site_origin(raw: &str) -> Result<String, String> {
    let url = reqwest::Url::parse(raw.trim()).map_err(|_| "invalid_url".to_string())?;
    let host = url.host_str().ok_or("invalid_url")?;
    let local = matches!(host, "localhost" | "127.0.0.1" | "[::1]");
    match url.scheme() {
        "https" => {}
        "http" if local => {}
        _ => return Err("insecure_url".into()),
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err("invalid_url".into());
    }
    Ok(url.origin().ascii_serialization())
}

/// Turns a site response into JSON, or into an error code the UI can explain.
async fn site_json(res: reqwest::Response) -> Result<serde_json::Value, String> {
    match res.status().as_u16() {
        200..=299 => res.json().await.map_err(|_| "unexpected_response".to_string()),
        401 => Err("unauthorized".into()),
        429 => Err("rate_limited".into()),
        _ => Err("server_error".into()),
    }
}

/// Exchanges a one-time pairing code (generated on the web, Ajustes) for a device token.
#[tauri::command]
async fn desktop_claim(state: tauri::State<'_, AppState>, base_url: String, code: String, label: String) -> Result<serde_json::Value, String> {
    let origin = site_origin(&base_url)?;
    let res = state.site.post(format!("{origin}/api/desktop/claim"))
        .json(&serde_json::json!({ "code": code, "label": label }))
        .send().await.map_err(|_| "offline".to_string())?;
    let mut body = site_json(res).await?;
    body["origin"] = serde_json::Value::String(origin);
    Ok(body)
}

/// Reads the rival scouting for the player's current game with the device token.
#[tauri::command]
async fn desktop_scout(state: tauri::State<'_, AppState>, base_url: String, token: String) -> Result<serde_json::Value, String> {
    let origin = site_origin(&base_url)?;
    let res = state.site.get(format!("{origin}/api/desktop/scout"))
        .bearer_auth(token)
        .send().await.map_err(|_| "offline".to_string())?;
    site_json(res).await
}

/// The player's own build with a champion (from their history on the site), with the device token.
#[tauri::command]
async fn desktop_build(state: tauri::State<'_, AppState>, base_url: String, token: String, champion: String, mode: String) -> Result<serde_json::Value, String> {
    let origin = site_origin(&base_url)?;
    let res = state.site.get(format!("{origin}/api/desktop/build"))
        .query(&[("champion", champion.as_str()), ("mode", mode.as_str())])
        .bearer_auth(token)
        .send().await.map_err(|_| "offline".to_string())?;
    site_json(res).await
}

fn site_client() -> reqwest::Client {
    reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        // A free Render instance can take a while to wake up.
        .timeout(Duration::from_secs(60))
        .build()
        .expect("site client")
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
        .manage(AppState { http: live_client(), site: site_client(), sys: Mutex::new(sys) })
        .invoke_handler(tauri::generate_handler![live_snapshot, system_load, check_update, install_update, desktop_claim, desktop_scout, desktop_build, set_overlay])
        .run(tauri::generate_context!())
        .expect("error while running KOI Master desktop");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Instant;

    #[test]
    fn site_origin_requires_https_except_on_this_machine() {
        assert_eq!(site_origin("https://kairos-coach.onrender.com/settings?x=1").unwrap(), "https://kairos-coach.onrender.com");
        assert_eq!(site_origin("  https://example.com/ ").unwrap(), "https://example.com");
        assert_eq!(site_origin("http://localhost:8787").unwrap(), "http://localhost:8787");
        assert_eq!(site_origin("http://127.0.0.1:8787").unwrap(), "http://127.0.0.1:8787");
        assert_eq!(site_origin("http://example.com").unwrap_err(), "insecure_url");
        assert_eq!(site_origin("file:///etc/passwd").unwrap_err(), "invalid_url");
        assert_eq!(site_origin("ftp://example.com").unwrap_err(), "insecure_url");
        assert_eq!(site_origin("https://user:pw@example.com").unwrap_err(), "invalid_url");
        assert_eq!(site_origin("not a url").unwrap_err(), "invalid_url");
    }

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
