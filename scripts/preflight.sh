#!/usr/bin/env bash
# Local release preflight — mirrors .github/workflows/release.yml exactly.
# Runs: build:mcp, tsc --noEmit, cargo test + tsx self-checks, vite build,
# cargo build --release -p inpost, then tauri build (produces installers).
# Exit non-zero on any failure so this is safe to chain before a push.

set -u
cd "$(dirname "$0")/.."

# tauri build writes to CARGO_TARGET_DIR/release/bundle (default src-tauri/target).
CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-src-tauri/target}"
BUNDLE_DIR="$CARGO_TARGET_DIR/release/bundle"

step() { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m✓ %s\033[0m\n' "$*"; }
fail() { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; }

step "Running preflight (npm run preflight)"
if npm run preflight; then
  ok "preflight passed"
else
  fail "preflight FAILED — fix the failing step before pushing"
  exit 1
fi

step "Installers produced under $BUNDLE_DIR"
if [ -d "$BUNDLE_DIR" ]; then
  # Print installer-sized files (skip the bare inpost binary + intermediate .d.ts).
  find "$BUNDLE_DIR" -type f \( \
    -name '*.deb' -o -name '*.rpm' -o -name '*.AppImage' \
    -o -name '*.msi' -o -name '*.exe' \
    -o -name '*.dmg' -o -name '*.app' \
  \) -printf '  %p\n' 2>/dev/null | sort | sed 's/^  /  /'
else
  fail "bundle dir missing — tauri build reported success but produced nothing?"
  exit 1
fi

ok "Ready to push. (tag-driven release: git tag vX.Y.Z && git push --tags)"
