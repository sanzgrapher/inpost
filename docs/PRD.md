# PRD — Inpost: Local-First API Client with MCP & Sync

**Status:** Draft v0.1  
**Owner:** Inpost  
**Last updated:** 2026-07-24  
**Working title:** Inpost (local-first counterpart to cloud/account-gated clients)

---

## 1. Summary

A desktop API client (Postman/Bruno/Yaak-class) built on **Rust + Tauri**, with:

- A fully local-first core (SQLite) that works offline with **zero account requirement**.
- An optional **sync server** that mirrors local data for multi-device / multi-user use, with automatic conflict resolution for non-conflicting changes and manual review for real conflicts.
- A built-in **MCP server** so coding agents can create/update requests, manage environments, and execute HTTP calls against the same data model as the UI.
- Cross-platform builds (Linux, macOS, Windows) via GitHub Actions.

**Build strategy:** iterative and incremental. Ship a thin local HTTP request/response core first, then MCP, then sync, then multi-user/presence — in that order.

**Philosophy:** We do not invent what we can study. Closest architectural reference is [Yaak](https://github.com/mountain-loop/yaak) (Tauri + Rust + React). Feature/UX parity target for sync + MCP is [Outpost](https://outpost-api-client.vercel.app/) — treat Outpost as a closed product reference, not a fork target (no public repo). Prefer reuse of existing sync engines over a hand-rolled CRDT.

---

## 2. Problem Statement

Existing tools force a tradeoff:

| Tool | Local-first | Fast (Tauri/Rust) | MCP / agent-native | Multi-user sync | Open source |
|---|---|---|---|---|---|
| Bruno | Yes | No (Electron) | No | No | Yes |
| Yaak | Yes | Yes | Deprecated MCP → CLI-only | No | Yes (MIT) |
| Vaxtly | Yes, no account | Unknown | Yes (MIT, bidirectional) | No | Yes |
| Postman | No (cloud) | No (Electron) | Yes (hosted, mature) | Yes | No |
| Outpost | No (account required) | Yes (Tauri/Rust) | Yes (48 tools, local stdio) | Yes | Unknown / likely closed |

No existing open-source tool combines Yaak’s speed, Vaxtly’s no-account philosophy, Outpost’s multi-user sync, and Postman’s MCP maturity. That combination is the target.

---

## 3. Goals

1. Native-feeling desktop app, fast startup, low memory (Tauri + Rust backend, not Electron).
2. Local SQLite is the source of truth on-device; fully usable with no network and no account.
3. Optional sync server: opt-in, mirrors local SQLite, auto-resolves non-conflicting changes, surfaces true conflicts for manual resolution.
4. MCP server so an agent can: create/update requests, manage collections, manage environments (create/update/choose/set-global-default fields), execute requests, and read formatted responses (JSON pretty-print, timing).
5. Collections with OpenAPI import/export.
6. CI/CD via GitHub Actions producing signed builds for Linux, macOS, and Windows.

## 4. Non-Goals (v1)

- Multi-user roles / presence / invites (Phase 4, not v1).
- GraphQL / gRPC / WebSocket / Sockeon (HTTP only for v1).
- Building a custom CRDT/merge engine from scratch (use an existing sync engine — see §8).
- Matching Postman’s full cloud feature set.

---

## 5. Users / Personas

- **Primary:** individual developer who wants a fast, local, no-account API client that an AI coding agent can drive directly (create requests, set env vars, run calls) without leaving the editor/chat.
- **Secondary (later):** small team sharing collections/environments with role-based access, without giving up local-first speed.

---

## 6. Architecture Overview

```
┌─────────────────────────────────────────────┐
│                Tauri Shell (Rust)             │
│  ┌─────────────┐   ┌───────────────────────┐ │
│  │  Frontend    │   │   Rust Core (backend)  │ │
│  │  (React)     │◄─►│  - request execution   │ │
│  │  UI          │   │  - SQLite data layer   │ │
│  └─────────────┘   │  - env resolution      │ │
│                     │  - OpenAPI import/exp  │ │
│                     └───────────┬────────────┘ │
│                                 │ local stdio    │
│                     ┌───────────▼────────────┐ │
│                     │   MCP Server (stdio)    │ │
│                     │  tools: create_request, │ │
│                     │  set_env, run_request,   │ │
│                     │  list_collections, ...   │ │
│                     └─────────────────────────┘ │
└──────────────────────┬──────────────────────────┘
                        │ optional, opt-in
                        ▼
              ┌───────────────────────┐
              │      Sync Server        │
              │  (Postgres + sync       │
              │   engine, e.g.          │
              │   PowerSync/Electric)   │
              │  - conflict resolution  │
              │  - per-user history     │
              │  - env keys sync,       │
              │    secret values stay   │
              │    device-local         │
              └───────────────────────┘
```

Key design decisions:

- **Local-first by construction.** The Rust core never requires the sync server. Sync is an additional writer/reader on the same local SQLite tables.
- **MCP runs locally, stdio-based**, refreshed from the app’s own tool registry on launch (mirrors [Outpost’s MCP setup](https://outpost-api-client.vercel.app/docs/mcp-setup)) so new tools appear automatically as the app grows.
- **Secrets never leave the device.** Only env *keys and types* sync; values stay local (same model Outpost documents for environments).
- **Study Yaak’s shell, don’t clone Outpost.** Yaak (`mountain-loop/yaak`) is the closest Tauri/Rust/React match. Outpost is the feature/UX parity reference for sync + agent surface; source availability unconfirmed.

---

## 7. Feature List (Phased)

### Phase 0 — Core local client (MVP) ← current init target

- Tauri + Rust shell, SQLite storage.
- HTTP request builder: method, URL, headers, query params, body (raw/JSON/form).
- Response viewer: status, timing, formatted/pretty-printed JSON, raw view.
- Basic collections (folders, save/organize requests).
- Environments: create environment, set key/value pairs, switch active environment, global-default fallback for unset keys.

### Phase 1 — MCP layer ← in progress

- Local stdio MCP server bundled with the app (**Outpost bridge pattern** + Requestly SDK packaging).
- Tools exposed to agents (Phase 1 set):
  - `create_request` / `update_request` / `delete_request` / `get_request` / `list_requests`
  - `list_collections` / `create_collection`
  - `create_environment` / `update_environment` / `set_active_environment` / `get_active_environment` / `list_environments`
  - `run_request` (optional `environmentId`)
- OpenAPI tools → Phase 2.
- Tool list grows with the app; stdio bundle refreshed on each launch into app data.

### Phase 2 — OpenAPI & collection portability ← done

- [x] OpenAPI import (spec → collection + requests; JSON/YAML).
- [x] OpenAPI export (collection → OpenAPI 3.0.3 JSON).
- [x] Folder structure with unique sibling naming, drag-to-reorder.

MCP tools: `import_openapi`, `export_openapi`, `list_folders`, `create_folder`, `delete_folder`, `reorder_siblings`.

### Phase 3 — Sync (single-user, multi-device first)

- Opt-in sync server connection.
- Local SQLite edits queue while offline; flush on reconnect.
- Auto-merge non-conflicting changes; conflict UI for true field-level conflicts.
- Per-device request history stays local.

### Phase 4 — Multi-user (later, not v1)

- Roles: owner / admin / editor / viewer.
- Invites, presence, shared workspaces.
- Per-user history (visible only to that user).

### Backlog / not scheduled

- GraphQL, gRPC, WebSocket / Sockeon.
- Collection runner / CLI for CI pipelines.

---

## 8. Sync & Conflict Resolution — Design Notes

Do **not** hand-roll the queue-and-flush-with-conflict-UI engine first. Evaluate existing engines:

| Option | Notes |
|---|---|
| **PowerSync** | Postgres-backed, local SQLite ↔ multi-user ↔ conflict resolution, offline queue. |
| **ElectricSQL** | Similar space; Postgres-backed sync. |
| **Zero (Rocicorp)** | Newer; evaluate against the above. |
| **CRDT libs** (Loro, Yjs, Automerge) | More control, more work. Use only if we specifically want to own conflict semantics. |

**v1 conflict policy:** auto-merge non-overlapping field changes; last-write-wins with a review queue for true field-level conflicts (mirrors Outpost’s documented model).

Phase 4 presence/roles should use a thin realtime backend (Supabase Realtime, PartyKit, or Ably) + Postgres tables — not custom infra.

---

## 9. Reference Projects & Sources

Confirm license terms before reusing code verbatim.

| Project | Role for Inpost |
|---|---|
| **[Requestly](https://requestly.com/)** | **Primary UX/UI reference** for Phase 0 shell: light three-pane layout, icon rail, collection tree, request/response split, local history banner, keyboard shortcuts. API Client app is proprietary ([community hub](https://github.com/requestly/requestly) only) — study screenshots/flow, do not fork. |
| **[Yaak](https://github.com/mountain-loop/yaak)** | **Primary architecture reference.** Tauri + Rust + React, SQLite models, HTTP execution, IPC boundary. Study crate split (`yaak-models`, `yaak-http`, Tauri-agnostic core). Note: Yaak deprecated in-app MCP in favor of a standalone CLI — study that transition before locking our MCP vs CLI choice (we still prefer bundled stdio MCP for Phase 1). |
| **[Outpost](https://outpost-api-client.vercel.app/)** | **Feature/UX parity reference** for offline sync, conflict review, env secrets model, and local stdio MCP. Docs: [Getting started](https://outpost-api-client.vercel.app/docs/getting-started), [MCP setup](https://outpost-api-client.vercel.app/docs/mcp-setup). No public repo — not a fork target. |
| **Bruno** | Plain-text collection / Git-native workflow reference. |
| **Vaxtly** | Philosophy: no-account, MIT, bidirectional MCP, secrets redacted on read. |
| **Postman** | Mature MCP tool-surface design (hosted). |
| **Apidog** | Useful as an MCP debugger while building our server. |

Sync: PowerSync, ElectricSQL, Zero. Realtime: Supabase Realtime, PartyKit, Ably.

---

## 10. Tech Stack (decided for init)

| Layer | Choice | Rationale |
|---|---|---|
| App shell | Tauri 2 (Rust) | Match Yaak; fast, small footprint |
| Frontend | **React + TypeScript** | Match Yaak; team familiarity default |
| Local storage | SQLite via `rusqlite` | Yaak-proven; simple for Phase 0 |
| HTTP | `reqwest` in Rust | Execution stays in the core, not the webview |
| MCP (Phase 1) | Rust stdio, bundled with app | Outpost-style local MCP |
| Sync (Phase 3) | Postgres + PowerSync **or** ElectricSQL | Spike before committing |
| License | **MIT** | Align with Vaxtly / open-source goal |
| CI/CD | GitHub Actions (post–Phase 0 stable) | Matrix: Linux / macOS / Windows |

---

## 11. Success Metrics (v1)

- Cold start under ~300ms on a mid-range machine (measure; adjust target after first builds).
- Full HTTP request → response with zero dependency on accounts or our sync server.
- An agent can, via MCP alone, create a request, set an env var, run it, and get formatted JSON + timing — no UI clicks.
- OpenAPI import produces a working collection without manual fixup for a defined test-spec set (threshold TBD after Phase 2 spike).

---

## 12. Open Questions

| # | Question | Current lean |
|---|---|---|
| 1 | Frontend: React vs Vue vs Svelte? | **React** (Yaak match) — decided for init |
| 2 | MCP: stdio only vs also remote/HTTP later? | **stdio first** (Outpost-like); remote later if needed |
| 3 | Sync engine: PowerSync vs ElectricSQL vs Zero? | Spike in Phase 3; no commit yet |
| 4 | License: MIT vs Yaak-style commercial? | **MIT** — decided for init |
| 5 | Conflict default: LWW vs mandatory review? | Auto-merge non-overlap; LWW + review queue for true conflicts; make LWW vs force-review configurable later |

---

## 13. Build Sequence

1. Study Yaak’s Tauri + Rust shell structure (crate boundaries, IPC, models). Do not fork Outpost.
2. **Phase 0** — local single-user HTTP client end-to-end; get it fast and stable. ← **we are here**
3. Phase 1 — MCP on top of the working local core.
4. Phase 2 — OpenAPI import/export.
5. Spike PowerSync vs ElectricSQL before Phase 3.
6. Phase 3 — single-user multi-device sync; only then Phase 4 multi-user via thin realtime backend.
7. GitHub Actions cross-platform matrix once Phase 0 is stable.

---

## 14. Phase 0 Acceptance Criteria

- [x] App launches without network or account.
- [x] User can create a collection, add an HTTP request, send it, see status / timing / body.
- [x] Environments support `{{var}}` substitution in URL and headers.
- [x] Data persists across restarts in local SQLite.
- [x] One runnable check proves env substitution (`npm run check`).
- [x] Headers / query params as key-value editors; env vars editable in UI; pretty/raw response.

---

## Appendix A — Outpost MCP layout (reference)

Outpost refreshes a stdio bundle under app data on each launch; config is copied from **Profile → Personal settings → MCP**. Typical paths:

| OS | Path |
|---|---|
| Linux | `~/.local/share/com.outpost.desktop/mcp/stdio.mjs` |
| macOS | `~/Library/Application Support/com.outpost.desktop/mcp/stdio.mjs` |
| Windows | `%APPDATA%\com.outpost.desktop\mcp\stdio.mjs` |

Inpost Phase 1 should follow the same pattern: stable app-data path, config copyable into Cursor/Claude/etc., app must stay running while agents use stdio.

```json
{
  "mcpServers": {
    "inpost": {
      "command": "node",
      "args": ["~/.local/share/com.inpost.desktop/mcp/stdio.mjs"]
    }
  }
}
```

(Exact binary/command may be a Rust MCP binary instead of Node — decide in Phase 1; prefer one runtime already shipped with the app.)
