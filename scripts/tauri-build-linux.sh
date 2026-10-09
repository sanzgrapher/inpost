#!/usr/bin/env bash
# tauri-action's tauriScript on Linux: run the Tauri CLI, then strip the bundled
# libwayland-client from the AppImage before the action uploads it (#4).
set -euo pipefail
cd "$(dirname "$0")/.."
npx tauri "$@"
[ "${1:-}" = build ] || exit 0

mapfile -t imgs < <(find target -path '*/bundle/appimage/*.AppImage' -type f)
if [ "${#imgs[@]}" -eq 0 ]; then
  echo "tauri-build-linux: no AppImage found under target/" >&2
  exit 1
fi
for img in "${imgs[@]}"; do scripts/appimage-unbundle-wayland.sh "$img"; done
