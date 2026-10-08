//! Body encode + auth apply — shared by UI send path and MCP.

use serde_json::Value;

/// Percent-encode for `application/x-www-form-urlencoded` (space → `+`).
fn form_encode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'*' => {
                out.push(b as char);
            }
            b' ' => out.push('+'),
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

pub fn encode_urlencoded(pairs: &[(String, String)]) -> String {
    pairs
        .iter()
        .filter(|(k, _)| !k.is_empty())
        .map(|(k, v)| format!("{}={}", form_encode(k), form_encode(v)))
        .collect::<Vec<_>>()
        .join("&")
}

/// Accepts `[[k,v],…]`, `[{key,value,type?,enabled?},…]`, and a flat `{"k":"v",…}` map.
pub fn parse_kv_pairs(json: &str) -> Vec<(String, String)> {
    let Ok(val) = serde_json::from_str::<Value>(json) else {
        return Vec::new();
    };
    if let Some(map) = val.as_object() {
        return map
            .iter()
            .filter(|(k, _)| !k.is_empty())
            .map(|(k, v)| (k.clone(), v.as_str().map_or_else(|| v.to_string(), str::to_string)))
            .collect();
    }
    let Some(arr) = val.as_array() else {
        return Vec::new();
    };
    arr.iter()
        .filter_map(|item| {
            if let Some(a) = item.as_array() {
                let k = a.first()?.as_str()?.to_string();
                if k.is_empty() {
                    return None;
                }
                let v = a.get(1).and_then(|x| x.as_str()).unwrap_or("").to_string();
                return Some((k, v));
            }
            if let Some(o) = item.as_object() {
                if o.get("enabled").and_then(|x| x.as_bool()) == Some(false) {
                    return None;
                }
                let k = o.get("key")?.as_str()?.to_string();
                if k.is_empty() {
                    return None;
                }
                let v = o
                    .get("value")
                    .and_then(|x| x.as_str())
                    .unwrap_or("")
                    .to_string();
                return Some((k, v));
            }
            None
        })
        .collect()
}

/// Returns `(body, content_type)` including boundary.
pub fn encode_multipart(pairs: &[(String, String)]) -> (String, String) {
    let boundary = format!("----InpostFormBoundary{}", simple_boundary());
    let mut body = String::new();
    for (k, v) in pairs.iter().filter(|(k, _)| !k.is_empty()) {
        body.push_str("--");
        body.push_str(&boundary);
        body.push_str("\r\nContent-Disposition: form-data; name=\"");
        body.push_str(&escape_multipart_name(k));
        body.push_str("\"\r\n\r\n");
        body.push_str(v);
        body.push_str("\r\n");
    }
    body.push_str("--");
    body.push_str(&boundary);
    body.push_str("--\r\n");
    let ct = format!("multipart/form-data; boundary={boundary}");
    (body, ct)
}

fn escape_multipart_name(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

fn simple_boundary() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("{nanos:x}")
}

/// Resolve body for the wire. Returns `(body_bytes_or_none, optional Content-Type override)`.
pub fn resolve_body(
    body_type: &str,
    body: &str,
    pairs: &[(String, String)],
) -> (Option<String>, Option<String>) {
    match body_type {
        "none" | "" => (None, None),
        "urlencoded" => (
            Some(encode_urlencoded(pairs)),
            Some("application/x-www-form-urlencoded".into()),
        ),
        "multipart" => {
            let (b, ct) = encode_multipart(pairs);
            (Some(b), Some(ct))
        }
        "text" | "json" => {
            if body.is_empty() {
                (None, None)
            } else {
                (Some(body.to_string()), None)
            }
        }
        _ => {
            if body.is_empty() {
                (None, None)
            } else {
                (Some(body.to_string()), None)
            }
        }
    }
}

