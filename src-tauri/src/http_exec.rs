//! HTTP execution. Blocking reqwest — fine for Phase 0 single-flight sends.

use std::collections::HashMap;
use std::time::Instant;

use serde::{Deserialize, Serialize};

use inpost_core::envsubst;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendRequestInput {
    pub method: String,
    pub url: String,
    pub headers: Vec<(String, String)>,
    pub body: Option<String>,
    pub active_vars: HashMap<String, String>,
    pub global_vars: HashMap<String, String>,
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
    let url = envsubst::substitute(&input.url, &input.active_vars, &input.global_vars);
    let method = input.method.to_uppercase();

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

    for (k, v) in &input.headers {
        if k.trim().is_empty() {
            continue;
        }
        let hv = envsubst::substitute(v, &input.active_vars, &input.global_vars);
        builder = builder.header(k.as_str(), hv);
    }

    if let Some(body) = &input.body {
        if !matches!(method.as_str(), "GET" | "HEAD") {
            let body = envsubst::substitute(body, &input.active_vars, &input.global_vars);
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
