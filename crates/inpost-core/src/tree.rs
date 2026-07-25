//! Collection tree helpers — unique sibling names + folder cycle checks.

use std::collections::HashMap;

/// Return `desired` or `desired (2)`, `desired (3)`, … until unused among `taken`.
pub fn unique_sibling_name(desired: &str, taken: &[impl AsRef<str>]) -> String {
    let desired = desired.trim();
    let base = if desired.is_empty() { "Untitled" } else { desired };
    if !taken.iter().any(|t| t.as_ref() == base) {
        return base.to_string();
    }
    for n in 2..10_000 {
        let candidate = format!("{base} ({n})");
        if !taken.iter().any(|t| t.as_ref() == candidate) {
            return candidate;
        }
    }
    format!("{base}-{}", uuid_fallback())
}

fn uuid_fallback() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos() as u64)
        .unwrap_or(0)
}

/// True if placing `folder_id` under `new_parent_id` would create a cycle.
/// `parent_of` maps folder id → parent folder id (None = collection root).
pub fn would_create_cycle(
    folder_id: &str,
    new_parent_id: &str,
    parent_of: &HashMap<String, Option<String>>,
) -> bool {
    if folder_id == new_parent_id {
        return true;
    }
    let mut cur = Some(new_parent_id.to_string());
    let mut guard = 0;
    while let Some(id) = cur {
        if id == folder_id {
            return true;
        }
        cur = parent_of.get(&id).cloned().flatten();
        guard += 1;
        if guard > parent_of.len() + 1 {
            break; // ponytail: broken map; treat as cycle to refuse move
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unique_name_unused() {
        assert_eq!(unique_sibling_name("Auth", &["Other"]), "Auth");
    }

    #[test]
    fn unique_name_suffixes() {
        let taken = ["Auth".to_string(), "Auth (2)".to_string()];
        assert_eq!(unique_sibling_name("Auth", &taken), "Auth (3)");
    }

    #[test]
    fn unique_name_empty_becomes_untitled() {
        assert_eq!(unique_sibling_name("  ", &["Untitled"]), "Untitled (2)");
    }

    #[test]
    fn cycle_self() {
        let mut m = HashMap::new();
        m.insert("a".into(), None);
        assert!(would_create_cycle("a", "a", &m));
    }

    #[test]
    fn cycle_descendant() {
        // a → b → c
        let mut m = HashMap::new();
        m.insert("a".into(), None);
        m.insert("b".into(), Some("a".into()));
        m.insert("c".into(), Some("b".into()));
        assert!(would_create_cycle("a", "c", &m));
        assert!(!would_create_cycle("c", "a", &m));
    }
}
