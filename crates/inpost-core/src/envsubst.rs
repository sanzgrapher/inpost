//! `{{var}}` substitution. Active env wins; global fills gaps.

use std::collections::HashMap;

use regex::Regex;

/// Resolve `{{key}}` tokens. Missing keys are left as-is.
pub fn substitute(input: &str, active: &HashMap<String, String>, global: &HashMap<String, String>) -> String {
    // ponytail: regex compile per call is fine at request volume; cache if hot path shows up
    let re = Regex::new(r"\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}").expect("static regex");
    re.replace_all(input, |caps: &regex::Captures| {
        let key = &caps[1];
        active
            .get(key)
            .or_else(|| global.get(key))
            .cloned()
            .unwrap_or_else(|| caps[0].to_string())
    })
    .into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn active_overrides_global() {
        let mut active = HashMap::new();
        active.insert("baseUrl".into(), "https://api.example".into());
        let mut global = HashMap::new();
        global.insert("baseUrl".into(), "https://global.example".into());
        global.insert("token".into(), "g-tok".into());

        let out = substitute("{{baseUrl}}/v1?t={{token}}", &active, &global);
        assert_eq!(out, "https://api.example/v1?t=g-tok");
    }

    #[test]
    fn missing_left_intact() {
        let empty = HashMap::new();
        assert_eq!(
            substitute("{{missing}}/x", &empty, &empty),
            "{{missing}}/x"
        );
    }
}
