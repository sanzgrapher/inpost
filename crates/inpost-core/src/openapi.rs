//! OpenAPI 3.x import/export — JSON or YAML. Minimal path→request mapping.

use serde_json::{json, Map, Value};

#[derive(Debug, Clone)]
pub struct ImportedRequest {
    pub name: String,
    pub method: String,
    pub url: String,
    pub headers_json: String,
    pub body: String,
}

#[derive(Debug, Clone)]
pub struct ImportResult {
    pub collection_name: String,
    pub base_url: Option<String>,
    pub requests: Vec<ImportedRequest>,
}

#[derive(Debug, Clone)]
pub struct ExportRequest {
    pub name: String,
    pub method: String,
    pub url: String,
    pub headers_json: String,
    pub body: String,
}

const METHODS: &[&str] = &["get", "post", "put", "patch", "delete", "head", "options"];

fn parse_spec(text: &str) -> Result<Value, String> {
    let trimmed = text.trim_start_matches('\u{feff}').trim();
    if trimmed.is_empty() {
        return Err("empty OpenAPI document".into());
    }
    if let Ok(v) = serde_json::from_str::<Value>(trimmed) {
        return Ok(v);
    }
    serde_yaml::from_str::<Value>(trimmed).map_err(|e| format!("invalid OpenAPI JSON/YAML: {e}"))
}

fn server_url(spec: &Value) -> Option<String> {
    spec.get("servers")
        .and_then(|s| s.as_array())
        .and_then(|a| a.first())
        .and_then(|s| s.get("url"))
        .and_then(|u| u.as_str())
        .map(|s| s.trim_end_matches('/').to_string())
}

fn path_to_url(path: &str) -> String {
    // OpenAPI `{id}` → keep as path segment; agents/envs can substitute later
    format!("{{{{baseUrl}}}}{path}")
}

fn op_name(method: &str, path: &str, op: &Value) -> String {
    if let Some(id) = op.get("operationId").and_then(|v| v.as_str()) {
        if !id.is_empty() {
            return id.to_string();
        }
    }
    if let Some(sum) = op.get("summary").and_then(|v| v.as_str()) {
        if !sum.is_empty() {
            return sum.to_string();
        }
    }
    format!("{} {}", method.to_uppercase(), path)
}

fn headers_from_op(op: &Value) -> String {
    let mut headers: Vec<(String, String)> = Vec::new();
    if let Some(params) = op.get("parameters").and_then(|p| p.as_array()) {
        for p in params {
            if p.get("in").and_then(|v| v.as_str()) != Some("header") {
                continue;
            }
            let Some(name) = p.get("name").and_then(|v| v.as_str()) else {
                continue;
            };
            let val = p
                .pointer("/schema/default")
                .or_else(|| p.get("example"))
                .and_then(|v| match v {
                    Value::String(s) => Some(s.clone()),
                    other => Some(other.to_string()),
                })
                .unwrap_or_else(|| format!("{{{{{name}}}}}"));
            headers.push((name.to_string(), val));
        }
    }
    // Accept JSON by default when a JSON body is declared
    if op.pointer("/requestBody/content/application~1json").is_some()
        && !headers.iter().any(|(k, _)| k.eq_ignore_ascii_case("content-type"))
    {
        headers.push(("Content-Type".into(), "application/json".into()));
    }
    serde_json::to_string(&headers).unwrap_or_else(|_| "[]".into())
}

fn body_from_op(op: &Value) -> String {
    let json_body = op.pointer("/requestBody/content/application~1json");
    let Some(media) = json_body else {
        return String::new();
    };
    if let Some(ex) = media.get("example") {
        return serde_json::to_string_pretty(ex).unwrap_or_default();
    }
    if let Some(ex) = media.pointer("/examples")
        .and_then(|e| e.as_object())
        .and_then(|m| m.values().next())
        .and_then(|e| e.get("value"))
    {
        return serde_json::to_string_pretty(ex).unwrap_or_default();
    }
    if let Some(schema) = media.get("schema") {
        return serde_json::to_string_pretty(schema).unwrap_or_default();
    }
    String::new()
}

/// Import OpenAPI 3.x (or Swagger-ish paths) into a flat request list.
pub fn import_openapi(text: &str) -> Result<ImportResult, String> {
    let spec = parse_spec(text)?;
    let collection_name = spec
        .pointer("/info/title")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .unwrap_or("Imported API")
        .to_string();
    let base_url = server_url(&spec);
    let paths = spec
        .get("paths")
        .and_then(|p| p.as_object())
        .ok_or_else(|| "OpenAPI document has no paths".to_string())?;

    let mut requests = Vec::new();
    for (path, item) in paths {
        let Some(item_obj) = item.as_object() else {
            continue;
        };
        for method in METHODS {
            let Some(op) = item_obj.get(*method) else {
                continue;
            };
            if !op.is_object() {
                continue;
            }
            requests.push(ImportedRequest {
                name: op_name(method, path, op),
                method: method.to_uppercase(),
                url: path_to_url(path),
                headers_json: headers_from_op(op),
                body: body_from_op(op),
            });
        }
    }
    if requests.is_empty() {
        return Err("no HTTP operations found in paths".into());
    }
    Ok(ImportResult {
        collection_name,
        base_url,
        requests,
    })
}

