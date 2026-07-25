//! OpenAPI ↔ SQLite. Shared by Tauri commands and MCP bridge.

use std::collections::HashMap;

use serde::Serialize;
use uuid::Uuid;

use crate::db::{Collection, Db, HttpRequest};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenApiImportResult {
    pub collection: Collection,
    pub request_count: usize,
    pub base_url: Option<String>,
}

pub fn import_into_db(
    db: &Db,
    spec: &str,
    workspace_id: &str,
) -> Result<OpenApiImportResult, String> {
    let imported = inpost_core::openapi::import_openapi(spec)?;
    let mut collection = db.create_collection(imported.collection_name, workspace_id.to_string())?;
    if !imported.collection_description.trim().is_empty() {
        collection =
            db.set_collection_description(&collection.id, imported.collection_description.clone())?;
    }
    for r in &imported.requests {
        db.upsert_request(HttpRequest {
            id: Uuid::new_v4().to_string(),
            collection_id: collection.id.clone(),
            folder_id: None,
            name: r.name.clone(),
            description: r.description.clone(),
            method: r.method.clone(),
            url: r.url.clone(),
            headers_json: r.headers_json.clone(),
            body: r.body.clone(),
            body_type: r.body_type.clone(),
            body_pairs_json: "[]".into(),
            auth_type: "none".into(),
            auth_json: "{}".into(),
            path_vars_json: "[]".into(),
            sort_order: 0,
        })?;
    }
    if let Some(base) = &imported.base_url {
        if let Ok(envs) = db.list_environments() {
            if let Some(mut active) = envs.into_iter().find(|e| e.is_active && !e.is_global) {
                let mut vars: HashMap<String, String> =
                    serde_json::from_str(&active.vars_json).unwrap_or_default();
                vars.entry("baseUrl".into())
                    .or_insert_with(|| base.clone());
                active.vars_json = serde_json::to_string(&vars).unwrap_or(active.vars_json);
                let _ = db.upsert_environment(active);
            }
        }
    }
    Ok(OpenApiImportResult {
        request_count: imported.requests.len(),
        base_url: imported.base_url,
        collection,
    })
}

pub fn export_from_db(db: &Db, collection_id: &str) -> Result<String, String> {
    let cols = db.list_collections(None)?;
    let col = cols
        .into_iter()
        .find(|c| c.id == collection_id)
        .ok_or_else(|| "collection not found".to_string())?;
    let reqs = db.list_requests(collection_id.to_string())?;
    let export_reqs: Vec<inpost_core::openapi::ExportRequest> = reqs
        .into_iter()
        .map(|r| inpost_core::openapi::ExportRequest {
            name: r.name,
            description: r.description,
            method: r.method,
            url: r.url,
            headers_json: r.headers_json,
            body: r.body,
            body_type: r.body_type,
            body_pairs_json: r.body_pairs_json,
        })
        .collect();
    inpost_core::openapi::export_openapi(&col.name, &col.description, &export_reqs)
}
