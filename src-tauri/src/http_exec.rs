//! HTTP execution. Blocking reqwest — fine for Phase 0 single-flight sends.

use std::collections::HashMap;
use std::time::Instant;

use serde::{Deserialize, Serialize};

use inpost_core::envsubst;
use inpost_core::httputil;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendRequestInput {
    pub method: String,
    pub url: String,
    pub headers: Vec<(String, String)>,
    #[serde(default)]
    pub body: Option<String>,
    #[serde(default = "default_body_type")]
    pub body_type: String,
    #[serde(default)]
    pub body_pairs: Vec<(String, String)>,
    #[serde(default = "default_auth_none")]
    pub auth_type: String,
    #[serde(default = "default_auth_json")]
    pub auth_json: String,
    #[serde(default)]
    pub path_vars: Vec<(String, String)>,
    pub active_vars: HashMap<String, String>,
    pub global_vars: HashMap<String, String>,
}

fn default_body_type() -> String {
    "json".into()
}
fn default_auth_none() -> String {
    "none".into()
}
fn default_auth_json() -> String {
    "{}".into()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendRequestResult {
    pub status: u16,
    pub status_text: String,
    pub headers: Vec<(String, String)>,
    pub body: String,
    pub body_pretty: Option<String>,
    pub elapsed_ms: u64,
    pub resolved_url: String,
    #[serde(default)]
    pub sent_headers: Vec<(String, String)>,
}

pub fn send(input: SendRequestInput) -> Result<SendRequestResult, String> {
    let method = input.method.to_uppercase();

    let mut headers = input.headers.clone();
    let path_vars: Vec<(String, String)> = input
        .path_vars
        .iter()
        .map(|(k, v)| {
            (
                k.clone(),
                envsubst::substitute(v, &input.active_vars, &input.global_vars),
            )
        })
        .collect();
    let url_with_path = httputil::apply_path_vars(&input.url, &path_vars);
    let auth_json = envsubst::substitute(&input.auth_json, &input.active_vars, &input.global_vars);
    let url_with_auth =
        httputil::apply_auth(&input.auth_type, &auth_json, &url_with_path, &mut headers);

    // Substitute env in auth-derived headers too.
    for (k, v) in headers.iter_mut() {
        *k = envsubst::substitute(k, &input.active_vars, &input.global_vars);
        *v = envsubst::substitute(v, &input.active_vars, &input.global_vars);
    }

    let pairs: Vec<(String, String)> = input
        .body_pairs
        .iter()
        .map(|(k, v)| {
            (
                envsubst::substitute(k, &input.active_vars, &input.global_vars),
                envsubst::substitute(v, &input.active_vars, &input.global_vars),
            )
        })
        .collect();
    let raw_body = input.body.as_deref().unwrap_or("");
    let body_sub = envsubst::substitute(raw_body, &input.active_vars, &input.global_vars);
    // HEAD can't carry a body; GET can (Postman/Insomnia send it too).
    let (wire_body, ct_override) = if method == "HEAD" {
        (None, None)
    } else {
        httputil::resolve_body(&input.body_type, &body_sub, &pairs)
    };
    let has = |h: &[(String, String)], name: &str| h.iter().any(|(k, _)| k.eq_ignore_ascii_case(name));
    let default_ct = match input.body_type.as_str() {
        "json" => Some("application/json"),
        "text" => Some("text/plain"),
        _ => None,
    };
    if let Some(ref ct) = ct_override {
        httputil::set_content_type(&mut headers, Some(ct));
    } else if let (Some(ct), true) = (default_ct, wire_body.is_some()) {
        if !has(&headers, "content-type") {
            headers.push(("Content-Type".into(), ct.into()));
        }
    }
    // reqwest adds the same default; setting it here keeps `sent_headers` honest.
    if !has(&headers, "accept") {
        headers.push(("Accept".into(), "*/*".into()));
    }
    // Some APIs (GitHub) reject requests without one.
    if !has(&headers, "user-agent") {
        headers.push(("User-Agent".into(), format!("Inpost/{}", env!("CARGO_PKG_VERSION"))));
    }
    headers.retain(|(k, _)| !k.trim().is_empty());

    let url = envsubst::substitute(&url_with_auth, &input.active_vars, &input.global_vars);

    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())?;

    let mut builder = match method.as_str() {
        "GET" => client.get(&url),
        "POST" => client.post(&url),
        "PUT" => client.put(&url),
        "PATCH" => client.patch(&url),
        "DELETE" => client.delete(&url),
        "HEAD" => client.head(&url),
        "OPTIONS" => client.request(reqwest::Method::OPTIONS, &url),
        other => return Err(format!("unsupported method: {other}")),
    };

    for (k, v) in &headers {
        let name = reqwest::header::HeaderName::from_bytes(k.trim().as_bytes()).map_err(|_| {
            format!("Invalid header name \"{k}\": use letters, digits and !#$%&'*+-.^_`|~ only (no spaces or braces)")
        })?;
        let value = reqwest::header::HeaderValue::from_str(v).map_err(|_| {
            format!("Invalid value for header \"{k}\": line breaks and control characters aren't allowed")
        })?;
        builder = builder.header(name, value);
    }

    if let Some(body) = wire_body {
        builder = builder.body(body);
    }

    let started = Instant::now();
    let response = builder.send().map_err(|e| e.to_string())?;
    let elapsed_ms = started.elapsed().as_millis() as u64;

    let status = response.status().as_u16();
    let status_text = response
        .status()
        .canonical_reason()
        .unwrap_or("")
        .to_string();
    let sent_headers = headers;
    let headers: Vec<(String, String)> = response
        .headers()
        .iter()
        .map(|(k, v)| {
            (
                k.to_string(),
                v.to_str().unwrap_or("").to_string(),
            )
        })
        .collect();
    let body = response.text().map_err(|e| e.to_string())?;
    let body_pretty = serde_json::from_str::<serde_json::Value>(&body)
        .ok()
        .and_then(|v| serde_json::to_string_pretty(&v).ok());

    Ok(SendRequestResult {
        status,
        status_text,
        headers,
        body,
        body_pretty,
        elapsed_ms,
        resolved_url: url,
        sent_headers,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn err_for(headers: &[(&str, &str)]) -> String {
        let mut vars = HashMap::new();
        vars.insert("hdr".to_string(), "X-From-Var".to_string());
        send(SendRequestInput {
            method: "GET".into(),
            url: "http://127.0.0.1:9/".into(),
            headers: headers.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect(),
            body: None,
            body_type: "none".into(),
            body_pairs: vec![],
            auth_type: "none".into(),
            auth_json: "{}".into(),
            path_vars: vec![],
            active_vars: vars,
            global_vars: HashMap::new(),
        })
        .unwrap_err()
    }

    #[test]
    fn bad_headers_name_the_culprit() {
        assert!(err_for(&[("X Bad", "v")]).contains("Invalid header name \"X Bad\""));
        assert!(err_for(&[("{{nope}}", "v")]).contains("Invalid header name \"{{nope}}\""));
        assert!(err_for(&[("X-Inject", "a\r\nX-Evil: 1")]).contains("Invalid value for header \"X-Inject\""));
        // Valid after substitution: fails only on the closed port, not on the header.
        assert!(!err_for(&[("{{hdr}}", "v")]).contains("Invalid header"));
    }
}