/// Apply auth into headers / URL. Mutates `headers` and returns possibly rewritten URL.
pub fn apply_auth(
    auth_type: &str,
    auth_json: &str,
    url: &str,
    headers: &mut Vec<(String, String)>,
) -> String {
    let mut url = url.to_string();
    let auth: Value = serde_json::from_str(auth_json).unwrap_or(Value::Null);
    match auth_type {
        "bearer" => {
            if let Some(token) = auth.get("token").and_then(|v| v.as_str()) {
                if !token.is_empty() {
                    upsert_header(headers, "Authorization", &format!("Bearer {token}"));
                }
            }
        }
        "basic" => {
            let user = auth.get("username").and_then(|v| v.as_str()).unwrap_or("");
            let pass = auth.get("password").and_then(|v| v.as_str()).unwrap_or("");
            if !user.is_empty() || !pass.is_empty() {
                let raw = format!("{user}:{pass}");
                let b64 = base64_encode(raw.as_bytes());
                upsert_header(headers, "Authorization", &format!("Basic {b64}"));
            }
        }
        "apikey" => {
            let key = auth.get("key").and_then(|v| v.as_str()).unwrap_or("");
            let value = auth.get("value").and_then(|v| v.as_str()).unwrap_or("");
            let loc = auth
                .get("in")
                .and_then(|v| v.as_str())
                .unwrap_or("header");
            if key.is_empty() {
                return url;
            }
            if loc == "query" {
                url = append_query(&url, key, value);
            } else {
                upsert_header(headers, key, value);
            }
        }
        _ => {}
    }
    url
}

fn upsert_header(headers: &mut Vec<(String, String)>, key: &str, value: &str) {
    if let Some((_, v)) = headers
        .iter_mut()
        .find(|(k, _)| k.eq_ignore_ascii_case(key))
    {
        *v = value.to_string();
    } else {
        headers.push((key.to_string(), value.to_string()));
    }
}

/// Replace Content-Type (case-insensitive) or insert if missing when `ct` is Some.
/// When `ct` is None and `strip_managed` is true, remove known managed Content-Types.
pub fn set_content_type(headers: &mut Vec<(String, String)>, ct: Option<&str>) {
    headers.retain(|(k, _)| !k.eq_ignore_ascii_case("content-type"));
    if let Some(ct) = ct {
        headers.push(("Content-Type".into(), ct.to_string()));
    }
}

fn append_query(url: &str, key: &str, value: &str) -> String {
    let sep = if url.contains('?') { '&' } else { '?' };
    format!("{url}{sep}{}={}", form_encode(key), form_encode(value))
}

/// Substitute `:name` and `{name}` (not `{{name}}`) path placeholders.
pub fn apply_path_vars(url: &str, vars: &[(String, String)]) -> String {
    let mut out = url.to_string();
    for (k, v) in vars.iter().filter(|(k, _)| !k.is_empty()) {
        out = replace_single_braces(&out, k, v);
        out = out.replace(&format!(":{k}"), v);
    }
    out
}

fn replace_single_braces(url: &str, name: &str, value: &str) -> String {
    let needle = format!("{{{name}}}");
    let mut out = String::with_capacity(url.len());
    let bytes = url.as_bytes();
    let n = needle.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i..].starts_with(n) {
            let before_ok = i == 0 || bytes[i - 1] != b'{';
            let after = i + n.len();
            let after_ok = after >= bytes.len() || bytes[after] != b'}';
            if before_ok && after_ok {
                out.push_str(value);
                i = after;
                continue;
            }
        }
        out.push(bytes[i] as char);
        i += 1;
    }
    out
}

/// Detect path placeholder names in a URL template (`:id`, `{id}`; not `{{var}}`).
pub fn path_var_names(url: &str) -> Vec<String> {
    let mut names = Vec::new();
    let bytes = url.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'{' {
            let doubled = i + 1 < bytes.len() && bytes[i + 1] == b'{';
            if !doubled {
                if let Some(end) = bytes[i + 1..].iter().position(|&b| b == b'}') {
                    let name = &url[i + 1..i + 1 + end];
                    if is_ident(name) && !names.iter().any(|n| n == name) {
                        names.push(name.to_string());
                    }
                    i = i + 1 + end + 1;
                    continue;
                }
            } else {
                // skip `{{...}}`
                if let Some(end) = url[i + 2..].find("}}") {
                    i = i + 2 + end + 2;
                    continue;
                }
            }
        }
        if bytes[i] == b':' {
            let start = i + 1;
            let mut end = start;
            while end < bytes.len() && is_ident_byte(bytes[end]) {
                end += 1;
            }
            if end > start {
                let name = &url[start..end];
                if !names.iter().any(|n| n == name) {
                    names.push(name.to_string());
                }
                i = end;
                continue;
            }
        }
        i += 1;
    }
    names
}

fn is_ident(s: &str) -> bool {
    let mut chars = s.chars();
    match chars.next() {
        Some(c) if c.is_ascii_alphabetic() || c == '_' => {
            chars.all(|c| c.is_ascii_alphanumeric() || c == '_')
        }
        _ => false,
    }
}

fn is_ident_byte(b: u8) -> bool {
    b.is_ascii_alphanumeric() || b == b'_'
}