/// Export requests as OpenAPI 3.0.3 JSON string.
pub fn export_openapi(collection_name: &str, requests: &[ExportRequest]) -> Result<String, String> {
    let mut paths: Map<String, Value> = Map::new();

    for req in requests {
        let (base, path) = split_url_path(&req.url);
        let _ = base; // servers use {{baseUrl}}
        let method = req.method.to_lowercase();
        if !METHODS.contains(&method.as_str()) {
            continue;
        }

        let path_item = paths.entry(path.clone()).or_insert_with(|| json!({}));
        let obj = path_item
            .as_object_mut()
            .ok_or_else(|| "internal path map error".to_string())?;

        let mut op = Map::new();
        op.insert("operationId".into(), json!(slug(&req.name)));
        op.insert("summary".into(), json!(req.name));

        if let Ok(headers) = serde_json::from_str::<Vec<(String, String)>>(&req.headers_json) {
            let params: Vec<Value> = headers
                .into_iter()
                .filter(|(k, _)| !k.is_empty())
                .map(|(k, v)| {
                    json!({
                        "name": k,
                        "in": "header",
                        "schema": { "type": "string", "default": v }
                    })
                })
                .collect();
            if !params.is_empty() {
                op.insert("parameters".into(), Value::Array(params));
            }
        }

        if !req.body.trim().is_empty() {
            let example = serde_json::from_str::<Value>(&req.body).unwrap_or(json!(req.body));
            op.insert(
                "requestBody".into(),
                json!({
                    "content": {
                        "application/json": {
                            "example": example
                        }
                    }
                }),
            );
        }

        op.insert(
            "responses".into(),
            json!({ "200": { "description": "OK" } }),
        );
        obj.insert(method, Value::Object(op));
    }

    let doc = json!({
        "openapi": "3.0.3",
        "info": {
            "title": collection_name,
            "version": "1.0.0"
        },
        "servers": [{ "url": "{{baseUrl}}" }],
        "paths": paths
    });
    serde_json::to_string_pretty(&doc).map_err(|e| e.to_string())
}

fn split_url_path(url: &str) -> (String, String) {
    let u = url.trim();
    if let Some(rest) = u.strip_prefix("{{baseUrl}}") {
        return ("{{baseUrl}}".into(), normalize_path(rest));
    }
    if let Some(idx) = u.find("://") {
        let after = &u[idx + 3..];
        if let Some(slash) = after.find('/') {
            return (u[..idx + 3 + slash].to_string(), normalize_path(&after[slash..]));
        }
        return (u.to_string(), "/".into());
    }
    (String::new(), normalize_path(u))
}

fn normalize_path(p: &str) -> String {
    if p.is_empty() {
        return "/".into();
    }
    if p.starts_with('/') {
        p.to_string()
    } else {
        format!("/{p}")
    }
}

fn slug(s: &str) -> String {
    let mut out = String::new();
    for c in s.chars() {
        if c.is_ascii_alphanumeric() {
            out.push(c.to_ascii_lowercase());
        } else if !out.ends_with('_') {
            out.push('_');
        }
    }
    out.trim_matches('_').to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    const SPEC: &str = r#"{
      "openapi": "3.0.3",
      "info": { "title": "Pet Store" },
      "servers": [{ "url": "https://api.example.com" }],
      "paths": {
        "/pets": {
          "get": { "operationId": "listPets", "summary": "List pets" },
          "post": {
            "operationId": "createPet",
            "requestBody": {
              "content": {
                "application/json": {
                  "example": { "name": "fido" }
                }
              }
            }
          }
        },
        "/pets/{id}": {
          "get": { "operationId": "getPet" }
        }
      }
    }"#;

    #[test]
    fn import_round_trip_shape() {
        let imported = import_openapi(SPEC).expect("import");
        assert_eq!(imported.collection_name, "Pet Store");
        assert_eq!(
            imported.base_url.as_deref(),
            Some("https://api.example.com")
        );
        assert_eq!(imported.requests.len(), 3);
        assert!(imported.requests.iter().any(|r| r.method == "GET" && r.url.contains("/pets")));
        assert!(imported
            .requests
            .iter()
            .any(|r| r.method == "POST" && r.body.contains("fido")));

        let export_reqs: Vec<ExportRequest> = imported
            .requests
            .iter()
            .map(|r| ExportRequest {
                name: r.name.clone(),
                method: r.method.clone(),
                url: r.url.clone(),
                headers_json: r.headers_json.clone(),
                body: r.body.clone(),
            })
            .collect();
        let out = export_openapi("Pet Store", &export_reqs).expect("export");
        let v: Value = serde_json::from_str(&out).expect("json");
        assert_eq!(v["openapi"], "3.0.3");
        assert!(v["paths"]["/pets"]["get"].is_object());
        assert!(v["paths"]["/pets"]["post"].is_object());
    }

    #[test]
    fn import_yaml() {
        let yaml = r#"
openapi: 3.0.3
info:
  title: YAML API
paths:
  /health:
    get:
      operationId: health
"#;
        let imported = import_openapi(yaml).expect("yaml");
        assert_eq!(imported.collection_name, "YAML API");
        assert_eq!(imported.requests.len(), 1);
    }
}
