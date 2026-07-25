mod bridge;
mod db;
mod http_exec;
mod openapi_ops;

use std::collections::HashMap;
use std::sync::Arc;

use db::{
    Collection, Db, Environment, Folder, HistoryEntry, HttpRequest, TreeOrderItem, Workspace,
};
use http_exec::{SendRequestInput, SendRequestResult};
use openapi_ops::OpenApiImportResult;
use tauri::Manager;

#[tauri::command]
fn list_workspaces(state: tauri::State<'_, Arc<Db>>) -> Result<Vec<Workspace>, String> {
    state.list_workspaces()
}

#[tauri::command]
fn create_workspace(
    state: tauri::State<'_, Arc<Db>>,
    name: String,
) -> Result<Workspace, String> {
    state.create_workspace(name)
}

#[tauri::command]
fn rename_workspace(
    state: tauri::State<'_, Arc<Db>>,
    id: String,
    name: String,
) -> Result<Workspace, String> {
    state.rename_workspace(&id, name)
}

#[tauri::command]
fn list_collections(
    state: tauri::State<'_, Arc<Db>>,
    workspace_id: Option<String>,
) -> Result<Vec<Collection>, String> {
    state.list_collections(workspace_id)
}

#[tauri::command]
fn create_collection(
    state: tauri::State<'_, Arc<Db>>,
    name: String,
    workspace_id: String,
) -> Result<Collection, String> {
    state.create_collection(name, workspace_id)
}

#[tauri::command]
fn rename_collection(
    state: tauri::State<'_, Arc<Db>>,
    id: String,
    name: String,
) -> Result<Collection, String> {
    state.rename_collection(&id, name)
}

#[tauri::command]
fn set_collection_description(
    state: tauri::State<'_, Arc<Db>>,
    id: String,
    description: String,
) -> Result<Collection, String> {
    state.set_collection_description(&id, description)
}

#[tauri::command]
fn delete_collection(state: tauri::State<'_, Arc<Db>>, id: String) -> Result<(), String> {
    state.delete_collection(&id)
}

#[tauri::command]
fn list_folders(
    state: tauri::State<'_, Arc<Db>>,
    collection_id: String,
) -> Result<Vec<Folder>, String> {
    state.list_folders(collection_id)
}

#[tauri::command]
fn create_folder(
    state: tauri::State<'_, Arc<Db>>,
    collection_id: String,
    parent_id: Option<String>,
    name: String,
) -> Result<Folder, String> {
    state.create_folder(collection_id, parent_id, name)
}

#[tauri::command]
fn delete_folder(state: tauri::State<'_, Arc<Db>>, id: String) -> Result<(), String> {
    state.delete_folder(&id)
}

#[tauri::command]
fn rename_folder(
    state: tauri::State<'_, Arc<Db>>,
    id: String,
    name: String,
) -> Result<Folder, String> {
    state.rename_folder(&id, name)
}

#[tauri::command]
fn reorder_siblings(
    state: tauri::State<'_, Arc<Db>>,
    collection_id: String,
    parent_id: Option<String>,
    ordered: Vec<TreeOrderItem>,
) -> Result<(), String> {
    state.reorder_siblings(collection_id, parent_id, ordered)
}

#[tauri::command]
fn list_requests(
    state: tauri::State<'_, Arc<Db>>,
    collection_id: String,
) -> Result<Vec<HttpRequest>, String> {
    state.list_requests(collection_id)
}

#[tauri::command]
fn upsert_request(
    state: tauri::State<'_, Arc<Db>>,
    request: HttpRequest,
) -> Result<HttpRequest, String> {
    state.upsert_request(request)
}

#[tauri::command]
fn delete_request(state: tauri::State<'_, Arc<Db>>, id: String) -> Result<(), String> {
    state.delete_request(&id)
}

#[tauri::command]
fn list_environments(state: tauri::State<'_, Arc<Db>>) -> Result<Vec<Environment>, String> {
    state.list_environments()
}

#[tauri::command]
fn set_active_environment(
    state: tauri::State<'_, Arc<Db>>,
    id: String,
) -> Result<(), String> {
    state.set_active_environment(id)
}

#[tauri::command]
fn upsert_environment(
    state: tauri::State<'_, Arc<Db>>,
    environment: Environment,
) -> Result<Environment, String> {
    state.upsert_environment(environment)
}

