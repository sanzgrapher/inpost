#!/usr/bin/env bash
# Drop the bundled libwayland-client from an AppImage so the host's copy is used (#4).
#
# linuxdeploy copies the build machine's libwayland-client into usr/lib, but
# libEGL/Mesa always come from the host. On distros with a newer Mesa (Arch,
# Fedora; Mesa 25+) the host libEGL then binds the stale bundled client lib,
# eglGetDisplay fails and WebKitWebProcess aborts ("Could not create default EGL
# display"). The AppImage community excludelist drops libwayland-client for this
# reason; tauri's pinned linuxdeploy predates that (tauri-apps/tauri#15665).
# Only the client lib goes: every GTK3 host ships it, but not libwayland-server
# (needed by libwebkit2gtk, absent on stock Fedora / Ubuntu 24.04), so the other
# libwayland-* stay bundled.
#
# The runtime (first --appimage-offset bytes) is kept byte-for-byte; only the
# squashfs is rebuilt, with the original's compression and block size.
# ponytail: delete once tauri ships bundle.linux.appimage.excludeLibraries (tauri#15662).
set -euo pipefail

img="$(realpath "$1")"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
cd "$work"

offset="$("$img" --appimage-offset)"
head -c "$offset" "$img" > runtime
tail -c +"$((offset + 1))" "$img" > orig.sqfs
comp="$(unsquashfs -s orig.sqfs | awk '/^Compression/ {print $2}')"
block="$(unsquashfs -s orig.sqfs | awk '/^Block size/ {print $3}')"

(umask 0 && unsquashfs -q -no-progress -d root orig.sqfs)
removed="$(find root/usr/lib -maxdepth 1 -name 'libwayland-client.so*' -print -delete | wc -l)"
if find root -name 'libwayland-client.so*' | grep -q .; then
  echo "appimage-unbundle-wayland: libwayland-client still bundled" >&2
  exit 1
fi

mksquashfs root new.sqfs -root-owned -noappend -no-progress -quiet -comp "$comp" -b "$block"
cat runtime new.sqfs > "$img.tmp"
chmod --reference="$img" "$img.tmp"
mv "$img.tmp" "$img"
echo "appimage-unbundle-wayland: removed $removed libwayland-client file(s) from $(basename "$img")"
