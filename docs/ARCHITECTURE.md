# Architecture notes (Phase 0)

Keep the surface small until Phase 0 is stable. Do not split into a Yaak-style multi-crate workspace yet — one `src-tauri` crate with modules is enough.

## Layout

```
crates/inpost-core/  Tauri-agnostic core (env subst today; models/HTTP/MCP later)
src/                 React UI (request builder)
src-tauri/src/
  db.rs              SQLite schema + CRUD
  http_exec.rs       reqwest send + timing + JSON pretty
  lib.rs             Tauri commands / wiring
docs/PRD.md          Product requirements
```

`npm run check` runs `cargo test -p inpost-core` (no WebKit required).

## References (study, don't invent)

- **Requestly** (`requestly.com`) — UX/UI target (light 3-pane, rail, history). App is closed-source; community hub only.
- **Yaak** (`mountain-loop/yaak`) — Tauri/Rust/React shell, models, HTTP IPC
- **Outpost** — sync + MCP UX parity; no public source

## Next

Phase 2 done. Optional: local workspaces, then Phase 3 sync spike.
