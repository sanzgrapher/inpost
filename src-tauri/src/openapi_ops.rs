//! OpenAPI ↔ SQLite. Shared by Tauri commands and MCP bridge.

use std::collections::{HashMap, HashSet};

use serde::Serialize;
use uuid::Uuid;

use crate::db::{Collection, Db, Folder, HttpRequest};

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

    // Tag name → folder id. Create from root `tags` first (preserves order + parents).
    let mut folder_ids: HashMap<String, String> = HashMap::new();
    create_folders_from_tags(db, &collection.id, &imported.tags, &mut folder_ids)?;

    for r in &imported.requests {
        let folder_id = if let Some(tag) = r.folder.as_ref() {
            Some(ensure_folder(db, &collection.id, tag, &mut folder_ids)?)
        } else {
            None
        };
        db.upsert_request(HttpRequest {
            id: Uuid::new_v4().to_string(),
            collection_id: collection.id.clone(),
            folder_id,
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

fn create_folders_from_tags(
    db: &Db,
    collection_id: &str,
    tags: &[inpost_core::openapi::ImportTag],
    folder_ids: &mut HashMap<String, String>,
) -> Result<(), String> {
    // Parents may appear after children in a bad spec — multi-pass until stuck.
    let mut pending: Vec<&inpost_core::openapi::ImportTag> = tags.iter().collect();
    let mut guard = pending.len() + 1;
    while !pending.is_empty() && guard > 0 {
        guard -= 1;
        let mut next = Vec::new();
        for tag in &pending {
            if folder_ids.contains_key(&tag.name) {
                continue;
            }
            let parent_id = match &tag.parent {
                None => None,
                Some(p) => match folder_ids.get(p) {
                    Some(id) => Some(id.clone()),
                    None => {
                        // Parent not created yet (or missing) — retry later; if never
                        // appears, create as root on last pass via ensure below.
                        next.push(*tag);
                        continue;
                    }
                },
            };
            let f = db.create_folder(collection_id.to_string(), parent_id, tag.name.clone())?;
            folder_ids.insert(tag.name.clone(), f.id);
        }
        if next.len() == pending.len() {
            // No progress: create remaining as root (orphan parent names).
            for tag in next {
                if folder_ids.contains_key(&tag.name) {
                    continue;
                }
                let f = db.create_folder(collection_id.to_string(), None, tag.name.clone())?;
                folder_ids.insert(tag.name.clone(), f.id);
            }
            break;
        }
        pending = next;
    }
    Ok(())
}

fn ensure_folder(
    db: &Db,
    collection_id: &str,
    tag: &str,
    folder_ids: &mut HashMap<String, String>,
) -> Result<String, String> {
    if let Some(id) = folder_ids.get(tag) {
        return Ok(id.clone());
    }
    let f = db.create_folder(collection_id.to_string(), None, tag.to_string())?;
    folder_ids.insert(tag.to_string(), f.id.clone());
    Ok(f.id)
}

pub fn export_from_db(db: &Db, collection_id: &str) -> Result<String, String> {
    let cols = db.list_collections(None)?;
    let col = cols
        .into_iter()
        .find(|c| c.id == collection_id)
        .ok_or_else(|| "collection not found".to_string())?;
    let folders = db.list_folders(collection_id.to_string())?;
    let tag_by_id = folder_tag_names(&folders);
    let export_folders = export_folders_ordered(&folders, &tag_by_id);
    let reqs = db.list_requests(collection_id.to_string())?;
    let export_reqs: Vec<inpost_core::openapi::ExportRequest> = reqs
        .into_iter()
        .map(|r| inpost_core::openapi::ExportRequest {
            folder: r.folder_id.as_ref().and_then(|id| tag_by_id.get(id).cloned()),
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
    inpost_core::openapi::export_openapi(
        &col.name,
        &col.description,
        &export_reqs,
        &export_folders,
    )
}

/// OpenAPI tag names must be unique. Prefer folder.name; on collision use "Ancestors / Name".
fn folder_tag_names(folders: &[Folder]) -> HashMap<String, String> {
    let by_id: HashMap<&str, &Folder> = folders.iter().map(|f| (f.id.as_str(), f)).collect();
    let mut name_count: HashMap<&str, usize> = HashMap::new();
    for f in folders {
        *name_count.entry(f.name.as_str()).or_insert(0) += 1;
    }
    let mut out = HashMap::new();
    for f in folders {
        let tag = if name_count.get(f.name.as_str()).copied().unwrap_or(0) > 1 {
            folder_path_name(f, &by_id)
        } else {
            f.name.clone()
        };
        out.insert(f.id.clone(), tag);
    }
    out
}

fn folder_path_name(f: &Folder, by_id: &HashMap<&str, &Folder>) -> String {
    let mut parts = vec![f.name.as_str()];
    let mut cur = f.parent_id.as_deref();
    let mut seen = HashSet::new();
    while let Some(pid) = cur {
        if !seen.insert(pid) {
            break;
        }
        let Some(p) = by_id.get(pid) else {
            break;
        };
        parts.push(p.name.as_str());
        cur = p.parent_id.as_deref();
    }
    parts.reverse();
    parts.join(" / ")
}

fn export_folders_ordered(
    folders: &[Folder],
    tag_by_id: &HashMap<String, String>,
) -> Vec<inpost_core::openapi::ExportFolder> {
    // Parents before children so import multi-pass is easy; stable by sort_order within level.
    let mut remaining: Vec<&Folder> = folders.iter().collect();
    remaining.sort_by_key(|f| f.sort_order);
    let mut done: HashSet<&str> = HashSet::new();
    let mut out = Vec::new();
    let mut guard = remaining.len() + 1;
    while out.len() < folders.len() && guard > 0 {
        guard -= 1;
        let mut progressed = false;
        for f in &remaining {
            if done.contains(f.id.as_str()) {
                continue;
            }
            let parent_ok = match &f.parent_id {
                None => true,
                Some(p) => done.contains(p.as_str()),
            };
            if !parent_ok {
                continue;
            }
            let name = tag_by_id
                .get(&f.id)
                .cloned()
                .unwrap_or_else(|| f.name.clone());
            let parent = f
                .parent_id
                .as_ref()
                .and_then(|pid| tag_by_id.get(pid).cloned());
            out.push(inpost_core::openapi::ExportFolder { name, parent });
            done.insert(f.id.as_str());
            progressed = true;
        }
        if !progressed {
            // Cycle / missing parent — dump the rest as roots.
            for f in &remaining {
                if done.contains(f.id.as_str()) {
                    continue;
                }
                let name = tag_by_id
                    .get(&f.id)
                    .cloned()
                    .unwrap_or_else(|| f.name.clone());
                out.push(inpost_core::openapi::ExportFolder {
                    name,
                    parent: None,
                });
                done.insert(f.id.as_str());
            }
            break;
        }
    }
    out
}
