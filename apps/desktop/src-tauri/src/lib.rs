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
//! - Champion select (D-13, registered with Riot): read-only GETs to the League
//!   Client's own local API, found through its `lockfile`. Only champion ids and
//!   the player's own position leave this file; other players' names and ids are
//!   never read into the result.

use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;
use tauri::Manager;
use sysinfo::{MemoryRefreshKind, RefreshKind, System, CpuRefreshKind};

const LIVE_URL: &str = "https://127.0.0.1:2999/liveclientdata/allgamedata";

struct AppState {
    http: reqwest::Client,
    /// League Client (champion select), local and read-only.
    lcu: reqwest::Client,
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

/// The Coach's game plan for the champions of the game that is starting (champions only), with the device token.
#[tauri::command]
async fn desktop_plan(state: tauri::State<'_, AppState>, base_url: String, token: String, me: String, allies: String, enemies: String, opponent: String) -> Result<serde_json::Value, String> {
    let origin = site_origin(&base_url)?;
    let res = state.site.get(format!("{origin}/api/desktop/plan"))
        .query(&[("me", me.as_str()), ("allies", allies.as_str()), ("enemies", enemies.as_str()), ("opponent", opponent.as_str())])
        .bearer_auth(token)
        .send().await.map_err(|_| "offline".to_string())?;
    site_json(res).await
}

// ------------------------------------------------------------------ champion select (LCU, read-only)

/// Port and password from the League Client's `lockfile` ("LeagueClient:pid:port:password:https").
fn parse_lockfile(raw: &str) -> Option<(u16, String)> {
    let parts: Vec<&str> = raw.trim().split(':').collect();
    if parts.len() < 5 || parts[4] != "https" {
        return None;
    }
    let port = parts[2].parse::<u16>().ok()?;
    let password = parts[3].to_string();
    if password.is_empty() {
        return None;
    }
    Some((port, password))
}

/// League install folders listed by the Riot Client (`RiotClientInstalls.json`), then the default one.
fn install_dirs(installs_json: Option<&str>) -> Vec<std::path::PathBuf> {
    let mut dirs = Vec::new();
    if let Some(json) = installs_json.and_then(|s| serde_json::from_str::<serde_json::Value>(s).ok()) {
        if let Some(map) = json.get("associated_client").and_then(|v| v.as_object()) {
            for key in map.keys() {
                if key.to_ascii_lowercase().contains("league of legends") {
                    dirs.push(std::path::PathBuf::from(key));
                }
            }
        }
    }
    let default = std::path::PathBuf::from(r"C:\Riot Games\League of Legends");
    if !dirs.contains(&default) {
        dirs.push(default);
    }
    dirs
}

fn find_lockfile() -> Option<(u16, String)> {
    let program_data = std::env::var("PROGRAMDATA").unwrap_or_else(|_| r"C:\ProgramData".into());
    let installs = std::fs::read_to_string(std::path::Path::new(&program_data).join("Riot Games").join("RiotClientInstalls.json")).ok();
    install_dirs(installs.as_deref())
        .into_iter()
        .find_map(|dir| std::fs::read_to_string(dir.join("lockfile")).ok().and_then(|raw| parse_lockfile(&raw)))
}

/// Keeps only what the Coach may use from a champion-select session: champion ids and the
/// player's own assigned position. Other players' names, PUUIDs and summoner ids are dropped here.
fn reduce_session(session: &serde_json::Value) -> serde_json::Value {
    let me_cell = session.get("localPlayerCellId").and_then(|v| v.as_i64());
    let team = |key: &str| session.get(key).and_then(|v| v.as_array()).cloned().unwrap_or_default();
    let champ = |p: &serde_json::Value, intent: bool| -> u64 {
        let picked = p.get("championId").and_then(|v| v.as_u64()).unwrap_or(0);
        if picked > 0 || !intent { picked } else { p.get("championPickIntent").and_then(|v| v.as_u64()).unwrap_or(0) }
    };
    let my_team = team("myTeam");
    let me = my_team.iter().find(|p| p.get("cellId").and_then(|v| v.as_i64()) == me_cell);
    let allies: Vec<u64> = my_team.iter()
        .filter(|p| p.get("cellId").and_then(|v| v.as_i64()) != me_cell)
        .map(|p| champ(p, false)).filter(|c| *c > 0).collect();
    let enemies: Vec<u64> = team("theirTeam").iter().map(|p| champ(p, false)).filter(|c| *c > 0).collect();
    serde_json::json!({
        "phase": "ChampSelect",
        "me": me.map(|p| serde_json::json!({
            "championId": champ(p, true),
            "locked": p.get("championId").and_then(|v| v.as_u64()).unwrap_or(0) > 0,
            "position": p.get("assignedPosition").and_then(|v| v.as_str()).unwrap_or(""),
        })),
        "allies": allies,
        "enemies": enemies,
    })
}

/// Champion select from the League Client (read-only). `Err("no_client")` when the client
/// isn't running; `{ phase }` outside champion select; the reduced session inside it.
#[tauri::command]
async fn lcu_champ_select(state: tauri::State<'_, AppState>) -> Result<serde_json::Value, String> {
    let (port, password) = find_lockfile().ok_or("no_client")?;
    let base = format!("https://127.0.0.1:{port}");
    let get = |path: &str| state.lcu.get(format!("{base}{path}")).basic_auth("riot", Some(&password)).send();
    let phase: String = get("/lol-gameflow/v1/gameflow-phase").await.map_err(|_| "no_client".to_string())?
        .json().await.map_err(|_| "no_client".to_string())?;
    if phase != "ChampSelect" {
        return Ok(serde_json::json!({ "phase": phase }));
    }
    let res = get("/lol-champ-select/v1/session").await.map_err(|_| "no_client".to_string())?;
    if !res.status().is_success() {
        return Ok(serde_json::json!({ "phase": phase }));
    }
    let session: serde_json::Value = res.json().await.map_err(|_| "unexpected_client_data".to_string())?;
    Ok(reduce_session(&session))
}

fn lcu_client() -> reqwest::Client {
    reqwest::Client::builder()
        // The League Client serves its local API with a certificate signed by Riot's own root,
        // like the game's Live Client Data API. This client only ever talks to 127.0.0.1 on the
        // port from the lockfile, with the lockfile's password.
        // TODO(verify): pin Riot's published root certificate (riotgames.pem) instead.
        .danger_accept_invalid_certs(true)
        .no_proxy()
        .connect_timeout(Duration::from_millis(500))
        .timeout(Duration::from_millis(2000))
        .build()
        .expect("lcu client")
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
        .manage(AppState { http: live_client(), lcu: lcu_client(), site: site_client(), sys: Mutex::new(sys) })
        .invoke_handler(tauri::generate_handler![live_snapshot, system_load, check_update, install_update, desktop_claim, desktop_scout, desktop_build, desktop_plan, set_overlay, lcu_champ_select])
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

    #[test]
    fn lockfile_gives_port_and_password() {
        assert_eq!(parse_lockfile("LeagueClient:1234:54321:s3cr3t:https\n"), Some((54321, "s3cr3t".into())));
        assert_eq!(parse_lockfile("LeagueClient:1234:54321:s3cr3t:http"), None);
        assert_eq!(parse_lockfile("garbage"), None);
        assert_eq!(parse_lockfile("LeagueClient:1:notaport:pw:https"), None);
    }

    #[test]
    fn install_dirs_come_from_the_riot_client_then_the_default() {
        let json = r#"{"associated_client":{"D:/Games/Riot Games/League of Legends/":"D:/Games/Riot Games/Riot Client/RiotClientServices.exe","D:/Games/VALORANT/":"x"}}"#;
        let dirs = install_dirs(Some(json));
        assert_eq!(dirs[0], std::path::PathBuf::from("D:/Games/Riot Games/League of Legends/"));
        assert_eq!(dirs.len(), 2);
        assert_eq!(install_dirs(None).len(), 1);
    }

    #[test]
    fn session_keeps_only_champions_and_own_position() {
        let session = serde_json::json!({
            "localPlayerCellId": 2,
            "myTeam": [
                { "cellId": 1, "championId": 103, "puuid": "ally-puuid", "gameName": "Ally", "assignedPosition": "top" },
                { "cellId": 2, "championId": 0, "championPickIntent": 157, "puuid": "my-puuid", "assignedPosition": "middle" },
                { "cellId": 3, "championId": 0, "championPickIntent": 64, "assignedPosition": "jungle" }
            ],
            "theirTeam": [{ "cellId": 5, "championId": 238, "puuid": "enemy-puuid" }, { "cellId": 6, "championId": 0 }]
        });
        let r = reduce_session(&session);
        assert_eq!(r["me"]["championId"], 157);
        assert_eq!(r["me"]["locked"], false);
        assert_eq!(r["me"]["position"], "middle");
        assert_eq!(r["allies"], serde_json::json!([103])); // an ally's hover isn't used
        assert_eq!(r["enemies"], serde_json::json!([238]));
        let text = r.to_string();
        assert!(!text.contains("puuid") && !text.contains("Ally"));
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
