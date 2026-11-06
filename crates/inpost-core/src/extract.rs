//! Response → environment extractors (declarative stand-in for post-response scripts).
//!
//! Postman / Insomnia / Requestly write env vars from post-response JS
//! (`pm.environment.set` / `insomnia.environment.set` / `rq.environment.set`).
//! Inpost stores the common case as JSONPath rules on the request:
//! `[{"key":"bookingId","value":"$.data.id","enabled":true}]`.

use serde_json::Value;

use crate::httputil::{kv_rows, KvRow};

/// Resolve a small JSONPath subset against `root`.
///
/// Supported: `$`, `$.a.b`, `$.items[0].id`, `$["a"]['b']`.
/// Not supported: filters, recursive descent (`..`), wildcards, scripts.
pub fn json_path_get(root: &Value, path: &str) -> Result<Value, String> {
    let path = path.trim();
    if path.is_empty() {
        return Err("empty JSONPath".into());
    }
    if path == "$" {
        return Ok(root.clone());
    }
    if !path.starts_with('$') {
        return Err(format!("JSONPath must start with '$' (got {path:?})"));
    }
    let mut cur = root;
    let mut i = 1; // after '$'
    let bytes = path.as_bytes();
    while i < bytes.len() {
        match bytes[i] {
            b'.' => {
                i += 1;
                if i >= bytes.len() {
                    return Err("trailing '.' in JSONPath".into());
                }
                if bytes[i] == b'.' {
                    return Err("recursive descent '..' is not supported".into());
                }
                let start = i;
                while i < bytes.len() && bytes[i] != b'.' && bytes[i] != b'[' {
                    i += 1;
                }
                let key = &path[start..i];
                if key.is_empty() {
                    return Err("empty property name in JSONPath".into());
                }
                cur = cur
                    .get(key)
                    .ok_or_else(|| format!("path not found: missing {key:?}"))?;
            }
            b'[' => {
                i += 1;
                if i >= bytes.len() {
                    return Err("unclosed '[' in JSONPath".into());
                }
                if bytes[i] == b'\'' || bytes[i] == b'"' {
                    let quote = bytes[i];
                    i += 1;
                    let start = i;
                    while i < bytes.len() && bytes[i] != quote {
                        i += 1;
                    }
                    if i >= bytes.len() {
                        return Err("unclosed quote in JSONPath bracket".into());
                    }
                    let key = &path[start..i];
                    i += 1; // closing quote
                    if i >= bytes.len() || bytes[i] != b']' {
                        return Err("expected ']' after bracket key".into());
                    }
                    i += 1;
                    cur = cur
                        .get(key)
                        .ok_or_else(|| format!("path not found: missing {key:?}"))?;
                } else {
                    let start = i;
                    while i < bytes.len() && bytes[i] != b']' {
                        i += 1;
                    }
                    if i >= bytes.len() {
                        return Err("unclosed '[' in JSONPath".into());
                    }
                    let idx_str = path[start..i].trim();
                    let idx: usize = idx_str
                        .parse()
                        .map_err(|_| format!("invalid array index {idx_str:?}"))?;
                    i += 1; // ']'
                    cur = cur
                        .get(idx)
                        .ok_or_else(|| format!("path not found: index {idx}"))?;
                }
            }
            other => {
                return Err(format!(
                    "unexpected {:?} in JSONPath at index {i}",
                    other as char
                ));
            }
        }
    }
    Ok(cur.clone())
}

/// Stringify a JSON value the way env vars need it (scalars plain, objects/arrays JSON).
pub fn value_to_env_string(v: &Value) -> String {
    match v {
        Value::Null => String::new(),
        Value::Bool(b) => b.to_string(),
        Value::Number(n) => n.to_string(),
        Value::String(s) => s.clone(),
        other => other.to_string(),
    }
}

/// Apply enabled extractor rows (`key` = env var, `value` = JSONPath) to `vars`.
/// Missing paths are skipped (not an error) so a 4xx body doesn't abort a chain.
/// Returns the list of `(var, value)` that were written.
pub fn apply_extractors(body: &str, extractors_json: &str, vars: &mut std::collections::HashMap<String, String>) -> Result<Vec<(String, String)>, String> {
    let rows = kv_rows(extractors_json)?;
    apply_extractor_rows(body, &rows, vars)
}

pub fn apply_extractor_rows(
    body: &str,
    rows: &[KvRow],
    vars: &mut std::collections::HashMap<String, String>,
) -> Result<Vec<(String, String)>, String> {
    let trimmed = body.trim();
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }
    let root: Value = match serde_json::from_str(trimmed) {
        Ok(v) => v,
        Err(_) => return Ok(Vec::new()), // non-JSON body: nothing to extract
    };
    let mut written = Vec::new();
    for row in rows {
        if !row.enabled || row.key.trim().is_empty() || row.value.trim().is_empty() {
            continue;
        }
        match json_path_get(&root, &row.value) {
            Ok(v) => {
                let s = value_to_env_string(&v);
                vars.insert(row.key.clone(), s.clone());
                written.push((row.key.clone(), s));
            }
            Err(_) => continue,
        }
    }
    Ok(written)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::collections::HashMap;

    #[test]
    fn path_nested_and_index() {
        let root = json!({"data": {"id": 1418, "items": [{"sku": "A"}]}});
        assert_eq!(json_path_get(&root, "$.data.id").unwrap(), json!(1418));
        assert_eq!(
            json_path_get(&root, "$.data.items[0].sku").unwrap(),
            json!("A")
        );
        assert_eq!(
            json_path_get(&root, "$[\"data\"]['id']").unwrap(),
            json!(1418)
        );
    }

    #[test]
    fn apply_writes_env_strings() {
        let mut vars = HashMap::new();
        let written = apply_extractors(
            r#"{"data":{"id":1418,"ok":true}}"#,
            r#"[{"key":"bookingId","value":"$.data.id"},{"key":"ok","value":"$.data.ok"},{"key":"miss","value":"$.nope","enabled":true}]"#,
            &mut vars,
        )
        .unwrap();
        assert_eq!(vars.get("bookingId").map(String::as_str), Some("1418"));
        assert_eq!(vars.get("ok").map(String::as_str), Some("true"));
        assert!(!vars.contains_key("miss"));
        assert_eq!(written.len(), 2);
    }

    #[test]
    fn disabled_and_non_json_skipped() {
        let mut vars = HashMap::new();
        apply_extractors(
            "not json",
            r#"[{"key":"x","value":"$.a"}]"#,
            &mut vars,
        )
        .unwrap();
        assert!(vars.is_empty());
        apply_extractors(
            r#"{"a":1}"#,
            r#"[{"key":"x","value":"$.a","enabled":false}]"#,
            &mut vars,
        )
        .unwrap();
        assert!(vars.is_empty());
    }
}