#[tauri::command]
fn delete_environment(
    state: tauri::State<'_, Arc<Db>>,
    id: String,
) -> Result<(), String> {
    state.delete_environment(&id)
}

#[tauri::command]
fn send_http_request(input: SendRequestInput) -> Result<SendRequestResult, String> {
    http_exec::send(input)
}

#[tauri::command]
fn resolve_env_maps(
    state: tauri::State<'_, Arc<Db>>,
) -> Result<(HashMap<String, String>, HashMap<String, String>), String> {
    let envs = state.list_environments()?;
    let mut active = HashMap::new();
    let mut global = HashMap::new();
    for e in envs {
        let map: HashMap<String, String> =
            serde_json::from_str(&e.vars_json).unwrap_or_default();
        if e.is_global {
            global = map;
        } else if e.is_active {
            active = map;
        }
    }
    Ok((active, global))
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct McpStatus {
    running: bool,
    port: u16,
    bridge_url: String,
    stdio_path: String,
}

#[tauri::command]
fn mcp_stdio_path() -> Result<String, String> {
    Ok(db::mcp_dir().join("stdio.mjs").display().to_string())
}

#[tauri::command]
fn mcp_status(state: tauri::State<'_, Arc<bridge::BridgeState>>) -> Result<McpStatus, String> {
    Ok(McpStatus {
        running: true,
        port: state.port,
        bridge_url: state.bridge_url.clone(),
        stdio_path: db::mcp_dir().join("stdio.mjs").display().to_string(),
    })
}

#[tauri::command]
fn mcp_logs(
    state: tauri::State<'_, Arc<bridge::BridgeState>>,
) -> Result<Vec<bridge::McpLogEntry>, String> {
    Ok(state.logs())
}

#[tauri::command]
fn import_openapi(
    state: tauri::State<'_, Arc<Db>>,
    spec: String,
    workspace_id: String,
) -> Result<OpenApiImportResult, String> {
    openapi_ops::import_into_db(&state, &spec, &workspace_id)
}

/// Export straight to the user's Downloads folder; returns the written path.
#[tauri::command]
fn export_openapi(
    state: tauri::State<'_, Arc<Db>>,
    collection_id: String,
    file_name: String,
) -> Result<String, String> {
    let spec = openapi_ops::export_from_db(&state, &collection_id)?;
    // Prefer XDG Downloads; create ~/Downloads when the dir is missing (common on bare WSL).
    let dir = dirs::download_dir()
        .or_else(|| dirs::home_dir().map(|h| h.join("Downloads")))
        .ok_or("No Downloads folder found")?;
    if !dir.exists() {
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    // Collection names are user input — keep only filesystem-safe chars.
    let stem: String = file_name
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || " ._-".contains(c) {
                c
            } else {
                '_'
            }
        })
        .collect();
    let stem = stem.trim().trim_matches('.');
    let stem = if stem.is_empty() { "collection" } else { stem };
    let mut path = dir.join(format!("{stem}.openapi.json"));
    let mut n = 1;
    while path.exists() {
        path = dir.join(format!("{stem} ({n}).openapi.json"));
        n += 1;
    }
    std::fs::write(&path, spec).map_err(|e| e.to_string())?;
    Ok(path.display().to_string())
}

/// Reveal a file in the system file manager.
///
/// Uses tauri-plugin-opener first (Explorer / Finder / FileManager1+portal).
/// Falls back for environments without a desktop portal — notably WSL, which
/// has no `org.freedesktop.portal.OpenURI` and must open Windows Explorer via
/// `explorer.exe` + `wslpath`.
#[tauri::command]
fn reveal_path(path: String) -> Result<(), String> {
    let p = std::path::PathBuf::from(&path);
    if !p.exists() {
        return Err(format!("File not found: {path}"));
    }
    if tauri_plugin_opener::reveal_item_in_dir(&p).is_ok() {
        return Ok(());
    }
    reveal_path_fallback(&p)
}

