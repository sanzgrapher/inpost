//! Localhost HTTP bridge for MCP stdio proxy.
//! Desktop app must be running; agents talk stdio → session.json → this bridge.

use std::collections::{HashMap, VecDeque};
use std::io::Cursor;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::json;
use tiny_http::{Header, Method, Request, Response, Server, StatusCode};
use uuid::Uuid;

use crate::db::{mcp_dir, Db, Environment, HistoryEntry, HttpRequest, TreeOrderItem};
use crate::http_exec::{self, SendRequestInput};

const LOG_CAP: usize = 200;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpLogEntry {
    pub at: i64,
    pub method: String,
    pub path: String,
    pub status: u16,
    pub detail: Option<String>,
}

pub struct BridgeState {
    pub bridge_url: String,
    pub port: u16,
    #[allow(dead_code)]
    pub token: String,
    logs: Mutex<VecDeque<McpLogEntry>>,
}

impl BridgeState {
    fn push_log(&self, method: String, path: String, status: u16, detail: Option<String>) {
        let at = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);
        if let Ok(mut q) = self.logs.lock() {
            q.push_back(McpLogEntry {
                at,
                method,
                path,
                status,
                detail,
            });
            while q.len() > LOG_CAP {
                q.pop_front();
            }
        }
    }

    pub fn logs(&self) -> Vec<McpLogEntry> {
        self.logs
            .lock()
            .map(|q| q.iter().cloned().collect())
            .unwrap_or_default()
    }
}

