//! Local SQLite — source of truth. No account, no sync required.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub struct Db(pub Mutex<Connection>);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Workspace {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Collection {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub workspace_id: String,
    #[serde(default)]
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Folder {
    pub id: String,
    pub collection_id: String,
    #[serde(default)]
    pub parent_id: Option<String>,
    pub name: String,
    #[serde(default)]
    pub sort_order: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpRequest {
    pub id: String,
    pub collection_id: String,
    #[serde(default)]
    pub folder_id: Option<String>,
    pub name: String,
    #[serde(default)]
    pub description: String,
    pub method: String,
    pub url: String,
    pub headers_json: String,
    pub body: String,
    #[serde(default = "default_body_type")]
    pub body_type: String,
    #[serde(default = "default_empty_array")]
    pub body_pairs_json: String,
    #[serde(default = "default_auth_type")]
    pub auth_type: String,
    #[serde(default = "default_empty_object")]
    pub auth_json: String,
    #[serde(default = "default_empty_array")]
    pub path_vars_json: String,
    #[serde(default)]
    pub sort_order: i64,
}

fn default_body_type() -> String {
    "none".into()
}
fn default_auth_type() -> String {
    "none".into()
}
fn default_empty_array() -> String {
    "[]".into()
}
fn default_empty_object() -> String {
    "{}".into()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Environment {
    pub id: String,
    pub name: String,
    pub is_global: bool,
    pub is_active: bool,
    pub vars_json: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    pub id: String,
    pub workspace_id: String,
    #[serde(default)]
    pub request_id: Option<String>,
    pub method: String,
    pub url: String,
    #[serde(default)]
    pub status: Option<i64>,
    #[serde(default)]
    pub status_text: Option<String>,
    #[serde(default)]
    pub elapsed_ms: Option<i64>,
    #[serde(default)]
    pub size_bytes: Option<i64>,
    #[serde(default)]
    pub error: Option<String>,
    #[serde(default)]
    pub body: Option<String>,
    #[serde(default)]
    pub body_pretty: Option<String>,
    #[serde(default)]
    pub headers_json: Option<String>,
    /// Snapshot of the request that produced this response (headers/body/auth/…).
    #[serde(default)]
    pub request_json: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TreeOrderItem {
    /// "folder" | "request"
    pub kind: String,
    pub id: String,
}

pub fn data_dir() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("com.inpost.desktop")
}

pub fn mcp_dir() -> PathBuf {
    data_dir().join("mcp")
}

pub fn open() -> Result<Db, String> {
    let dir = data_dir();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join("inpost.db");
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    migrate(&conn)?;
    Ok(Db(Mutex::new(conn)))
}

fn has_column(conn: &Connection, table: &str, col: &str) -> Result<bool, String> {
    let mut stmt = conn
        .prepare(&format!("PRAGMA table_info({table})"))
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| r.get::<_, String>(1))
        .map_err(|e| e.to_string())?;
    for name in rows {
        if name.map_err(|e| e.to_string())? == col {
            return Ok(true);
        }
    }
    Ok(false)
}

fn migrate(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS collections (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS requests (
          id TEXT PRIMARY KEY,
          collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          method TEXT NOT NULL,
          url TEXT NOT NULL,
          headers_json TEXT NOT NULL DEFAULT '[]',
          body TEXT NOT NULL DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS environments (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          is_global INTEGER NOT NULL DEFAULT 0,
          is_active INTEGER NOT NULL DEFAULT 0,
          vars_json TEXT NOT NULL DEFAULT '{}'
        );
        CREATE TABLE IF NOT EXISTS folders (
          id TEXT PRIMARY KEY,
          collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
          parent_id TEXT REFERENCES folders(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          sort_order INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS workspaces (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS request_history (
          id TEXT PRIMARY KEY,
          workspace_id TEXT NOT NULL,
          request_id TEXT,
          method TEXT NOT NULL,
          url TEXT NOT NULL,
          status INTEGER,
          status_text TEXT,
          elapsed_ms INTEGER,
          size_bytes INTEGER,
          error TEXT,
          body TEXT,
          body_pretty TEXT,
          created_at INTEGER NOT NULL
        );
        ",
    )
    .map_err(|e| e.to_string())?;

    // Older DBs created before request_history existed.
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS request_history (
          id TEXT PRIMARY KEY,
          workspace_id TEXT NOT NULL,
          request_id TEXT,
          method TEXT NOT NULL,
          url TEXT NOT NULL,
          status INTEGER,
          status_text TEXT,
          elapsed_ms INTEGER,
          size_bytes INTEGER,
          error TEXT,
          body TEXT,
          body_pretty TEXT,
          created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_history_workspace
          ON request_history(workspace_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_history_request
          ON request_history(request_id, created_at DESC);
        ",
    )
    .map_err(|e| e.to_string())?;

    if !has_column(conn, "collections", "workspace_id")? {
        conn.execute_batch(
            "ALTER TABLE collections ADD COLUMN workspace_id TEXT REFERENCES workspaces(id);",
        )
        .map_err(|e| e.to_string())?;
    }

    let wn: i64 = conn
        .query_row("SELECT COUNT(*) FROM workspaces", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    let default_ws = if wn == 0 {
        let wid = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO workspaces (id, name) VALUES (?1, ?2)",
            params![wid, "Personal"],
        )
        .map_err(|e| e.to_string())?;
        wid
    } else {
        conn.query_row(
            "SELECT id FROM workspaces ORDER BY name LIMIT 1",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?
    };
    conn.execute(
        "UPDATE collections SET workspace_id = ?1 WHERE workspace_id IS NULL OR workspace_id = ''",
        params![default_ws],
    )
    .map_err(|e| e.to_string())?;

    if !has_column(conn, "requests", "folder_id")? {
        conn.execute_batch(
            "
            ALTER TABLE requests ADD COLUMN folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL;
            ALTER TABLE requests ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
            ",
        )
        .map_err(|e| e.to_string())?;
        // Preserve name order as initial sort_order per collection.
        let cids: Vec<String> = {
            let mut stmt = conn
                .prepare("SELECT id FROM collections")
                .map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map([], |r| r.get(0))
                .map_err(|e| e.to_string())?;
            rows.collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?
        };
        for cid in cids {
            let ids: Vec<String> = {
                let mut stmt = conn
                    .prepare(
                        "SELECT id FROM requests WHERE collection_id = ?1 ORDER BY name",
                    )
                    .map_err(|e| e.to_string())?;
                let rows = stmt
                    .query_map(params![cid], |r| r.get(0))
                    .map_err(|e| e.to_string())?;
                rows.collect::<Result<Vec<_>, _>>()
                    .map_err(|e| e.to_string())?
            };
            for (i, id) in ids.iter().enumerate() {
                conn.execute(
                    "UPDATE requests SET sort_order = ?1 WHERE id = ?2",
                    params![i as i64, id],
                )
                .map_err(|e| e.to_string())?;
            }
        }
    }

    let n: i64 = conn
        .query_row("SELECT COUNT(*) FROM collections", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    if n == 0 {
        let cid = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO collections (id, name, workspace_id) VALUES (?1, ?2, ?3)",
            params![cid, "Default", default_ws],
        )
        .map_err(|e| e.to_string())?;
        let rid = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO requests (id, collection_id, folder_id, name, method, url, headers_json, body, sort_order)
             VALUES (?1, ?2, NULL, ?3, ?4, ?5, ?6, ?7, 0)",
            params![
                rid,
                cid,
                "Example GET",
                "GET",
                "{{baseUrl}}/get",
                "[]",
                ""
            ],
        )
        .map_err(|e| e.to_string())?;
    }

    let en: i64 = conn
        .query_row("SELECT COUNT(*) FROM environments", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    if en == 0 {
        let gid = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO environments (id, name, is_global, is_active, vars_json)
             VALUES (?1, ?2, 1, 0, ?3)",
            params![gid, "Global", "{}"],
        )
        .map_err(|e| e.to_string())?;
        let aid = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO environments (id, name, is_global, is_active, vars_json)
             VALUES (?1, ?2, 0, 1, ?3)",
            params![aid, "Local", r#"{"baseUrl":"https://httpbin.org"}"#],
        )
        .map_err(|e| e.to_string())?;
    }

    if !has_column(conn, "requests", "body_type")? {
        conn.execute_batch(
            "
            ALTER TABLE requests ADD COLUMN body_type TEXT NOT NULL DEFAULT 'none';
            ALTER TABLE requests ADD COLUMN body_pairs_json TEXT NOT NULL DEFAULT '[]';
            ALTER TABLE requests ADD COLUMN auth_type TEXT NOT NULL DEFAULT 'none';
            ALTER TABLE requests ADD COLUMN auth_json TEXT NOT NULL DEFAULT '{}';
            ALTER TABLE requests ADD COLUMN path_vars_json TEXT NOT NULL DEFAULT '[]';
            UPDATE requests SET body_type = 'json' WHERE TRIM(body) != '';
            ",
        )
        .map_err(|e| e.to_string())?;
    }
    if !has_column(conn, "request_history", "headers_json")? {
        conn.execute_batch(
            "ALTER TABLE request_history ADD COLUMN headers_json TEXT;",
        )
        .map_err(|e| e.to_string())?;
    }
    if !has_column(conn, "request_history", "request_json")? {
        conn.execute_batch(
            "ALTER TABLE request_history ADD COLUMN request_json TEXT;",
        )
        .map_err(|e| e.to_string())?;
    }
    if !has_column(conn, "requests", "description")? {
        conn.execute_batch(
            "ALTER TABLE requests ADD COLUMN description TEXT NOT NULL DEFAULT '';",
        )
        .map_err(|e| e.to_string())?;
    }
    if !has_column(conn, "collections", "description")? {
        conn.execute_batch(
            "ALTER TABLE collections ADD COLUMN description TEXT NOT NULL DEFAULT '';",
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

fn parent_map(conn: &Connection, collection_id: &str) -> Result<HashMap<String, Option<String>>, String> {
    let mut stmt = conn
        .prepare("SELECT id, parent_id FROM folders WHERE collection_id = ?1")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![collection_id], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, Option<String>>(1)?))
        })
        .map_err(|e| e.to_string())?;
    let mut map = HashMap::new();
    for row in rows {
        let (id, parent) = row.map_err(|e| e.to_string())?;
        map.insert(id, parent);
    }
    Ok(map)
}

fn sibling_names(
    conn: &Connection,
    collection_id: &str,
    parent_id: Option<&str>,
    exclude_folder: Option<&str>,
    exclude_request: Option<&str>,
) -> Result<Vec<String>, String> {
    let mut names = Vec::new();
    {
        let mut stmt = conn
            .prepare(
                "SELECT id, name FROM folders
                 WHERE collection_id = ?1 AND (
                   (?2 IS NULL AND parent_id IS NULL) OR parent_id = ?2
                 )",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![collection_id, parent_id], |r| {
                Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
            })
            .map_err(|e| e.to_string())?;
        for row in rows {
            let (id, name) = row.map_err(|e| e.to_string())?;
            if exclude_folder == Some(id.as_str()) {
                continue;
            }
            names.push(name);
        }
    }
    {
        let mut stmt = conn
            .prepare(
                "SELECT id, name FROM requests
                 WHERE collection_id = ?1 AND (
                   (?2 IS NULL AND folder_id IS NULL) OR folder_id = ?2
                 )",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![collection_id, parent_id], |r| {
                Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
            })
            .map_err(|e| e.to_string())?;
        for row in rows {
            let (id, name) = row.map_err(|e| e.to_string())?;
            if exclude_request == Some(id.as_str()) {
                continue;
            }
            names.push(name);
        }
    }
    Ok(names)
}

fn next_sort_order(
    conn: &Connection,
    collection_id: &str,
    parent_id: Option<&str>,
) -> Result<i64, String> {
    let folder_max: Option<i64> = conn
        .query_row(
            "SELECT MAX(sort_order) FROM folders
             WHERE collection_id = ?1 AND (
               (?2 IS NULL AND parent_id IS NULL) OR parent_id = ?2
             )",
            params![collection_id, parent_id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    let req_max: Option<i64> = conn
        .query_row(
            "SELECT MAX(sort_order) FROM requests
             WHERE collection_id = ?1 AND (
               (?2 IS NULL AND folder_id IS NULL) OR folder_id = ?2
             )",
            params![collection_id, parent_id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(folder_max.unwrap_or(-1).max(req_max.unwrap_or(-1)) + 1)
}

impl Db {
    pub fn list_workspaces(&self) -> Result<Vec<Workspace>, String> {
        let conn = self.0.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT id, name FROM workspaces ORDER BY name")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| {
                Ok(Workspace {
                    id: r.get(0)?,
                    name: r.get(1)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    }

    pub fn create_workspace(&self, name: String) -> Result<Workspace, String> {
        let id = Uuid::new_v4().to_string();
        let conn = self.0.lock().map_err(|e| e.to_string())?;
        let taken: Vec<String> = {
            let mut stmt = conn
                .prepare("SELECT name FROM workspaces")
                .map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map([], |r| r.get(0))
                .map_err(|e| e.to_string())?;
            rows.collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?
        };
        let name = inpost_core::tree::unique_sibling_name(&name, &taken);
        conn.execute(
            "INSERT INTO workspaces (id, name) VALUES (?1, ?2)",
            params![id, name],
        )
        .map_err(|e| e.to_string())?;
        Ok(Workspace { id, name })
    }

    pub fn rename_workspace(&self, id: &str, name: String) -> Result<Workspace, String> {
        let conn = self.0.lock().map_err(|e| e.to_string())?;
        let exists: bool = conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM workspaces WHERE id = ?1",
                params![id],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        if !exists {
            return Err("workspace not found".into());
        }
        let taken: Vec<String> = {
            let mut stmt = conn
                .prepare("SELECT name FROM workspaces WHERE id != ?1")
                .map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map(params![id], |r| r.get(0))
                .map_err(|e| e.to_string())?;
            rows.collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?
        };
        let name = inpost_core::tree::unique_sibling_name(&name, &taken);
        conn.execute(
            "UPDATE workspaces SET name = ?1 WHERE id = ?2",
            params![name, id],
        )
        .map_err(|e| e.to_string())?;
        Ok(Workspace {
            id: id.to_string(),
            name,
        })
    }

    /// Deletes a workspace and its collections / folders / requests / history.
    /// Refuses when it would leave zero workspaces.
    pub fn delete_workspace(&self, id: &str) -> Result<(), String> {
        let conn = self.0.lock().map_err(|e| e.to_string())?;
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM workspaces", [], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        if count <= 1 {
            return Err("cannot delete the last workspace".into());
        }
        let exists: bool = conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM workspaces WHERE id = ?1",
                params![id],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        if !exists {
            return Err("workspace not found".into());
        }
        // FK cascade is not enabled; clean children explicitly.
        conn.execute(
            "DELETE FROM requests WHERE collection_id IN \
             (SELECT id FROM collections WHERE workspace_id = ?1)",
            params![id],
        )
        .map_err(|e| e.to_string())?;
        conn.execute(
            "DELETE FROM folders WHERE collection_id IN \
             (SELECT id FROM collections WHERE workspace_id = ?1)",
            params![id],
        )
        .map_err(|e| e.to_string())?;
        conn.execute(
            "DELETE FROM collections WHERE workspace_id = ?1",
            params![id],
        )
        .map_err(|e| e.to_string())?;
        conn.execute(
            "DELETE FROM request_history WHERE workspace_id = ?1",
            params![id],
        )
        .map_err(|e| e.to_string())?;
        let n = conn
            .execute("DELETE FROM workspaces WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        if n == 0 {
            return Err("workspace not found".into());
        }
        Ok(())
    }

    pub fn list_collections(&self, workspace_id: Option<String>) -> Result<Vec<Collection>, String> {
        let conn = self.0.lock().map_err(|e| e.to_string())?;
        let sql = if workspace_id.is_some() {
            "SELECT id, name, workspace_id, description FROM collections WHERE workspace_id = ?1 ORDER BY name"
        } else {
            "SELECT id, name, workspace_id, description FROM collections ORDER BY name"
        };
        let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
        let map_row = |r: &rusqlite::Row<'_>| {
            Ok(Collection {
                id: r.get(0)?,
                name: r.get(1)?,
                workspace_id: r.get::<_, Option<String>>(2)?.unwrap_or_default(),
                description: r.get::<_, Option<String>>(3)?.unwrap_or_default(),
            })
        };
        let rows = if let Some(wid) = workspace_id {
            stmt.query_map(params![wid], map_row)
                .map_err(|e| e.to_string())?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?
        } else {
            stmt.query_map([], map_row)
                .map_err(|e| e.to_string())?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?
        };
        Ok(rows)
    }

    pub fn create_collection(
        &self,
        name: String,
        workspace_id: String,
    ) -> Result<Collection, String> {
        let id = Uuid::new_v4().to_string();
        let conn = self.0.lock().map_err(|e| e.to_string())?;
        let ok: bool = conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM workspaces WHERE id = ?1",
                params![workspace_id],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        if !ok {
            return Err("workspace not found".into());
        }
        conn.execute(
            "INSERT INTO collections (id, name, workspace_id) VALUES (?1, ?2, ?3)",
            params![id, name, workspace_id],
        )
        .map_err(|e| e.to_string())?;
        Ok(Collection {
            id,
            name,
            workspace_id,
            description: String::new(),
        })
    }

    pub fn rename_collection(&self, id: &str, name: String) -> Result<Collection, String> {
        let conn = self.0.lock().map_err(|e| e.to_string())?;
        let n = conn
            .execute(
                "UPDATE collections SET name = ?1 WHERE id = ?2",
                params![name, id],
            )
            .map_err(|e| e.to_string())?;
        if n == 0 {
            return Err("collection not found".into());
        }
        let (workspace_id, description): (String, String) = conn
            .query_row(
                "SELECT workspace_id, description FROM collections WHERE id = ?1",
                params![id],
                |r| {
                    Ok((
                        r.get::<_, Option<String>>(0)?.unwrap_or_default(),
                        r.get::<_, Option<String>>(1)?.unwrap_or_default(),
                    ))
                },
            )
            .map_err(|e| e.to_string())?;
        Ok(Collection {
            id: id.to_string(),
            name,
            workspace_id,
            description,
        })
    }

    pub fn set_collection_description(
        &self,
        id: &str,
        description: String,
    ) -> Result<Collection, String> {
        let conn = self.0.lock().map_err(|e| e.to_string())?;
        let n = conn
            .execute(
                "UPDATE collections SET description = ?1 WHERE id = ?2",
                params![description, id],
            )
            .map_err(|e| e.to_string())?;
        if n == 0 {
            return Err("collection not found".into());
        }
        let (name, workspace_id): (String, String) = conn
            .query_row(
                "SELECT name, workspace_id FROM collections WHERE id = ?1",
                params![id],
                |r| {
                    Ok((
                        r.get(0)?,
                        r.get::<_, Option<String>>(1)?.unwrap_or_default(),
                    ))
                },
            )
            .map_err(|e| e.to_string())?;
        Ok(Collection {
            id: id.to_string(),
            name,
            workspace_id,
            description,
        })
    }

    pub fn delete_collection(&self, id: &str) -> Result<(), String> {
        let conn = self.0.lock().map_err(|e| e.to_string())?;
        let n = conn
            .execute("DELETE FROM collections WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        if n == 0 {
            return Err("collection not found".into());
        }
        Ok(())
    }

    pub fn list_folders(&self, collection_id: String) -> Result<Vec<Folder>, String> {
        let conn = self.0.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT id, collection_id, parent_id, name, sort_order
                 FROM folders WHERE collection_id = ?1
                 ORDER BY sort_order, name",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![collection_id], |r| {
                Ok(Folder {
                    id: r.get(0)?,
                    collection_id: r.get(1)?,
                    parent_id: r.get(2)?,
                    name: r.get(3)?,
                    sort_order: r.get(4)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    }

    pub fn create_folder(
        &self,
        collection_id: String,
        parent_id: Option<String>,
        name: String,
    ) -> Result<Folder, String> {
        let id = Uuid::new_v4().to_string();
        let conn = self.0.lock().map_err(|e| e.to_string())?;
        if let Some(ref pid) = parent_id {
            let ok: bool = conn
                .query_row(
                    "SELECT COUNT(*) > 0 FROM folders WHERE id = ?1 AND collection_id = ?2",
                    params![pid, collection_id],
                    |r| r.get(0),
                )
                .map_err(|e| e.to_string())?;
            if !ok {
                return Err("parent folder not found".into());
            }
        }
        let taken = sibling_names(
            &conn,
            &collection_id,
            parent_id.as_deref(),
            None,
            None,
        )?;
        let name = inpost_core::tree::unique_sibling_name(&name, &taken);
        let sort_order = next_sort_order(&conn, &collection_id, parent_id.as_deref())?;
        conn.execute(
            "INSERT INTO folders (id, collection_id, parent_id, name, sort_order)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, collection_id, parent_id, name, sort_order],
        )
        .map_err(|e| e.to_string())?;
        Ok(Folder {
            id,
            collection_id,
            parent_id,
            name,
            sort_order,
        })
    }

    pub fn rename_folder(&self, id: &str, name: String) -> Result<Folder, String> {
        let conn = self.0.lock().map_err(|e| e.to_string())?;
        let (collection_id, parent_id, sort_order): (String, Option<String>, i64) = conn
            .query_row(
                "SELECT collection_id, parent_id, sort_order FROM folders WHERE id = ?1",
                params![id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .map_err(|_| "folder not found".to_string())?;
        let taken = sibling_names(
            &conn,
            &collection_id,
            parent_id.as_deref(),
            Some(id),
            None,
        )?;
        let name = inpost_core::tree::unique_sibling_name(&name, &taken);
        conn.execute(
            "UPDATE folders SET name = ?1 WHERE id = ?2",
            params![name, id],
        )
        .map_err(|e| e.to_string())?;
        Ok(Folder {
            id: id.to_string(),
            collection_id,
            parent_id,
            name,
            sort_order,
        })
    }

    pub fn delete_folder(&self, id: &str) -> Result<(), String> {
        let conn = self.0.lock().map_err(|e| e.to_string())?;
        let parent_id: Option<String> = conn
            .query_row(
                "SELECT parent_id FROM folders WHERE id = ?1",
                params![id],
                |r| r.get(0),
            )
            .map_err(|_| "folder not found".to_string())?;
        // Promote children to this folder's parent, then delete.
        conn.execute(
            "UPDATE folders SET parent_id = ?1 WHERE parent_id = ?2",
            params![parent_id, id],
        )
        .map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE requests SET folder_id = ?1 WHERE folder_id = ?2",
            params![parent_id, id],
        )
        .map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM folders WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn list_requests(&self, collection_id: String) -> Result<Vec<HttpRequest>, String> {
        let conn = self.0.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT id, collection_id, folder_id, name, method, url, headers_json, body, sort_order,
                        body_type, body_pairs_json, auth_type, auth_json, path_vars_json, description
                 FROM requests WHERE collection_id = ?1
                 ORDER BY sort_order, name",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![collection_id], |r| Self::map_request(r))
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    }

    fn map_request(r: &rusqlite::Row<'_>) -> rusqlite::Result<HttpRequest> {
        Ok(HttpRequest {
            id: r.get(0)?,
            collection_id: r.get(1)?,
            folder_id: r.get(2)?,
            name: r.get(3)?,
            method: r.get(4)?,
            url: r.get(5)?,
            headers_json: r.get(6)?,
            body: r.get(7)?,
            sort_order: r.get(8)?,
            body_type: r.get(9)?,
            body_pairs_json: r.get(10)?,
            auth_type: r.get(11)?,
            auth_json: r.get(12)?,
            path_vars_json: r.get(13)?,
            description: r.get::<_, Option<String>>(14)?.unwrap_or_default(),
        })
    }

    pub fn upsert_request(&self, mut req: HttpRequest) -> Result<HttpRequest, String> {
        let conn = self.0.lock().map_err(|e| e.to_string())?;
        let existing: Option<(Option<String>, i64)> = conn
            .query_row(
                "SELECT folder_id, sort_order FROM requests WHERE id = ?1",
                params![req.id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()
            .map_err(|e| e.to_string())?;

        if let Some((fid, so)) = existing {
            // Content saves / MCP updates must not wipe tree placement.
            req.folder_id = fid;
            req.sort_order = so;
        } else {
            if let Some(ref fid) = req.folder_id {
                let ok: bool = conn
                    .query_row(
                        "SELECT COUNT(*) > 0 FROM folders WHERE id = ?1 AND collection_id = ?2",
                        params![fid, req.collection_id],
                        |r| r.get(0),
                    )
                    .map_err(|e| e.to_string())?;
                if !ok {
                    return Err("folder not found".into());
                }
            }
            req.sort_order =
                next_sort_order(&conn, &req.collection_id, req.folder_id.as_deref())?;
        }

        let taken = sibling_names(
            &conn,
            &req.collection_id,
            req.folder_id.as_deref(),
            None,
            Some(&req.id),
        )?;
        req.name = inpost_core::tree::unique_sibling_name(&req.name, &taken);

        conn.execute(
            "INSERT INTO requests (id, collection_id, folder_id, name, method, url, headers_json, body, sort_order,
                                  body_type, body_pairs_json, auth_type, auth_json, path_vars_json, description)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
             ON CONFLICT(id) DO UPDATE SET
               collection_id=excluded.collection_id,
               name=excluded.name,
               method=excluded.method,
               url=excluded.url,
               headers_json=excluded.headers_json,
               body=excluded.body,
               body_type=excluded.body_type,
               body_pairs_json=excluded.body_pairs_json,
               auth_type=excluded.auth_type,
               auth_json=excluded.auth_json,
               path_vars_json=excluded.path_vars_json,
               description=excluded.description",
            params![
                req.id,
                req.collection_id,
                req.folder_id,
                req.name,
                req.method,
                req.url,
                req.headers_json,
                req.body,
                req.sort_order,
                req.body_type,
                req.body_pairs_json,
                req.auth_type,
                req.auth_json,
                req.path_vars_json,
                req.description,
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok(req)
    }

    pub fn workspace_for_collection(&self, collection_id: &str) -> Result<Option<String>, String> {
        let conn = self.0.lock().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT workspace_id FROM collections WHERE id = ?1",
            params![collection_id],
            |r| r.get::<_, Option<String>>(0),
        )
        .map_err(|e| e.to_string())
    }

    pub fn get_request(&self, id: &str) -> Result<HttpRequest, String> {
        let conn = self.0.lock().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT id, collection_id, folder_id, name, method, url, headers_json, body, sort_order,
                    body_type, body_pairs_json, auth_type, auth_json, path_vars_json, description
             FROM requests WHERE id = ?1",
            params![id],
            Self::map_request,
        )
        .map_err(|e| e.to_string())
    }

    pub fn delete_request(&self, id: &str) -> Result<(), String> {
        let conn = self.0.lock().map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM requests WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    /// Set parent + sort_order for each item in `ordered` (siblings under `parent_id`).
    pub fn reorder_siblings(
        &self,
        collection_id: String,
        parent_id: Option<String>,
        ordered: Vec<TreeOrderItem>,
    ) -> Result<(), String> {
        let conn = self.0.lock().map_err(|e| e.to_string())?;
        let parents = parent_map(&conn, &collection_id)?;

        if let Some(ref pid) = parent_id {
            if !parents.contains_key(pid) {
                return Err("parent folder not found".into());
            }
        }

        for (i, item) in ordered.iter().enumerate() {
            let sort_order = i as i64;
            match item.kind.as_str() {
                "folder" => {
                    if let Some(ref pid) = parent_id {
                        if inpost_core::tree::would_create_cycle(&item.id, pid, &parents) {
                            return Err("cannot move folder into its descendant".into());
                        }
                    }
                    let n = conn
                        .execute(
                            "UPDATE folders SET parent_id = ?1, sort_order = ?2
                             WHERE id = ?3 AND collection_id = ?4",
                            params![parent_id, sort_order, item.id, collection_id],
                        )
                        .map_err(|e| e.to_string())?;
                    if n == 0 {
                        return Err(format!("folder not found: {}", item.id));
                    }
                }
                "request" => {
                    let n = conn
                        .execute(
                            "UPDATE requests SET folder_id = ?1, sort_order = ?2
                             WHERE id = ?3 AND collection_id = ?4",
                            params![parent_id, sort_order, item.id, collection_id],
                        )
                        .map_err(|e| e.to_string())?;
                    if n == 0 {
                        return Err(format!("request not found: {}", item.id));
                    }
                }
                other => return Err(format!("unknown kind: {other}")),
            }
        }
        Ok(())
    }

    #[allow(dead_code)]
    pub fn get_environment(&self, id: &str) -> Result<Environment, String> {
        let conn = self.0.lock().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT id, name, is_global, is_active, vars_json FROM environments WHERE id = ?1",
            params![id],
            |r| {
                Ok(Environment {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    is_global: r.get::<_, i64>(2)? != 0,
                    is_active: r.get::<_, i64>(3)? != 0,
                    vars_json: r.get(4)?,
                })
            },
        )
        .map_err(|e| e.to_string())
    }

    pub fn list_environments(&self) -> Result<Vec<Environment>, String> {
        let conn = self.0.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT id, name, is_global, is_active, vars_json FROM environments ORDER BY is_global DESC, name",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| {
                Ok(Environment {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    is_global: r.get::<_, i64>(2)? != 0,
                    is_active: r.get::<_, i64>(3)? != 0,
                    vars_json: r.get(4)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    }

    pub fn set_active_environment(&self, id: String) -> Result<(), String> {
        let conn = self.0.lock().map_err(|e| e.to_string())?;
        conn.execute("UPDATE environments SET is_active = 0 WHERE is_global = 0", [])
            .map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE environments SET is_active = 1 WHERE id = ?1 AND is_global = 0",
            params![id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn upsert_environment(&self, env: Environment) -> Result<Environment, String> {
        let conn = self.0.lock().map_err(|e| e.to_string())?;
        if env.is_active && !env.is_global {
            conn.execute("UPDATE environments SET is_active = 0 WHERE is_global = 0", [])
                .map_err(|e| e.to_string())?;
        }
        conn.execute(
            "INSERT INTO environments (id, name, is_global, is_active, vars_json)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(id) DO UPDATE SET
               name=excluded.name,
               is_global=excluded.is_global,
               is_active=excluded.is_active,
               vars_json=excluded.vars_json",
            params![
                env.id,
                env.name,
                env.is_global as i64,
                env.is_active as i64,
                env.vars_json
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok(env)
    }

    pub fn delete_environment(&self, id: &str) -> Result<(), String> {
        let conn = self.0.lock().map_err(|e| e.to_string())?;
        let is_global: i64 = conn
            .query_row(
                "SELECT is_global FROM environments WHERE id = ?1",
                params![id],
                |r| r.get(0),
            )
            .map_err(|_| "environment not found".to_string())?;
        if is_global != 0 {
            return Err("cannot delete the global environment".into());
        }
        let was_active: i64 = conn
            .query_row(
                "SELECT is_active FROM environments WHERE id = ?1",
                params![id],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM environments WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        if was_active != 0 {
            // Activate another non-global env if any remain.
            let _ = conn.execute(
                "UPDATE environments SET is_active = 1
                 WHERE id = (
                   SELECT id FROM environments WHERE is_global = 0
                   ORDER BY name LIMIT 1
                 )",
                [],
            );
        }
        Ok(())
    }

    pub fn insert_history(&self, mut entry: HistoryEntry) -> Result<HistoryEntry, String> {
        let conn = self.0.lock().map_err(|e| e.to_string())?;
        if entry.id.is_empty() {
            entry.id = Uuid::new_v4().to_string();
        }
        // ponytail: cap stored bodies at 256 KiB; upgrade = blob/file offload
        const MAX: usize = 256 * 1024;
        if let Some(ref mut b) = entry.body {
            if b.len() > MAX {
                b.truncate(MAX);
                b.push_str("\n…[truncated]");
            }
        }
        if let Some(ref mut b) = entry.body_pretty {
            if b.len() > MAX {
                b.truncate(MAX);
                b.push_str("\n…[truncated]");
            }
        }
        if let Some(ref mut snap) = entry.request_json {
            if let Ok(mut v) = serde_json::from_str::<serde_json::Value>(snap) {
                if let Some(serde_json::Value::String(b)) = v.get_mut("body") {
                    if b.len() > MAX {
                        b.truncate(MAX);
                        b.push_str("\n…[truncated]");
                        *snap = v.to_string();
                    }
                }
            }
        }
        conn.execute(
            "INSERT INTO request_history
             (id, workspace_id, request_id, method, url, status, status_text,
              elapsed_ms, size_bytes, error, body, body_pretty, created_at, headers_json, request_json)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15)",
            params![
                entry.id,
                entry.workspace_id,
                entry.request_id,
                entry.method,
                entry.url,
                entry.status,
                entry.status_text,
                entry.elapsed_ms,
                entry.size_bytes,
                entry.error,
                entry.body,
                entry.body_pretty,
                entry.created_at,
                entry.headers_json,
                entry.request_json,
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok(entry)
    }

    fn map_history(r: &rusqlite::Row<'_>) -> rusqlite::Result<HistoryEntry> {
        Ok(HistoryEntry {
            id: r.get(0)?,
            workspace_id: r.get(1)?,
            request_id: r.get(2)?,
            method: r.get(3)?,
            url: r.get(4)?,
            status: r.get(5)?,
            status_text: r.get(6)?,
            elapsed_ms: r.get(7)?,
            size_bytes: r.get(8)?,
            error: r.get(9)?,
            body: r.get(10)?,
            body_pretty: r.get(11)?,
            created_at: r.get(12)?,
            headers_json: r.get(13)?,
            request_json: r.get(14)?,
        })
    }

    const HISTORY_COLS: &'static str = "id, workspace_id, request_id, method, url, status, status_text,
                        elapsed_ms, size_bytes, error, body, body_pretty, created_at, headers_json, request_json";

    pub fn get_history(&self, id: &str) -> Result<Option<HistoryEntry>, String> {
        let conn = self.0.lock().map_err(|e| e.to_string())?;
        let sql = format!(
            "SELECT {} FROM request_history WHERE id = ?1",
            Self::HISTORY_COLS.replace('\n', " ")
        );
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let mut rows = stmt
            .query_map(params![id], Self::map_history)
            .map_err(|e| e.to_string())?;
        rows.next().transpose().map_err(|e| e.to_string())
    }

    pub fn list_workspace_history(
        &self,
        workspace_id: String,
        limit: i64,
    ) -> Result<Vec<HistoryEntry>, String> {
        let conn = self.0.lock().map_err(|e| e.to_string())?;
        let lim = limit.clamp(1, 200);
        let sql = format!(
            "SELECT {} FROM request_history WHERE workspace_id = ?1 ORDER BY created_at DESC LIMIT ?2",
            Self::HISTORY_COLS.replace('\n', " ")
        );
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![workspace_id, lim], Self::map_history)
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    }

    pub fn list_request_history(
        &self,
        request_id: String,
        limit: i64,
    ) -> Result<Vec<HistoryEntry>, String> {
        let conn = self.0.lock().map_err(|e| e.to_string())?;
        let lim = limit.clamp(1, 100);
        let sql = format!(
            "SELECT {} FROM request_history WHERE request_id = ?1 ORDER BY created_at DESC LIMIT ?2",
            Self::HISTORY_COLS.replace('\n', " ")
        );
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![request_id, lim], Self::map_history)
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    }

    pub fn delete_history(&self, id: &str) -> Result<(), String> {
        let conn = self.0.lock().map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM request_history WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn clear_request_history(&self, request_id: &str) -> Result<(), String> {
        let conn = self.0.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "DELETE FROM request_history WHERE request_id = ?1",
            params![request_id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn clear_workspace_history(&self, workspace_id: &str) -> Result<(), String> {
        let conn = self.0.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "DELETE FROM request_history WHERE workspace_id = ?1",
            params![workspace_id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mem_db() -> Db {
        let conn = Connection::open_in_memory().expect("mem");
        migrate(&conn).expect("migrate");
        Db(Mutex::new(conn))
    }

    #[test]
    fn delete_workspace_cascades_and_keeps_one() {
        let db = mem_db();
        let ws1 = db.list_workspaces().unwrap()[0].id.clone();
        let ws2 = db.create_workspace("Scratch".into()).unwrap();
        let col = db
            .create_collection("C".into(), ws2.id.clone())
            .unwrap();
        let folder = db
            .create_folder(col.id.clone(), None, "F".into())
            .unwrap();
        db.upsert_request(HttpRequest {
            id: Uuid::new_v4().to_string(),
            collection_id: col.id.clone(),
            folder_id: Some(folder.id.clone()),
            name: "R".into(),
            description: String::new(),
            method: "GET".into(),
            url: "https://example.com".into(),
            headers_json: "[]".into(),
            body: String::new(),
            body_type: "none".into(),
            body_pairs_json: "[]".into(),
            auth_type: "none".into(),
            auth_json: "{}".into(),
            path_vars_json: "{}".into(),
            sort_order: 0,
        })
        .unwrap();
        db.insert_history(HistoryEntry {
            id: Uuid::new_v4().to_string(),
            workspace_id: ws2.id.clone(),
            request_id: None,
            method: "GET".into(),
            url: "https://example.com".into(),
            status: Some(200),
            status_text: Some("OK".into()),
            elapsed_ms: Some(1),
            size_bytes: Some(0),
            error: None,
            body: None,
            body_pretty: None,
            headers_json: None,
            request_json: None,
            created_at: 1,
        })
        .unwrap();

        db.delete_workspace(&ws2.id).unwrap();
        assert_eq!(db.list_workspaces().unwrap().len(), 1);
        assert!(db.list_collections(Some(ws2.id.clone())).unwrap().is_empty());
        assert!(db
            .list_workspace_history(ws2.id.clone(), 10)
            .unwrap()
            .is_empty());
        assert_eq!(
            db.delete_workspace(&ws1).unwrap_err(),
            "cannot delete the last workspace"
        );
    }

    fn hist(workspace_id: String, created_at: i64) -> HistoryEntry {
        HistoryEntry {
            id: Uuid::new_v4().to_string(),
            workspace_id,
            request_id: None,
            method: "GET".into(),
            url: "https://example.com".into(),
            status: Some(200),
            status_text: Some("OK".into()),
            elapsed_ms: Some(1),
            size_bytes: Some(0),
            error: None,
            body: None,
            body_pretty: None,
            headers_json: None,
            request_json: None,
            created_at,
        }
    }

    #[test]
    fn clear_workspace_history_only_that_workspace() {
        let db = mem_db();
        let ws1 = db.list_workspaces().unwrap()[0].id.clone();
        let ws2 = db.create_workspace("Other".into()).unwrap().id;
        db.insert_history(hist(ws1.clone(), 1)).unwrap();
        db.insert_history(hist(ws1.clone(), 2)).unwrap();
        db.insert_history(hist(ws2.clone(), 3)).unwrap();
        db.clear_workspace_history(&ws1).unwrap();
        assert!(db.list_workspace_history(ws1, 10).unwrap().is_empty());
        assert_eq!(db.list_workspace_history(ws2, 10).unwrap().len(), 1);
    }
}