/// Minimal base64 (no pad helper crates).
fn base64_encode(input: &[u8]) -> String {
    const T: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::new();
    let mut i = 0;
    while i + 3 <= input.len() {
        let n = ((input[i] as u32) << 16) | ((input[i + 1] as u32) << 8) | (input[i + 2] as u32);
        out.push(T[((n >> 18) & 63) as usize] as char);
        out.push(T[((n >> 12) & 63) as usize] as char);
        out.push(T[((n >> 6) & 63) as usize] as char);
        out.push(T[(n & 63) as usize] as char);
        i += 3;
    }
    let rem = input.len() - i;
    if rem == 1 {
        let n = (input[i] as u32) << 16;
        out.push(T[((n >> 18) & 63) as usize] as char);
        out.push(T[((n >> 12) & 63) as usize] as char);
        out.push('=');
        out.push('=');
    } else if rem == 2 {
        let n = ((input[i] as u32) << 16) | ((input[i + 1] as u32) << 8);
        out.push(T[((n >> 18) & 63) as usize] as char);
        out.push(T[((n >> 12) & 63) as usize] as char);
        out.push(T[((n >> 6) & 63) as usize] as char);
        out.push('=');
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn urlencoded_basic() {
        let s = encode_urlencoded(&[("a".into(), "1 2".into()), ("b".into(), "x&y".into())]);
        assert_eq!(s, "a=1+2&b=x%26y");
    }

    #[test]
    fn multipart_contains_parts() {
        let (body, ct) = encode_multipart(&[("name".into(), "Ada".into())]);
        assert!(ct.starts_with("multipart/form-data; boundary="));
        assert!(body.contains("name=\"name\""));
        assert!(body.contains("Ada"));
        assert!(body.ends_with("--\r\n") || body.contains("--\r\n"));
    }

    #[test]
    fn bearer_auth() {
        let mut h = vec![];
        let url = apply_auth("bearer", r#"{"token":"abc"}"#, "https://x.test", &mut h);
        assert_eq!(url, "https://x.test");
        assert_eq!(h[0], ("Authorization".into(), "Bearer abc".into()));
    }

    #[test]
    fn basic_auth() {
        let mut h = vec![];
        apply_auth(
            "basic",
            r#"{"username":"u","password":"p"}"#,
            "https://x.test",
            &mut h,
        );
        assert_eq!(h[0].0, "Authorization");
        assert!(h[0].1.starts_with("Basic "));
        // "u:p" → dTpw
        assert_eq!(h[0].1, "Basic dTpw");
    }

    #[test]
    fn apikey_query() {
        let mut h = vec![];
        let url = apply_auth(
            "apikey",
            r#"{"key":"api_key","value":"sek","in":"query"}"#,
            "https://x.test/v1",
            &mut h,
        );
        assert!(url.contains("api_key=sek"));
        assert!(h.is_empty());
    }

    #[test]
    fn path_names_skip_env() {
        let names = path_var_names("{{baseUrl}}/users/{id}/:slug");
        assert_eq!(names, vec!["id", "slug"]);
    }

    #[test]
    fn path_apply_preserves_env() {
        let out = apply_path_vars(
            "{{baseUrl}}/users/{id}",
            &[("id".into(), "42".into())],
        );
        assert_eq!(out, "{{baseUrl}}/users/42");
    }

    #[test]
    fn parse_kv_pairs_tuple_and_object() {
        let a = parse_kv_pairs(r#"[["name","Ada"],["role","dev"]]"#);
        assert_eq!(a, vec![("name".into(), "Ada".into()), ("role".into(), "dev".into())]);
        let b = parse_kv_pairs(
            r#"[{"key":"avatar","value":"pic.png","type":"file"},{"key":"name","value":"Ada"}]"#,
        );
        assert_eq!(
            b,
            vec![
                ("avatar".into(), "pic.png".into()),
                ("name".into(), "Ada".into())
            ]
        );
        let c = parse_kv_pairs(r#"{"Accept":"application/json","X-Count":3}"#);
        assert_eq!(
            c,
            vec![
                ("Accept".into(), "application/json".into()),
                ("X-Count".into(), "3".into())
            ]
        );
        let d = parse_kv_pairs(r#"[{"key":"a","value":"1","enabled":false},{"key":"b","value":"2"}]"#);
        assert_eq!(d, vec![("b".into(), "2".into())]);
    }

    #[test]
    fn resolve_none() {
        let (b, ct) = resolve_body("none", "{}", &[]);
        assert!(b.is_none());
        assert!(ct.is_none());
    }
}