pub fn start(db: Arc<Db>) -> Result<Arc<BridgeState>, String> {
    let token = Uuid::new_v4().to_string();
    let server = Server::http("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = server
        .server_addr()
        .to_ip()
        .ok_or_else(|| "expected IP listen addr".to_string())?
        .port();
    let bridge_url = format!("http://127.0.0.1:{port}");
    let auth = format!("Bearer {token}");
    let state = Arc::new(BridgeState {
        bridge_url: bridge_url.clone(),
        port,
        token: token.clone(),
        logs: Mutex::new(VecDeque::new()),
    });

    let db_thread = Arc::clone(&db);
    let auth_thread = auth.clone();
    let state_thread = Arc::clone(&state);
    thread::spawn(move || {
        for request in server.incoming_requests() {
            let _ = handle(&db_thread, &auth_thread, &state_thread, request);
        }
    });

    write_session(&bridge_url, &token)?;
    state.push_log(
        "BOOT".into(),
        "/".into(),
        200,
        Some(format!("bridge listening on {bridge_url}")),
    );
    Ok(state)
}

fn write_session(bridge_url: &str, token: &str) -> Result<(), String> {
    let dir = mcp_dir();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join("session.json");
    let body = json!({
        "bridgeUrl": bridge_url,
        "token": token,
    });
    std::fs::write(path, serde_json::to_vec_pretty(&body).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())
}

/// Copy bundled stdio.mjs next to session.json (refreshed each launch).
pub fn install_stdio_bundle(resource_stdio: &std::path::Path) -> Result<std::path::PathBuf, String> {
    if !resource_stdio.exists() {
        return Err(format!(
            "stdio.mjs source not found: {}",
            resource_stdio.display()
        ));
    }
    let dir = mcp_dir();
    std::fs::create_dir_all(&dir).map_err(|e| format!("create mcp dir: {e}"))?;
    let dest = dir.join("stdio.mjs");
    std::fs::copy(resource_stdio, &dest)
        .map_err(|e| format!("copy stdio.mjs: {e}"))?;
    Ok(dest)
}

fn unauthorized() -> Response<Cursor<Vec<u8>>> {
    Response::from_string(r#"{"error":"unauthorized"}"#)
        .with_status_code(StatusCode(401))
        .with_header(Header::from_bytes("Content-Type", "application/json").unwrap())
}

fn json_ok(v: impl serde::Serialize) -> Response<Cursor<Vec<u8>>> {
    let body = serde_json::to_vec(&v).unwrap_or_else(|_| b"{}".to_vec());
    Response::from_data(body)
        .with_header(Header::from_bytes("Content-Type", "application/json").unwrap())
}

fn json_err(status: u16, msg: impl Into<String>) -> Response<Cursor<Vec<u8>>> {
    let body = json!({ "error": msg.into() });
    Response::from_string(body.to_string())
        .with_status_code(StatusCode(status))
        .with_header(Header::from_bytes("Content-Type", "application/json").unwrap())
}

fn read_body(request: &mut Request) -> Result<Vec<u8>, String> {
    let mut buf = Vec::new();
    request
        .as_reader()
        .read_to_end(&mut buf)
        .map_err(|e| e.to_string())?;
    Ok(buf)
}

fn check_auth(request: &Request, expected: &str) -> bool {
    request
        .headers()
        .iter()
        .find(|h| h.field.equiv("Authorization"))
        .map(|h| h.value.as_str() == expected)
        .unwrap_or(false)
}

fn query_param(url: &str, key: &str) -> Option<String> {
    let q = url.split_once('?')?.1;
    q.split('&').find_map(|pair| {
        let (k, v) = pair.split_once('=')?;
        (k == key).then(|| v.to_string())
    })
}

fn handle(
    db: &Arc<Db>,
    auth: &str,
    state: &BridgeState,
    mut request: Request,
) -> Result<(), ()> {
    let method = request.method().clone();
    let url = request.url().to_string();
    let path = url.split('?').next().unwrap_or(&url).to_string();
    let method_s = format!("{method:?}");

    if !check_auth(&request, auth) {
        state.push_log(method_s, path, 401, Some("unauthorized".into()));
        let _ = request.respond(unauthorized());
        return Ok(());
    }

    let response = match (&method, path.as_str()) {
        (&Method::Get, "/v1/health") => json_ok(json!({ "ok": true })),
        (&Method::Get, "/v1/workspaces") => match db.list_workspaces() {
            Ok(v) => json_ok(v),
            Err(e) => json_err(500, e),
        },
        (&Method::Post, "/v1/workspaces") => {
            #[derive(Deserialize)]
            struct Body {
                name: String,
            }
            match read_body(&mut request).and_then(|b| {
                serde_json::from_slice::<Body>(&b).map_err(|e| e.to_string())
            }) {
                Ok(b) => match db.create_workspace(b.name) {
                    Ok(v) => json_ok(v),
                    Err(e) => json_err(500, e),
                },
                Err(e) => json_err(400, e),
            }
        }
        (&Method::Get, "/v1/collections") => {
            let wid = query_param(&url, "workspaceId");
            match db.list_collections(wid) {
                Ok(v) => json_ok(v),
                Err(e) => json_err(500, e),
            }
        }
        (&Method::Post, "/v1/collections") => {
            #[derive(Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Body {
                name: String,
                workspace_id: String,
                #[serde(default)]
                description: String,
            }
            match read_body(&mut request).and_then(|b| {
                serde_json::from_slice::<Body>(&b).map_err(|e| e.to_string())
            }) {
                Ok(b) => match db.create_collection(b.name, b.workspace_id) {
                    Ok(v) => {
                        if b.description.trim().is_empty() {
                            json_ok(v)
                        } else {
                            match db.set_collection_description(&v.id, b.description) {
                                Ok(updated) => json_ok(updated),
                                Err(e) => json_err(500, e),
                            }
                        }
                    }
                    Err(e) => json_err(500, e),
                },
                Err(e) => json_err(400, e),
            }
        }
        (&Method::Patch, p)
            if p.starts_with("/v1/collections/")
                && !p.ends_with("/requests")
                && !p.ends_with("/folders") =>
        {
            let id = p.trim_start_matches("/v1/collections/");
            #[derive(Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Body {
                description: String,
            }
            match read_body(&mut request).and_then(|b| {
                serde_json::from_slice::<Body>(&b).map_err(|e| e.to_string())
            }) {
                Ok(b) => match db.set_collection_description(id, b.description) {
                    Ok(v) => json_ok(v),
                    Err(e) => json_err(500, e),
                },
                Err(e) => json_err(400, e),
            }
        }
        (&Method::Get, p) if p.starts_with("/v1/collections/") && p.ends_with("/requests") => {
            let id = p
                .trim_start_matches("/v1/collections/")
                .trim_end_matches("/requests");
            match db.list_requests(id.to_string()) {
                Ok(v) => json_ok(v),
                Err(e) => json_err(500, e),
            }
        }
        (&Method::Get, p) if p.starts_with("/v1/collections/") && p.ends_with("/folders") => {
            let id = p
                .trim_start_matches("/v1/collections/")
                .trim_end_matches("/folders");
            match db.list_folders(id.to_string()) {
                Ok(v) => json_ok(v),
                Err(e) => json_err(500, e),
            }
        }
        (&Method::Post, "/v1/folders") => {
            #[derive(Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Body {
                collection_id: String,
                parent_id: Option<String>,
                name: String,
            }
            match read_body(&mut request).and_then(|b| {
                serde_json::from_slice::<Body>(&b).map_err(|e| e.to_string())
            }) {
                Ok(b) => match db.create_folder(b.collection_id, b.parent_id, b.name) {
                    Ok(v) => json_ok(v),
                    Err(e) => json_err(500, e),
                },
                Err(e) => json_err(400, e),
            }
        }
        (&Method::Delete, p) if p.starts_with("/v1/folders/") => {
            let id = p.trim_start_matches("/v1/folders/");
            match db.delete_folder(id) {
                Ok(()) => json_ok(json!({ "ok": true })),
                Err(e) => json_err(500, e),
            }
        }
        (&Method::Patch, p) if p.starts_with("/v1/folders/") => {
            let id = p.trim_start_matches("/v1/folders/");
            #[derive(Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Body {
                name: String,
            }
            match read_body(&mut request).and_then(|b| {
                serde_json::from_slice::<Body>(&b).map_err(|e| e.to_string())
            }) {
                Ok(b) => match db.rename_folder(id, b.name) {
                    Ok(v) => json_ok(v),
                    Err(e) => json_err(500, e),
                },
                Err(e) => json_err(400, e),
            }
        }
        (&Method::Post, "/v1/reorder") => {
            #[derive(Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Body {
                collection_id: String,
                parent_id: Option<String>,
                ordered: Vec<TreeOrderItem>,
            }
            match read_body(&mut request).and_then(|b| {
                serde_json::from_slice::<Body>(&b).map_err(|e| e.to_string())
            }) {
                Ok(b) => match db.reorder_siblings(b.collection_id, b.parent_id, b.ordered) {
                    Ok(()) => json_ok(json!({ "ok": true })),
                    Err(e) => json_err(400, e),
                },
                Err(e) => json_err(400, e),
            }
        }
        (&Method::Get, p) if p.starts_with("/v1/requests/") => {
            let id = p.trim_start_matches("/v1/requests/");
            match db.get_request(id) {
                Ok(v) => json_ok(v),
                Err(e) => json_err(404, e),
            }
        }
        (&Method::Post, "/v1/requests") => match read_body(&mut request).and_then(|b| {
            serde_json::from_slice::<HttpRequest>(&b).map_err(|e| e.to_string())
        }) {
            Ok(mut req) => {
                if req.id.is_empty() {
                    req.id = Uuid::new_v4().to_string();
                }
                match db.upsert_request(req) {
                    Ok(v) => json_ok(v),
                    Err(e) => json_err(500, e),
                }
            }
            Err(e) => json_err(400, e),
        },
        (&Method::Put, p) if p.starts_with("/v1/requests/") => {
            let id = p.trim_start_matches("/v1/requests/").to_string();
            match read_body(&mut request).and_then(|b| {
                serde_json::from_slice::<HttpRequest>(&b).map_err(|e| e.to_string())
            }) {
                Ok(mut req) => {
                    req.id = id;
                    match db.upsert_request(req) {
                        Ok(v) => json_ok(v),
                        Err(e) => json_err(500, e),
                    }
                }
                Err(e) => json_err(400, e),
            }
        }
        (&Method::Delete, p) if p.starts_with("/v1/requests/") => {
            let id = p.trim_start_matches("/v1/requests/");
            match db.delete_request(id) {
                Ok(()) => json_ok(json!({ "ok": true })),
                Err(e) => json_err(500, e),
            }
        }
        (&Method::Get, "/v1/environments") => match db.list_environments() {
            Ok(v) => json_ok(v),
            Err(e) => json_err(500, e),
        },
        (&Method::Post, "/v1/environments") => match read_body(&mut request).and_then(|b| {
            serde_json::from_slice::<Environment>(&b).map_err(|e| e.to_string())
        }) {
            Ok(mut env) => {
                if env.id.is_empty() {
                    env.id = Uuid::new_v4().to_string();
                }
                match db.upsert_environment(env) {
                    Ok(v) => json_ok(v),
                    Err(e) => json_err(500, e),
                }
            }
            Err(e) => json_err(400, e),
        },
        (&Method::Put, p) if p.starts_with("/v1/environments/") => {
            let id = p.trim_start_matches("/v1/environments/").to_string();
            match read_body(&mut request).and_then(|b| {
                serde_json::from_slice::<Environment>(&b).map_err(|e| e.to_string())
            }) {
                Ok(mut env) => {
                    env.id = id;
                    match db.upsert_environment(env) {
                        Ok(v) => json_ok(v),
                        Err(e) => json_err(500, e),
                    }
                }
                Err(e) => json_err(400, e),
            }
        }
        (&Method::Post, p) if p.starts_with("/v1/environments/") && p.ends_with("/activate") => {
            let id = p
                .trim_start_matches("/v1/environments/")
                .trim_end_matches("/activate");
            match db.set_active_environment(id.to_string()) {
                Ok(()) => json_ok(json!({ "ok": true })),
                Err(e) => json_err(500, e),
            }
        }
        (&Method::Get, "/v1/environments/active") => {
            match db.list_environments() {
                Ok(envs) => {
                    let active = envs.into_iter().find(|e| e.is_active && !e.is_global);
                    json_ok(active)
                }
                Err(e) => json_err(500, e),
            }
        }
        (&Method::Post, "/v1/run") => {
            #[derive(Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Body {
                request_id: String,
                environment_id: Option<String>,
            }
            match read_body(&mut request).and_then(|b| {
                serde_json::from_slice::<Body>(&b).map_err(|e| e.to_string())
            }) {
                Ok(body) => match run_request(db, &body.request_id, body.environment_id.as_deref())
                {
                    Ok(v) => json_ok(v),
                    Err(e) => json_err(400, e),
                },
                Err(e) => json_err(400, e),
            }
        }
        (&Method::Post, "/v1/openapi/import") => {
            #[derive(Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Body {
                spec: String,
                workspace_id: String,
            }
            match read_body(&mut request).and_then(|b| {
                serde_json::from_slice::<Body>(&b).map_err(|e| e.to_string())
            }) {
                Ok(body) => {
                    match crate::openapi_ops::import_into_db(db, &body.spec, &body.workspace_id) {
                        Ok(v) => json_ok(v),
                        Err(e) => json_err(400, e),
                    }
                }
                Err(e) => json_err(400, e),
            }
        }
        (&Method::Post, "/v1/openapi/export") => {
            #[derive(Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Body {
                collection_id: String,
            }
            match read_body(&mut request).and_then(|b| {
                serde_json::from_slice::<Body>(&b).map_err(|e| e.to_string())
            }) {
                Ok(body) => match crate::openapi_ops::export_from_db(db, &body.collection_id) {
                    Ok(v) => json_ok(json!({ "spec": v })),
                    Err(e) => json_err(400, e),
                },
                Err(e) => json_err(400, e),
            }
        }
        _ => json_err(404, format!("not found: {:?} {path}", method)),
    };

    let status = response.status_code().0;
    let detail = if status >= 400 {
        Some(format!("{method_s} {path}"))
    } else {
        None
    };
    state.push_log(method_s, path, status, detail);
    let _ = request.respond(response);
    Ok(())
}