fn reveal_path_fallback(path: &std::path::Path) -> Result<(), String> {
    #[cfg(windows)]
    {
        std::process::Command::new("explorer")
            .arg(format!("/select,{}", path.display()))
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[cfg(target_os = "macos")]
    {
        let status = std::process::Command::new("open")
            .args(["-R"])
            .arg(path)
            .status()
            .map_err(|e| e.to_string())?;
        if status.success() {
            return Ok(());
        }
        return Err("Could not reveal file in Finder".into());
    }
    #[cfg(target_os = "linux")]
    {
        if is_wsl() {
            let win = wsl_to_windows_path(path)?;
            // explorer.exe returns non-zero even on success; just spawn.
            std::process::Command::new("explorer.exe")
                .arg(format!("/select,{win}"))
                .spawn()
                .map_err(|e| format!("Could not open Windows Explorer: {e}"))?;
            return Ok(());
        }
        let dir = path.parent().unwrap_or(path);
        std::process::Command::new("xdg-open")
            .arg(dir)
            .spawn()
            .map_err(|_| {
                "Could not open the folder (no file manager / xdg-open).".to_string()
            })?;
        Ok(())
    }
    #[cfg(not(any(windows, target_os = "macos", target_os = "linux")))]
    {
        let _ = path;
        Err("Reveal is not supported on this platform".into())
    }
}

#[cfg(target_os = "linux")]
fn is_wsl() -> bool {
    std::fs::read_to_string("/proc/version")
        .map(|v| v.to_ascii_lowercase().contains("microsoft"))
        .unwrap_or(false)
}

#[cfg(target_os = "linux")]
fn wsl_to_windows_path(path: &std::path::Path) -> Result<String, String> {
    let out = std::process::Command::new("wslpath")
        .arg("-w")
        .arg(path)
        .output()
        .map_err(|e| format!("wslpath failed: {e}"))?;
    if !out.status.success() {
        return Err(format!(
            "wslpath failed: {}",
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

#[tauri::command]
fn list_workspace_history(
    state: tauri::State<'_, Arc<Db>>,
    workspace_id: String,
    limit: Option<i64>,
) -> Result<Vec<HistoryEntry>, String> {
    state.list_workspace_history(workspace_id, limit.unwrap_or(100))
}

#[tauri::command]
fn list_request_history(
    state: tauri::State<'_, Arc<Db>>,
    request_id: String,
    limit: Option<i64>,
) -> Result<Vec<HistoryEntry>, String> {
    state.list_request_history(request_id, limit.unwrap_or(50))
}

#[tauri::command]
fn insert_history(
    state: tauri::State<'_, Arc<Db>>,
    entry: HistoryEntry,
) -> Result<HistoryEntry, String> {
    state.insert_history(entry)
}

#[tauri::command]
fn delete_history(state: tauri::State<'_, Arc<Db>>, id: String) -> Result<(), String> {
    state.delete_history(&id)
}

#[tauri::command]
fn clear_request_history(
    state: tauri::State<'_, Arc<Db>>,
    request_id: String,
) -> Result<(), String> {
    state.clear_request_history(&request_id)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let db = Arc::new(db::open()?);
            let bridge = bridge::start(Arc::clone(&db))?;
            eprintln!(
                "Inpost MCP bridge at {} (stdio under {:?})",
                bridge.bridge_url,
                db::mcp_dir()
            );

            // Prefer bundled resource; fall back to repo mcp/dist during `tauri dev`
            let resource = app
                .path()
                .resource_dir()
                .ok()
                .map(|p| p.join("mcp").join("stdio.mjs"));
            let dev = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("../mcp/dist/stdio.mjs");
            let src = resource
                .filter(|p| p.exists())
                .unwrap_or(dev);
            let _ = bridge::install_stdio_bundle(&src);

            app.manage(db);
            app.manage(bridge);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_workspaces,
            create_workspace,
            rename_workspace,
            list_collections,
            create_collection,
            rename_collection,
            set_collection_description,
            delete_collection,
            list_folders,
            create_folder,
            delete_folder,
            rename_folder,
            reorder_siblings,
            list_requests,
            upsert_request,
            delete_request,
            list_environments,
            set_active_environment,
            upsert_environment,
            delete_environment,
            send_http_request,
            resolve_env_maps,
            mcp_stdio_path,
            mcp_status,
            mcp_logs,
            import_openapi,
            export_openapi,
            reveal_path,
            list_workspace_history,
            list_request_history,
            insert_history,
            delete_history,
            clear_request_history,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
