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

    // Substitute env in auth-derived header values too.
    for (_, v) in headers.iter_mut() {
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
    let (wire_body, ct_override) = httputil::resolve_body(&input.body_type, &body_sub, &pairs);
    if let Some(ref ct) = ct_override {
        httputil::set_content_type(&mut headers, Some(ct));
    }

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
        if k.trim().is_empty() {
            continue;
        }
        builder = builder.header(k.as_str(), v.as_str());
    }

    if let Some(body) = wire_body {
        if !matches!(method.as_str(), "GET" | "HEAD") {
            builder = builder.body(body);
        }
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
    })
}