fn run_request(
    db: &Db,
    request_id: &str,
    environment_id: Option<&str>,
) -> Result<http_exec::SendRequestResult, String> {
    let req = db.get_request(request_id)?;
    let envs = db.list_environments()?;
    let mut active = HashMap::new();
    let mut global = HashMap::new();
    for e in &envs {
        let map: HashMap<String, String> =
            serde_json::from_str(&e.vars_json).unwrap_or_default();
        if e.is_global {
            global = map;
        } else if environment_id.map(|id| id == e.id).unwrap_or(e.is_active) {
            active = map;
        }
    }
    let headers: Vec<(String, String)> =
        serde_json::from_str(&req.headers_json).unwrap_or_default();
    let body_pairs = inpost_core::httputil::parse_kv_pairs(&req.body_pairs_json);
    let path_vars: Vec<(String, String)> =
        serde_json::from_str(&req.path_vars_json).unwrap_or_default();
    let result = http_exec::send(SendRequestInput {
        method: req.method.clone(),
        url: req.url.clone(),
        headers,
        body: if req.body.is_empty() {
            None
        } else {
            Some(req.body.clone())
        },
        body_type: req.body_type.clone(),
        body_pairs,
        auth_type: req.auth_type.clone(),
        auth_json: req.auth_json.clone(),
        path_vars,
        active_vars: active,
        global_vars: global,
    });

    // Same history the UI writes, so MCP runs show up in the History rail.
    if let Ok(Some(workspace_id)) = db.workspace_for_collection(&req.collection_id) {
        let created_at = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);
        let entry = match &result {
            Ok(r) => HistoryEntry {
                id: String::new(),
                workspace_id,
                request_id: Some(req.id.clone()),
                method: req.method.clone(),
                url: r.resolved_url.clone(),
                status: Some(r.status as i64),
                status_text: Some(r.status_text.clone()),
                elapsed_ms: Some(r.elapsed_ms as i64),
                size_bytes: Some(r.body.len() as i64),
                error: None,
                body: Some(r.body.clone()),
                body_pretty: r.body_pretty.clone(),
                headers_json: Some(serde_json::to_string(&r.headers).unwrap_or_else(|_| "[]".into())),
                created_at,
            },
            Err(e) => HistoryEntry {
                id: String::new(),
                workspace_id,
                request_id: Some(req.id.clone()),
                method: req.method.clone(),
                url: req.url.clone(),
                status: None,
                status_text: None,
                elapsed_ms: Some(0),
                size_bytes: Some(0),
                error: Some(e.clone()),
                body: None,
                body_pretty: None,
                headers_json: None,
                created_at,
            },
        };
        let _ = db.insert_history(entry);
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn install_stdio_bundle_errors_on_missing_source() {
        // Regression: install_stdio_bundle used to silently no-op when the
        // resource path didn't exist, leaving session.json present but stdio.mjs
        // missing on Windows installs. It must now surface the failure.
        let bogus = std::path::PathBuf::from("/this/path/does/not/exist/stdio.mjs");
        let err = install_stdio_bundle(&bogus).unwrap_err();
        assert!(
            err.contains("not found"),
            "expected 'not found' in error, got: {err}"
        );
    }
}