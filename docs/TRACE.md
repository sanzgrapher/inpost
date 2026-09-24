# Inpost — session trace & status

**Purpose:** Living log so any new chat stays on track. Agents **read this first**, then **append** after each user request they work on.

**Last updated:** 2026-09-11 (workspace-scoped environments)

---

## Current status (read this first)
| Item | State |
|---|---|
| **Phase** | Phase 0 ✅ · Phase 1 MCP ✅ · Phase 2 ✅ · Local workspaces ✅ · Settings tab ✅ · Release pipeline ✅ |
| **Next up** | Phase 3 sync-engine spike (PowerSync vs ElectricSQL) |
| **OpenAPI MCP** | `import_openapi` / `export_openapi`: `summary` = request name; `tags` = folders (3.2 `parent` when nested) |
| **PokéAPI ws** | Docs + env-wired requests filled via MCP (Prod active) |
| **App** | Tauri 2 + React + SQLite · `com.inpost.desktop` · MIT |
| **UX ref** | Requestly (layout/flow) — proprietary app; study screenshots only |
| **Arch ref** | Yaak (Tauri/Rust/React) |
| **MCP ref** | Localhost bridge + `session.json` + bundled `stdio.mjs`; Requestly MCP *packaging* (open MIT SDK) |
| **Run** | `npm run build:mcp && npm run tauri dev` (or `npm run tauri dev` which runs build:mcp first) |
| **Check** | `npm run check` → `cargo test -p inpost-core` + `src/searchQuery.ts` / `src/shortcuts.ts` / `src/workspaceSession.ts` / `src/envVar.ts` / `src/envSync.ts` / `src/reqMeta.ts` / `src/tabClose.ts` self-checks |
| **MCP config** | Keep app open; point Cursor at `~/.local/share/com.inpost.desktop/mcp/stdio.mjs` (Linux) / `%APPDATA%\com.inpost.desktop\mcp\stdio.mjs` (Windows) — or copy from **Settings → MCP** |

### Key docs
- [PRD.md](./PRD.md) — product scope & phases  
- [MCP.md](./MCP.md) — MCP architecture notes  
- [ARCHITECTURE.md](./ARCHITECTURE.md) — code layout  

---

## Backlog (not done yet)

- [ ] Phase 3: sync spike (PowerSync vs ElectricSQL vs Zero) then opt-in sync
- [ ] Phase 4: multi-user roles / presence
- [x] GitHub Actions cross-platform builds (tag-driven release matrix + push-main check)
- [ ] Code-signing / notarization for release artifacts (certs / Apple Developer ID)
- [ ] Scripts / Tests / Debug tabs, OAuth/JWT, cookies, Timeline, GraphQL, binary body (deferred)
- [ ] Auth inherit-from-folder; multipart file bytes on the wire (UI Text/File done)
- [ ] Docs polish: image upload/paste, per-folder descriptions, "View complete documentation" collection page listing all requests (Postman-style)

---

## Done (summary)

- PRD + project init (Tauri/React/SQLite Phase 0)  
- Requestly-like light UI (slim custom titlebar, open tabs, dock right/bottom, CodeMirror JSON)  
- Env `{{var}}`, collections, send HTTP  
- Phase 1: localhost MCP bridge + bundled `stdio.mjs` + tools  
- Phase 2: OpenAPI import/export + collection folders, unique sibling names, drag-reorder  
- Local **workspaces** (Workspace → Collections) with searchable picker in titlebar  
- **Environments per workspace** (own Global + active; list/create/active scoped; cascade on delete)
- Scoped global search + persisted **workspace / per-request** history  
- Sidebar cleaned up (collections forest, env on URL bar) like Requestly rail+tree  
- Settings tab (titlebar ⚙ → open tab; General + MCP copy path/config)  
- Request dirty dot on tabs; rename via breadcrumb (URL-bar name field removed)  
- Shortcut table (`src/shortcuts.ts`) drives handler + Settings → Keyboard + empty-response hints  
- Request body types (none/JSON/text/urlencoded/multipart) + Auth (Bearer/Basic/API key) + path params + header autocomplete + response History tab  
- Workspace settings: rename / switch / **delete** (confirm dialog; refuses last workspace)
- History: sidebar → read-only snapshot tab; response History icon/tab → inline preview + pop-out to snapshot; `request_json` on new sends; workspace **Clean up** clears that workspace’s history
- Tab context menu: Close / Close Others / Close to the Right / Close Saved / Close All / Reopen (enabled only when they apply); Ctrl+W close · Ctrl+Shift+W close all (confirm) · Ctrl+Shift+T reopen stack
- Sidebar collections collapse/expand (same twistie as folders; persisted in workspace session)

---

## Trace log (newest first)

### 2026-09-11 — Workspace-scoped environments
**User asked:** Tie environments to workspaces so each workspace has its own and only those show.
**Did:** `environments.workspace_id` migrate + backfill; per-workspace Global/Local seed on create; scoped list/active/upsert/delete; cascade on `delete_workspace`. Wired `workspaceId` through Tauri/`resolve_env_maps`, bridge, MCP tools, OpenAPI import, App `refreshEnvs`. Rust tests `environments_are_workspace_scoped` + cascade. Docs: [`docs/MCP.md`](./MCP.md).
**Needs next:** Phase 3 sync spike remains next feature.

### 2026-09-11 — Explored env ↔ workspace relation
**User asked:** How environments and workspaces relate today (models, workspace_id, UI filter, API, migration patterns).
**Did:** Read-only map: environments are **app-global** (no `workspace_id`); `is_global` = the single Global-vars env, not workspace scope. Collections already scoped via `workspace_id` + `list_collections(workspaceId)` migration pattern in `db.rs`. Key touch points: `src-tauri/src/db.rs`, `lib.rs`, `bridge.rs`, `src/App.tsx` (`refreshEnvs` / rail / URL picker), `mcp/src/tools.ts`.
**Needs next:** If scoping envs to workspaces: mirror collections migration (`ALTER` + backfill), filter list/active/upsert/delete, cascade on `delete_workspace`, MCP `workspaceId` params, UI refresh on workspace switch.

### 2026-09-11 — History sidebar: drop device banner
**User asked:** Remove “Workspace history stays on this device.” from the UI.
**Did:** Deleted the `sidebar-banner` under History in [`src/App.tsx`](../src/App.tsx).
**Needs next:** Phase 3 sync spike remains next feature.

### 2026-08-14 — History sidebar: drop MCP copy-ID banner
**User asked:** Don’t put “Copy an entry ID to inspect via MCP get_history” on the actual app.
**Did:** Restored sidebar banner to “Workspace history stays on this device.” Copy ID still on hover + snapshot tab.
**Needs next:** Phase 3 sync spike remains next feature.

### 2026-08-14 — History copy ID + MCP history tools
**User asked:** Copy history entry ID in UI so agents can inspect snapshots via MCP during development.
**Did:** Bridge routes `GET /v1/history/{id}`, `/v1/workspaces/{id}/history`, `/v1/requests/{id}/history`. MCP tools `get_history`, `list_workspace_history`, `list_request_history`. UI: sidebar history row copy button (hover) + **Copy ID** on snapshot tab ([`HistoryDetail.tsx`](../src/HistoryDetail.tsx)); sidebar banner mentions MCP. [`docs/MCP.md`](./MCP.md) updated.
**Needs next:** Phase 3 sync spike remains next feature.

### 2026-08-14 — Tab strip: pointer drag (no HTML5 DnD)
**User asked:** Gdk spam `Unable to load dnd-move` / `dnd-none` while dragging tabs (WSL/GTK cursor theme).
**Did:** Reverted tab strip to pointer-based reorder (follow pointer + sibling slide + commit on release). Avoids native HTML5 DnD cursors that GTK can’t load here. Tree DnD still uses HTML5 (same Gdk noise if you drag folders/requests).
**Needs next:** Phase 3 sync spike remains next feature.

### 2026-08-14 — Tree-like tab strip DnD
**User asked:** Tab dragging like collections/folder/request sibling drag-drop.
**Did:** Replaced pointer-follow tab reorder with HTML5 DnD (`application/inpost-tab`), before/after drop markers on sibling tabs, commit via `reorderTab` on drop. Tiny drag ghost; CSS `drag-source` / `drop-before` / `drop-after`.
**Needs next:** Phase 3 sync spike remains next feature.

### 2026-08-14 — Browser-like tab drag
**User asked:** Smooth reorder transition like browser tabs.
**Did:** Dragged tab follows the pointer; siblings slide with CSS transitions via `tabSiblingShift`; order commits on release (`moveTabIndex`). No live DOM shuffle while dragging.
**Needs next:** Phase 3 sync spike remains next feature.

### 2026-08-14 — Smooth tab reorder
**User asked:** Tab switching/moving while drag wasn’t smooth.
**Did:** FLIP animation on sibling tabs when `openTabs` reorders; edge auto-scroll on the strip; dragged tab stays un-animated (opacity + lift).
**Needs next:** Phase 3 sync spike remains next feature.

### 2026-08-14 — Tab strip disables text selection
**User asked:** Tab titles highlight/select while dragging.
**Did:** `user-select: none` on `.opentabs` / `.opentab`; clear selection on pointerdown and when a reorder arms.
**Needs next:** Phase 3 sync spike remains next feature.

### 2026-08-14 — Tab reorder stays in strip
**User asked:** Tab drag ghost could leave the tab bar into the editor.
**Did:** Replaced HTML5 DnD with pointer reorder confined to the open-tab strip (no floating drag image). Reorder only while the pointer is over the strip.
**Needs next:** Phase 3 sync spike remains next feature.

### 2026-08-14 — Drag-reorder open tabs
**User asked:** Rearrange tabs by dragging.
**Did:** HTML5 drag-and-drop on the open-tab strip; `reorderTab` in [`tabClose.ts`](../src/tabClose.ts). Order persists via workspace session `openTabs`.
**Needs next:** Phase 3 sync spike remains next feature.

### 2026-08-14 — History tabs show History icon
**User asked:** Distinguish history vs playground tabs (option A: icon + method + name).
**Did:** Open-tab strip and tab search: history entries show History icon, then method, then name. Active tab tints the icon accent.
**Needs next:** Phase 3 sync spike remains next feature.

### 2026-08-14 — History response body empty
**User asked:** History response body showing nothing.
**Did:** History `editor-split` used a 3-column playground grid (with 0px sash) but only two children, so the response pane collapsed into the sash column. Switched to a 2-column `1fr 1fr` grid.
**Needs next:** Phase 3 sync spike remains next feature.

### 2026-08-14 — Shared RequestChrome
**User asked:** Fix history/playground UI drift via shared components.
**Did:** Extracted [`RequestChrome.tsx`](../src/RequestChrome.tsx) (crumb + url-bar); App + HistoryDetail both use it. History uses `editor-split` / `request-pane` / `section-body` / `response-top`, Overview + tab dots, empty query row parity; DocArticle `readOnly`.
**Needs next:** Phase 3 sync spike remains next feature.

### 2026-08-14 — Fix bridge move of env maps
**User asked:** Rust compile error borrowing `active`/`global` after move in bridge.
**Did:** Clone env maps into `SendRequestInput` so history snapshot closures can still borrow them.
**Needs next:** Phase 3 sync spike remains next feature.

### 2026-08-14 — History head matches playground URL bar
**User asked:** History head/url bar still not same as playground; replace Send/Save with Open request (+ arrow).
**Did:** History uses same `req-crumb` + `url-bar` (disabled method Select + readOnly UrlField). Status/meta moved to response-top. Primary **Open request** with ArrowUpRight focuses existing tab or opens the request.
**Needs next:** Phase 3 sync spike remains next feature.

### 2026-08-14 — History shows resolved env values
**User asked:** History should render resolved values, not `{{xyz}}` templates.
**Did:** Snapshots now store substituted headers/body/auth/pathVars at send (UI + MCP bridge). History detail also resolves leftover `{{vars}}` with current env for older rows; query params come from the resolved URL.
**Needs next:** Phase 3 sync spike remains next feature.

### 2026-08-14 — History detail frozen playground controls
**User asked:** Same UI as playground but all inputs disabled.
**Did:** Extracted [`PairTable.tsx`](../src/PairTable.tsx) with `readOnly`; history uses PairTable + body-type radios + auth Select/fields + CodeEditor, all disabled/read-only. Select gained `disabled`. Response headers use PairTable too.
**Needs next:** Phase 3 sync spike remains next feature.

### 2026-08-14 — History detail matches playground chrome
**User asked:** History snapshot still dissimilar in spacing vs playground.
**Did:** Restructured [`HistoryDetail.tsx`](../src/HistoryDetail.tsx) like the editor split: compact head + URL strip; request tabs Params/Headers/Body/Auth aligned with response Body/Headers; reused `.section-tabs` / `.body-toolbar` / pane padding so spacing matches the playground.
**Needs next:** Phase 3 sync spike remains next feature.

### 2026-08-14 — History response Body/Headers tabs
**User asked:** History snapshot stacks response headers above body; use playground-style tabs instead.
**Did:** [`HistoryDetail.tsx`](../src/HistoryDetail.tsx) response pane uses `section-tabs` Body / Headers (count); JSON/Raw stays on Body. Pane flex so the editor fills remaining height.
**Needs next:** Phase 3 sync spike remains next feature.

### 2026-08-14 — Auto save setting
**User asked:** Settings: auto save + save-after delay in ms; when on, save after that delay.
**Did:** Settings → General → Save: Auto save On/Off + delay ms (250–60000, default 1000). Persisted in localStorage. Debounced `save()` on dirty open request when enabled.
**Needs next:** Phase 3 sync spike remains next feature.

### 2026-08-14 — False dirty dots + unsaved close prompt
**User asked:** Tabs from MCP/import show unsaved (blue dots) immediately; closing them never asks to save/cancel.
**Did:** Dirty compare used raw DB JSON (`snapOf`) while the editor re-serializes via `pairsToJson`/`mergePathPairs` — e.g. `pathVarsJson: "{}"` vs `[["species",""]]`. Open/save now baseline with `snapFromRequest` (same shape as live `curSnap`). Added `dialogs.unsaved` (Save / Don’t save / Cancel); closing dirty request tabs (×, menu, Ctrl+W, close others/right/all) prompts; delete still force-closes without prompt.
**Needs next:** Phase 3 sync spike remains next feature.

### 2026-08-14 — Collection sidebar collapse
**User asked:** Could not collapse a collection while folders are collapsible (chevron looked the same).
**Did:** Collection twist was decorative (ChevronDown when active only). Added `expandedCollections` to workspace session; collection twist is a real toggle; active collection children show only when expanded; switching to a collection expands it; collapse/expand-all includes the active collection.
**Needs next:** Phase 3 sync spike remains next feature.

### 2026-08-13 — OpenAPI names + folders via official fields
**User asked:** Only add name/title + folder structure to OpenAPI export/import if the format allows it.
**Did:** Yes via spec fields — `summary` (display name; preferred over `operationId` on import) and `tags` / root `tags` (folders). Nested folders → Tag Object `parent` and bump doc to OpenAPI **3.2.0**; flat stays **3.0.3**. Wired in [`crates/inpost-core/src/openapi.rs`](../crates/inpost-core/src/openapi.rs) + [`openapi_ops.rs`](../src-tauri/src/openapi_ops.rs) (create folders on import; emit tags from DB folders on export). Live PokéAPI export→reimport into Personal: 5 folders + names like `Get Pokémon` (not `get_pok_mon`). Tests: summary/tags round-trip + nested 3.2 parent.
**Needs next:** Phase 3 sync spike remains next feature.

### 2026-08-13 — OpenAPI MCP import/export verified (apis.guru + httpbin)
**User asked:** Add MCP OpenAPI import/export if missing; first import popular specs from apis.guru, then export from Inpost and re-import to prove round-trip.
**Did:** Tools already exist (`import_openapi` / `export_openapi` → bridge `/v1/openapi/*`). No new tools. Validated via localhost bridge (Cursor `inposts` CallMcpTool fetch failed — likely MCP stdio pointed at Windows path while Linux app runs; use `~/.local/share/com.inpost.desktop/mcp/stdio.mjs`). Import [apis.guru 2.2.0](https://api.apis.guru/v2/specs/apis.guru/2.2.0/openapi.json) → 7 reqs; `listAPIs` live 200 (2529 APIs). Export → re-import: paths/methods/descs/collection desc match; reimported run 200. Import httpbin → 73 reqs; GET `/get` live 200; export→re-import count+ops match (unwrap `{"spec":...}`). Minor: reimport names follow slugified `operationId` (`listAPIs`→`listapis`); export servers are always `{{baseUrl}}`.
**Needs next:** Optional name round-trip polish (prefer summary on import, or stop lowercasing operationId). Phase 3 sync spike remains next feature.

### 2026-08-13 — Workspace history Clean up
**User asked:** History screen needs a clean-up button for old history.
**Did:** History rail header gets **Clean up** (disabled when empty). Confirm, then `clear_workspace_history` deletes that workspace’s `request_history` only. Closes open `__hist__:` tabs, clears request-history popover/cache. Rust unit test: other workspace’s rows stay.
**Needs next:** Phase 3 sync spike remains next feature.

### 2026-08-13 — Close-all confirm; reopen is Ctrl+Shift+T
**User asked:** Ctrl+Shift+W should close all with a dialog; Ctrl+Shift+T reopens from the stack.
**Did:** Restored the split: Ctrl+W close one, Ctrl+Shift+W close all (confirm via existing `dialogs.confirm`; mentions unsaved count + Ctrl+Shift+T), Ctrl+Shift+T walk the reopen stack. Menu Close All uses the same confirm. Stack/index restore unchanged.
**Needs next:** Phase 3 sync spike remains next feature.

### 2026-08-13 — Browser-like close/reopen stack
**User asked:** Make close/reopen work like a browser stack — Ctrl+W and Ctrl+Shift+W back and forth in sequence.
**Did:** Ctrl+Shift+W now reopens (was close-all). Ctrl+W still closes. Pair is LIFO: each close remembers strip index + keeps the tab cache so reopen puts the tab back where it was (and with unsaved edits). Repeat Ctrl+Shift+W to walk the stack; Ctrl+W after a reopen closes that tab again. Ctrl+Shift+T stays as a reopen alias. Close All remains on the right-click menu only. [`src/tabClose.ts`](../src/tabClose.ts) `ClosedTab` + `insertTab` + sequence self-check.
**Needs next:** Phase 3 sync spike remains next feature.

### 2026-08-13 — Tab close menu + reopen shortcut
**User asked:** Tabs need Close / Close all / Close others / Close to the right / Close saved, enabled only when they make sense, plus shortcuts to close and reopen recently closed (Ctrl+W / Ctrl+Shift+W).
**Did:** Right-click on any open tab (request, settings, docs, history, env) opens a menu: Close, Close Others, Close to the Right, Close Saved, Close All, Reopen Closed Tab. Disabled when they wouldn't do anything (rightmost → no Close to the Right; single tab → no Close Others; all dirty → no Close Saved; empty stack → no Reopen). [`src/tabClose.ts`](../src/tabClose.ts) owns enablement + id lists + a 20-deep recently-closed stack (focused tab popped first). Shortcuts: Ctrl+W close current, Ctrl+Shift+W close all, Ctrl+Shift+T reopen. Stack is in-memory and cleared on workspace switch; deleting a request does not push it.
**Needs next:** Phase 3 sync spike remains next feature.

### 2026-08-08 — Read-only history snapshot + inline quick view
**User asked:** Sidebar history should open a read-only request+response snapshot for debugging; response History icon/tab should keep inline past-response preview with a pop-out to the same full snapshot.
**Did:** Added `request_json` on `request_history` (+ `get_history`); UI/MCP writers snapshot headers/body/auth/params + resolved URL. New [`src/HistoryDetail.tsx`](../src/HistoryDetail.tsx) tab (`__hist__:<id>`). Sidebar click → snapshot tab only (no `openRequest`/`applyHistoryEntry`). History icon popover + response History tab: row click still `applyHistoryEntry`; ExternalLink pop-out → snapshot tab. Old rows without snapshot show response + hint.
**Needs next:** Phase 3 sync spike remains next feature.

### 2026-08-07 — Fix global search bar spaces
**User asked:** Titlebar search strips spaces (`Get Species` → `GetSpecies`); check other search UIs aren't damaged.
**Did:** Root cause was controlled-input round-trip through `parseSearchQuery` / `serializeSearchQuery` both `.trim()`-ing free text. Preserved trailing free-text spaces in [`src/searchQuery.ts`](../src/searchQuery.ts) so multi-word typing and `in:Default ` chip-commit work; matching still trims at `filterIndex`. Added self-check asserts. Other search UIs (workspace picker, sidebar filter, tab search) untouched — they never used this path.
**Needs next:** Phase 3 sync spike remains next feature.

### 2026-08-05 — Dev: port 1420 already in use
**User asked:** Terminal error `Port 1420 is already in use` when running `npm run tauri dev`.
**Did:** Stale first `npm run tauri dev` (vite on :1420 + tauri/inpost PIDs) still running; second launch failed on `beforeDevCommand`. Killed old processes; port 1420 freed.
**Needs next:** Re-run `npm run tauri dev` in one terminal only; Ctrl+C to stop before restarting.

### 2026-08-05 — Workspace delete in settings
**User asked:** Workspace settings had no delete option — add delete with confirmation dialog.
**Did:** Confirmed gap (settings Identity/Switch only; no `delete_workspace` in Rust). Added cascade delete in `src-tauri/src/db.rs` (collections → folders/requests + history; refuses last workspace) + unit test; Tauri command `delete_workspace`; Settings → workspace → **Danger zone** Delete button using existing `dialogs.confirm` (danger); clears `workspaceSession`, switches away if active was deleted. CSS `.settings-action.danger`.
**Needs next:** Optional MCP `delete_workspace` tool (not requested). Phase 3 sync spike remains next feature.

### 2026-07-25 — Research: how OSS API clients ship signed installers
**User asked:** How do open-source providers (Yaak, Bruno, Requestly, etc.) build/release for Mac + Windows so users don't get warnings/blocks?
**Did:** Research only. Surveyed comps: **Yaak** (MIT, Tauri/Rust/React — closest comp; single dev bought Apple Developer ID + Windows cert, signs/notarizes via `tauri-action` env vars), **Bruno** (MIT, Electron + `electron-builder` + `notarize.js` afterSign hook; now VC-funded), **Insomnia** (Apache, Kong-owned), **Postman** (closed, signed), **Hoppscotch** (MIT desktop wrapper unsigned — PWA-first), **Requestly** desktop (closed; MCP SDK MIT). Common Tauri pattern: `tauri-action` does macOS sign+notarize+staple automatically when `APPLE_CERTIFICATE`/`APPLE_CERTIFICATE_PASSWORD`/`APPLE_SIGNING_IDENTITY`/`APPLE_ID`/`APPLE_PASSWORD`/`APPLE_TEAM_ID` env vars are present, preceded by a step that imports the base64 `.p12` into a throwaway keychain (`security create-keychain` → `import` → `set-keychain-settings -t 3600` to dodge the lock-during-codesign bug, tauri-action issue #941). Windows: `tauri.conf.json` `bundle.windows.signCommand` invoking `relic`/`signtool`, or Azure Key Vault / Microsoft Trusted Signing with `AZURE_CLIENT_ID`/`SECRET`/`TENANT_ID`. Bruno hardcodes the signing identity + teamID in `electron-builder-config.js` + `notarize.js`. macOS 15 even killed the right-click → Open bypass, so unsigned now blocks harder than before.
**Needs next:** Decision: (a) buy certs and wire signing into `release.yml`, (b) keep unsigned but ship per-OS bypass instructions in README + release notes, (c) defer until commercial traction. Cost rough: Apple $99/yr, Windows EV ~$200–400/yr. Pre-existing backlog entry `docs/TRACE.md:35` covers the same item — no code change this round.

### 2026-07-25 — v0.1.0 re-tagged & re-released with the stdio.mjs install fix
**User asked:** "proceed pusha and run builds with release aand release notes fix xyz" — push the stdio.mjs install fix, re-cut v0.1.0 with it, run the release matrix, write proper release notes.
**Did:** `npm run check` green locally (19/19 cargo + 7 tsx self-checks + tsc/vite). Committed `95ae15d` "Fix silent MCP stdio.mjs install on Windows" (the three-file diff from the previous trace entry). `git push origin main` → `aedf857..95ae15d`. Re-tagged `v0.1.0 -f` (annotated) at `95ae15d` with a release-notes preamble, force-pushed the tag → triggered both `release.yml` (tag) and `check.yml` (main).
  - **Release `30166334483` ✓ all 4 matrix jobs**: Apple Silicon 4m1s, Intel 3m6s, Linux 4m40s, Windows 6m8s. Exit 0. Only annotations: cosmetic "actions/checkout@v4 targets Node 20, runner forces Node 24" on every OS (non-fatal).
  - **Check `30166315995` ✓ gates** in 5m34s.
  All 9 v0.1.0 release assets freshly uploaded ~16:50–16:53 UTC (after the 16:47 re-tag push) — rpm/deb/AppImage on Linux, x64 setup.exe + x64_en-US.msi on Windows, aarch64+x64 .dmg + .app.tar.gz on macOS. The Windows installers now include the runtime-copy fix.
  Replaced the placeholder `releaseBody` ("See the assets…") with polished markdown notes via `gh release edit v0.1.0 --notes-file /tmp/inpost-v0.1.0-notes.md` — first-release summary, highlights bullets, **"What changed in v0.1.0 since the first build artifacts"** explaining both fixes (#1 cross-shell build:mcp, #2 silent stdio.mjs install), MCP-bridge per-OS path table (incl. the Cursor-WSL → Windows-Inpost `/mnt/c/...` case), roadmap.

**Needs next:** Verify on the Windows box — uninstall old / install new `Inpost_0.1.0_x64-setup.exe`, launch once, `dir %APPDATA%\com.inpost.desktop\mcp\` should show both `session.json` and `stdio.mjs`; Cursor MCP then starts (Windows: `C:\Users\…\AppData\Roaming\com.inpost.desktop\mcp\stdio.mjs`; Cursor-WSL: `/mnt/c/Users/…/AppData/Roaming/com.inpost.desktop/mcp/stdio.mjs`). Pre-existing backlog: code-signing/notarization (no certs yet). Tidy: bump `actions/checkout@v4` → `v5` + `actions/setup-node@v4` → `v5` to retire the Node-20 annotation. Phase 3 sync spike is the next feature.

### 2026-07-25 — Fix silent MCP stdio.mjs install on Windows (resource_dir subpath bug)
**User asked:** Installed the released Windows .exe but MCP wouldn't start in Cursor — `mcp/` dir had `session.json` but no `stdio.mjs`. Outpost's install puts the file in **both** `D:\Installed\…" and the runtime `AppData\Roaming\com.outpost.desktop\mcp\` copy; Inpost only in the installer copy.
**Did:** Root cause: `bridge::install_stdio_bundle` silently no-oped when the chosen source `Path` didn't exist (`if resource_stdio.exists() { copy }`), and `lib.rs` setup chose a wrong source path — `resource_dir().join("mcp").join("stdio.mjs")` lands at `D:\Installed\Inpost\mcp\stdio.mjs`, but Tauri 2 `bundle.resources: ["resources/mcp/stdio.mjs"]` keeps the `resources/` prefix on disk so the real file is at `D:\Installed\Inpost\resources\mcp\stdio.mjs`. The legacy `CARGO_MANIFEST_DIR/../mcp/dist/stdio.mjs` fallback pointed at the CI build machine (baked compile-time) — doesn't exist on the user's PC. Net result: `session.json` was written (looked healthy), `stdio.mjs` was never copied (silent), MCP couldn't spawn → `MODULE_NOT_FOUND`.
  - `src-tauri/src/bridge.rs`: `install_stdio_bundle` now **errors** on missing source (no silent no-op); source-existence check moved above `create_dir_all`/`copy` so a bad source never touches the dest dir.
  - `src-tauri/src/lib.rs`: setup now tries **two** joins — `resource_dir().join("resources").join("mcp").join("stdio.mjs")` (real Tauri 2 install layout, what shipped) — and falls back to `resource_dir().join("mcp").join("stdio.mjs")` (older/flat dev layout). The `CARGO_MANIFEST_DIR` dev-tree fallback is now `#[cfg(debug_assertions)]`-only (release builds reject a phantom CI path as a real error rather than papering over). `let _ =` swallowing the install result replaced with an `eprintln!` + visible failure path.
  - New `bridge::tests::install_stdio_bundle_errors_on_missing_source` — the lazy-senior runnable check: feed a bogus source path, assert `Err` with "not found". 19/19 `inpost-core` + 1/1 new test green; `cargo check` + `cargo check --release` both clean.
**Needs next:** Cut v0.1.1 (or re-tag `v0.1.0 -f` after the cross-shell build:mcp fix from the prior trace entry lands together): commit this fix, force-update the tag, push, watch `release.yml` go green on all 4 matrix jobs, confirm install on Windows produces `C:\Users\…\AppData\Roaming\com.inpost.desktop\mcp\stdio.mjs` next to `session.json`. Then re-test Cursor MCP via the Windows install path. Longer-term upgrade path noted in code: switch to `tauri::path::ResourceDirectory::resolve()` once stable across 2.x minors. Pre-existing deferred: code-signing/notarization.

### 2026-07-25 — Release pipeline v2 — tauri-action + cross-shell build:mcp (after first tag run failed)
**User asked:** Push code, create the v0.1.0 tag, run the GitHub Action to build & create the release with per-OS installer attachments. (Then: "check with gh what happened and is there a release created")
**Did:** Pushed `61bfebb`/`747fd21` to `origin/main` (SSH remote — sandbox blocks `.git/config` writes, so flipped to inline SSH URL `git@github.com:sanzgrapher/inpost.git`) + tagged `v0.1.0` + pushed tag. CI results from GitHub API (curl, anon read-only):
  - `check.yml` on push main → ✅ green in ~3 min.
  - `release.yml` on `v0.1.0` tag → ❌ all three matrix jobs failed; **no Release was created** (the separate `release:` job was `needs: build`, so any OS failure blocked Release attachment).
  Three root causes from the run annotations page:
  1. **macOS**: glob used `bundle/app/*.app` (wrong) — Tauri 2 writes `.app` to `bundle/macos/`. `.dmg` glob was correct.
  2. **Linux**: `upload-artifact@v4` `if-no-files-found: error` killed the whole job — combined glob of `deb/rpm/appimage` reported "no files found" even though deb/rpm were definitely built (the report lumps all globs).
  3. **Windows**: preflight exit 1 within ~59s — root cause: `build:mcp` in `package.json` used `cp mcp/dist/stdio.mjs src-tauri/resources/mcp/stdio.mjs && mkdir -p ...` and **npm spawns package scripts via `cmd.exe` on Windows regardless of the outer shell**; `cp` is not a cmd builtin, `mkdir -p` is rejected. `shell: bash` on the workflow step does NOT fix this (npm spawns internally).

  **Fixes:**
  - Rewrote [.github/workflows/release.yml](../.github/workflows/release.yml) on `tauri-apps/tauri-action@v0` (Yaak pattern from `mountain-loop/yaak` workflow). It knows per-OS bundle paths internally, creates the Release, attaches all artifacts in one action — deleted the separate `release:` job and the buggy `upload-artifact@v4` step entirely. Matrix now has **two macOS entries** (`aarch64-apple-darwin` M1+ and `x86_64-apple-darwin` Intel) so we ship Universal-ish. Added `Swatinem/rust-cache@v2` for warm release builds. Added `if: github.repository == 'sanzgrapher/inpost'` guard (Yaak pattern — forks don't burn release minutes). Added `libnss3` to Linux deps (Yaak). Kept `xdg-utils`.
  - New cross-shell [scripts/build-mcp.mjs](../scripts/build-mcp.mjs) using native Node `fs`/`cp`/`mkdirSync(recursive:true)` — no shell builtins. Replaced the `build:mcp` npm script body with `node scripts/build-mcp.mjs`. Verified locally — copies `mcp/dist/stdio.mjs → src-tauri/resources/mcp/stdio.mjs` on every OS.
  Re-ran `npm run ci:gates` locally end-to-end with the new build:mcp: 19/19 cargo tests + 7 tsx self-checks + vite build + cargo build --release (57s, warm cache). All green, exit 0.

**Needs next:** Commit these fixes, force-update `v0.1.0` tag (annotated tag, so re-tag with `-f`), push, watch `release.yml` run green on all 4 matrix entries, confirm the Release at `github.com/sanzgrapher/inpost/releases/tag/v0.1.0` has Linux (`deb`/`rpm`/`AppImage`) + Windows (`msi`/`exe`) + macOS (`dmg`/`app` × Intel and arm64) installers attached. Pre-existing deferred: code-signing/notarization for macOS + Windows (certs/Apple Developer ID), notarized `.dmg` w/ Gatekeeper.


### 2026-07-25 — Release pipeline (local preflight + CI matrix)
**User asked:** Build a release workflow/code that runs the same gate sequence locally first, then in GitHub Actions — only push once the local verification is green.
**Did:** One source of truth for the gates via `npm run preflight` in [package.json](../package.json): `build:mcp → tsc --noEmit → cargo test -p inpost-core + tsx self-checks → vite build → cargo build --release -p inpost → tauri build`. `ci:gates` is the same minus the bundle (fast PR gate). [scripts/preflight.sh](../scripts/preflight.sh) wraps `npm run preflight` with PASS/FAIL + lists installers under `src-tauri/target/release/bundle/`. Two workflows: [release.yml](../.github/workflows/release.yml) triggers on `v*` tags, matrix `ubuntu-22.04/windows-latest/macos-latest` (fail-fast:false), runs `npm run preflight`, uploads per-OS artifacts, single `release` job downloads them all and attaches via `softprops/action-gh-release@v2` with `generate_release_notes`. [check.yml](../.github/workflows/check.yml) triggers on push main + PRs, single ubuntu job runs `npm run ci:gates` (no bundling). README "Release / preflight" section documents the one local command + the tag flow. Linux apt deps: webkit2gtk-4.1, libsoup-3, ayatana-appindicator3 (appindicator3 is gone on 22.04), rsvg2, patchelf, openssl.
**Needs next:** Local preflight ran end-to-end and produced `Inpost_0.1.0_amd64.deb` (8.1 MB) + `Inpost-0.1.0-1.x86_64.rpm` (8.1 MB); AppImage step blocked by Cursor sandbox FUSE/mount denial (would succeed on a real VM / GitHub ubuntu runner which is not sandboxed). All gates green (mcp/tsc/vite/tsx self-checks/cargo test 19/19/cargo release build 5m16s). To fully verify AppImage on this box, run `npm run tauri build` outside the sandbox (`required_permissions: all`) — the deb/rpm already prove the pipeline works. First real release: `git tag vX.Y.Z && git push --tags`. Phase 3 sync spike; code-signing/notarization as a follow-up backlog item once certs/Apple Developer ID exist.


### 2026-07-25 — Re-do logo branding with the actual logo image
**User asked:** @inpost_logo.png re do as it is different image (the placeholder green "In" square wasn't the real logo).
**Did:** Used the 1024×1024 RGBA `inpost_logo.png` end-to-end. `npx tauri icon ./inpost_logo.png` regenerated the full cross-platform icon set (`src-tauri/icons/*`: `.ico`, `.icns`, 32/64/128/128@2x/icon PNGs + iOS + Android mipmaps) — these replace the default Tauri scaffold icons, so the OS taskbar/window icon is now the Inpost logo. Added favicon-size PNGs in `public/` (`inpost_20/32/64.png` via ffmpeg) at ~3–10 KB each (kept the small ones, not the 1.3 MB source). `index.html` swapped the placeholder `/vite.svg` favicon for sized PNG favicons + apple-touch-icon. Titlebar: replaced the green `"In"` text square in `src/App.tsx` with `<img src="/inpost_32.png" class="titlebar-mark">`, and rewrote `.titlebar-mark` CSS (was 14×14 green box + letter; now 18×18 `object-fit: contain`, no fill/font rules) so the logo renders cleanly. `tsc --noEmit` clean.
**Needs next:** Phase 3 sync spike. Optional polish: a deeper-app brand moment (e.g. empty-state, About/Settings header, OS installer/thumbnail art) if desired later.


### 2026-07-25 — Sync-env: explain what add / replace mean
**User asked:** No clear indication of what's added vs replaced vs removed.
**Did:** Sync is unidirectional source→target; no removals. (1) Renamed tags `new`/`overwrite` → `add`/`replace` everywhere (`App.tsx` + CSS classes) so the action verb matches the intent. (2) Added a description paragraph at the top of `.env-sync` that explicitly states the rules — selected keys get **added** if missing, **replaced** if existing, and explicitly notes **"anything not selected is left untouched — nothing is removed"** to remove any ambiguity around delete. Description uses the same color-coded pill (`.env-sync-pill.add` green / `.env-sync-pill.replace` amber) that appear on each row, so the legend lives in the same color code as the row tags. (3) Added `data-tip` on each row's tag with the precise action ("Replace existing `baseUrl` in target with source value").
**Needs next:** Phase 3 sync spike.

### 2026-07-25 — Sync-env: character-level git diff (#2)
**User asked:** Whole pill is rendering green even though only one char changed — they want the diff char to pop more (bolder) and the unchanged part to stay neutral, not get tinted green.
**Did:** The `.env-sync-d-old`/`.env-sync-d-new` wrappers used a tinted fill (`#fef2f2`/`#f0fdf4`) which bled into the equal text and made the whole side look "green" or "red" even though only one char differed. Stripped the per-side fill — sides now have only a thin border (`.env-sync-d-old` 1px `#fecaca` border on a near-white fill, `.env-sync-d-new` 1px `#bbf7d0` border on a near-white fill) so the compartments read as "old side / new side" without colouring the unchanged text. Removed the outer `.env-sync-d-change` background/border too — only the diff segments (`env-diff-del` red `#fecaca` bg + bold, `env-diff-ins` green `#bbf7d0` bg + bold) carry the strong colour, and they sit on plain `--text` for the equal parts. So `abcxyz → abcxyc` now reads as `(red border) −abcxy z | +abcxy c` (green border) with only `z` and `c` bold and colour-saturated; everything else is neutral.
**Needs next:** Phase 3 sync spike.

### 2026-07-25 — Sync-env: character-level git diff
**User asked:** Strikethrough is wrong (suggests delete); whole-line red/green loses the actual diff signal — only the changed characters should pop, like real git word-diff.
**Did:** Added `diffTokens()` to `envSync.ts` — word-level LCS over whitespace tokens, optionally refined with char-level LCS for runs of single whitespace-less tokens (whole URLs / paths). Three segment kinds: `equal` / `removed` / `added`. The new `env-diff-eq` span uses `--text` (so unchanged chars stay neutral), `env-diff-del` red + `fecaca` bg + bold, `env-diff-ins` green + `bbf7d0` bg + bold — colour is targeted only at the characters that actually changed. Renderer pieces are imported + the inline `renderDiffSide()` helper emits three span classes per adjacent segment. URL `…/v1` → `…/v2` now renders as `…/api/v` neutral + red `1` + green `2`. `same` row still shows muted `= value` so no-op replaces don't look false-positive. Self-check covers URL refine, identical-short-circuit, fully-different, and word-boundary (`foo bar` vs `foo baz` keeps `foo ` equal). Removed stripe-strikethrough colour stays consistent with the tag chips (add/replace) and the inner pills (`env-sync-pill`).
**Needs next:** Phase 3 sync spike.

### 2026-07-25 — Sync-env modal: wider & roomier (round 2)
**User asked:** Sync env variables modal is still too tight — value column is truncating long URLs.
**Did:** Modal box bumped 720px→900px (96vw). `.env-sync-val` column expansion: `minmax(220px, 2.2fr)` (was `1.6fr`) so URLs can stretch to ~400px before ellipsis; column gap 14→16px, item padding 10×14→11×16px. `.env-sync` and `.env-sync-row` no longer force min-width on the layout (let the modal cap govern) so the list fills the new wider body cleanly. `.env-sync-key` now has a 120px floor before it can shrink. Full value is already reachable via the existing in-app `data-tip` tooltip on `.env-sync-val` (hover for the un-truncated URL).
**Needs next:** Phase 3 sync spike.

### 2026-07-25 — Fix VarField double-text glitch
**User asked:** Black text from input + blue mirror text are rendering on top of each other → ghost/double-text.
**Did:** Root cause: `.kv-row input:not([type="checkbox"]) { color: var(--text) }` was more specific than `.var-field .vf-input { color: transparent }`, so the visible input rendered black ON TOP of the colored mirror → two blacks + a blue offset = glitch. Fixed by scoping the `.kv-row` rule to direct-child (`>`) inputs, so it no longer reaches `.vf-input` (which is nested inside `.var-field`); also added `-webkit-text-fill-color: transparent` as a Chromium/WebKit-grade override so no stray `color` rule can reshow input text.
**Needs next:** Phase 3 sync spike.

### 2026-07-25 — Stop VarField "glitchy" overlay
**User asked:** Why is the VarField rendering glitchy?
**Did:** Previous overlay-on-top layout stacked an opaque `<input>` at z=1 with a transparent-text highlight `<div>` at z=2; form-control text vs span text misaligned by a subpixel, giving the ghost/shimmer effect. Switched back to the proven URL-bar pattern: mirror (`vf-mirror`, z=0, colored text + highlighted `vf-var`) under a transparent `vf-input` (z=1, transparent color but visible caret) with a `vf-hit` layer (z=2) that only the `{{var}}` spans get pointer events on. Password fields now skip the overlay entirely (`vf-input-plain`) so the OS-masked dots show.
**Needs next:** Phase 3 sync spike.

### 2026-07-25 — Match URL-bar input look across fields
**User asked:** VarField feels bolder than the URL bar — make Params / Body / JSON / Auth inputs same UI as URL.
**Did:** Root cause was VarField + `.kv-row`/`.mp-*` inputs used the body sans-serif font at 34px; URL bar uses `var(--mono)` 32px. Aligned `.var-field`, `.vf-input`, `.vf-overlay`, `.kv-row input`, `.mp-key`/`.mp-value`, and `.var-field.ui-input` (auth) to the same typography as the URL bar: 32px tall, `--mono`, 0 10px padding, accent focus ring.
**Needs next:** Phase 3 sync spike.

### 2026-07-25 — VarField visible text + JSON var typing
**User asked:** Params/Header/body/Auth `{{var}}` field shows white/invisible text; popover works but field unclear. Also: does JSON int vs string substitution work? Get Species path var also broken in UI.
**Did:** Simplified `VarField` — one visible input (`vf-input`) + overlay (`vf-overlay`) that paints only the blue/red `{{var}}` spans as hover anchors; literal text always shows in `var(--text)`. Verified path-var pipeline on the wire: Get Species via MCP `run_request` → `resolvedUrl: …/pokemon-species/aegislash` (substitution already correct; the screenshot " Get Species path var problem" was the same text-rendering issue). Documented JSON int-vs-string substitution in `docs/MCP.md` — env vars are strings, the surrounding JSON quotes decide type.
**Needs next:** Phase 3 sync spike.

### 2026-07-25 — {{var}} hover-edit beyond URL bar
**User asked:** What about input fields / JSON body / other places we use `{{vars}}`?
**Did:** Shared `EnvVarHover` (`VarField` + `EnvVarPop`). Wired hover-edit into Params (query+path), Headers, urlencoded/multipart values, Auth fields, and JSON/text body CodeMirror (`cm-env-var` marks). Env editor table stays plain (editing vars themselves).
**Needs next:** Phase 3 sync spike.

### 2026-07-25 — Keep {{vars}} unencoded in query URL
**User asked:** `{{value}}` in Params can’t hover-edit; request URL shows `%7B%7Blimit%7D%7D` instead of `{{limit}}`.
**Did:** Root cause: `joinUrl` used `encodeURIComponent` on query values, mangling braces so UrlField `tokenizeUrl` / crumb `substituteVars` never saw `{{vars}}`. Added `encodeQueryPart` in `envVar.ts` (encode around, leave `{{…}}` literal); `joinUrl` uses it. Self-check asserts; stored List Pokémon URL was already clean.
**Needs next:** Re-open or touch Params on open tabs that already show encoded URLs so they recompose; Phase 3 sync spike.

### 2026-07-25 — Fill PokéAPI workspace via MCP
**User asked:** Use Inpost MCP; fix what's needed; fill docs, request fields, environments + variables in the poke workspace.
**Did:** Via MCP on workspace `PokéAPI`: deleted 6 junk Untitled requests; fixed Type URL junk query; set collection Markdown docs; polished Global / Prod / Dev env vars (`baseUrl`, resource names, `pokemonId`, `limit`/`offset`, `accept`/`userAgent`); updated all 10 requests with Overview docs, `Accept`/`User-Agent` headers, path vars wired to `{{env}}`, env-driven URLs. Smoke `run_request`: List Pokémon / Get Pokémon (ditto) / Get Type (flying) → 200.
**Needs next:** Phase 3 sync spike.

### 2026-07-25 — Clarify MCP Local vs Prod compare via run_request
**User asked:** Can MCP switch env and hit a request — e.g. compare Local vs Prod with the same request?
**Did:** Confirmed already supported: `run_request({ requestId, environmentId })` uses that env for the call only (Global still merges); omit = active env. Documented the two-call Local/Prod pattern in the tool description + `set_active_environment` note (prefer per-call id over flipping UI active). Rebuilt MCP; updated `docs/MCP.md`.
**Needs next:** Restart / refresh MCP so Cursor sees the clearer tool text.

### 2026-07-25 — Fix bridge compile (early return type)
**User asked:** Terminal showed `error[E0308]` in `bridge.rs` after MCP collection description work.
**Did:** Replaced `return json_err(...)` inside the create-collection handler (wrong: that returns from the outer `Result<(), ()>` fn) with a nested match that always yields a `Response`.
**Needs next:** Dev rebuild should succeed; Phase 3 sync spike.

### 2026-07-25 — MCP documentation tools + field guidance
**User asked:** Integrate docs into MCP; tool descriptions should say what/how to write and what is / isn't available on the documentation field.
**Did:** Bridge: `POST /v1/collections` accepts optional `description`; new `PATCH /v1/collections/{id}` → `set_collection_description`. MCP: shared `DOC_FIELD_GUIDE` (CommonMark allow-list vs HTML/Editor.js/uploads/folder docs); `create_collection` + new `set_collection_description`; enriched `create_request` / `update_request` / list/get/import/export tool + zod `.describe()` text; `update_request` preserves existing description when the param is omitted (pass `""` to clear). Rebuilt `stdio.mjs`. Updated `docs/MCP.md`.
**Needs next:** Restart Inpost (or re-copy MCP) so Cursor picks up the new tool list; Phase 3 sync spike.

### 2026-07-25 — Postman-style docs rendering + collection documentation
**User asked:** Overview textarea not intuitive — render docs Postman-style with UI-based editing, centered article layout; same for collection documentation; evaluate Editor.js.
**Did:** Rejected Editor.js (block-JSON isn't valid OpenAPI CommonMark; lossy converters both ways) — kept Markdown as storage, added `markdown-it` (html:false → XSS-safe) for rendering. New `src/mdEdit.ts` (pure toolbar actions: bold/italic/strike/headings/lists/quote/code/codeblock/link with toggle + selection math; self-check wired into `npm run check`). New `src/Docs.tsx`: `Markdown` (external links via opener plugin), `MarkdownEditor` (Write/Preview tabs + toolbar + Ctrl+B/I/K), `DocArticle` (centered 760px article, title, meta, Edit/Done toggle, empty-state CTA). Request Overview tab now renders `DocArticle` with method+resolved-URL chip (saves via existing draft/dirty flow). Collection docs: new `__coldoc__:<id>` pseudo-tab (strip render, switch/close/fallback, tab search "docs" kind), `CollectionDocView` with explicit Save via `set_collection_description`, opened from collection context menu → Documentation. CSS: `.doc-*`, `.md-body`, `.md-editor*`.
**Needs next:** Docs polish backlog item (images, folder descriptions, full collection doc page listing all requests).

### 2026-07-25 — Export reveal works on WSL + real desktops
**User asked:** Is the OpenURI DBus error expected on this WSL setup, and will Show-in-folder work on real Windows/macOS/Linux builds?  
**Did:** Confirmed: export itself was fine; opener’s Linux path needs FileManager1/xdg-desktop-portal, which WSL doesn’t provide — so the red “Request error” was a false alarm from piping reveal failures into the HTTP error pane. Fixed `reveal_path` to try opener first, then platform fallbacks (Windows `explorer /select`, macOS `open -R`, Linux `xdg-open` dir, **WSL → `wslpath -w` + `explorer.exe /select`**). Reveal errors stay on the toast. Export now prefers/creates `~/Downloads` instead of dumping into `$HOME` when XDG Downloads is missing.  
**Needs next:** Phase 3 sync spike.

### 2026-07-25 — Export toast with Show in folder
**User asked:** No feedback on export; want a "file exported" notification with show-containing-folder and dismiss so the user sees where it went.  
**Did:** `export_openapi` command now writes the spec straight to the Downloads folder (sanitized collection name, ` (n)` de-dupe) and returns the path — replaces the opaque blob-anchor download. New `reveal_path` command wraps `tauri_plugin_opener::reveal_item_in_dir` (Rust side, no capability scope needed). Frontend shows a bottom-right toast (`.export-toast`) with the full path, **Show in folder**, **Dismiss** (×), and 8 s auto-dismiss.  
**Needs next:** Phase 3 sync spike.

### 2026-07-25 — Import OpenAPI modal (drop / browse / paste)
**User asked:** Import button currently opens the OS native file picker; want a modal with drop file, browse, or paste code.  
**Did:** Replaced the hidden `<input type=file>` Import control with a button that opens an Import OpenAPI modal (reuses `Modal`). File tab: drag-drop zone + Browse files (JSON/YAML/YML, 100 MB cap). Paste tab: textarea for raw OpenAPI. Import invokes existing `import_openapi`. Optional `className` on `Modal` for wider dialog.  
**Needs next:** Phase 3 sync spike.

### 2026-07-25 — OpenAPI overview/docs round-trip (first slice)
**User asked:** Add OpenAPI overview/documentation so it shows in the UI and can be exported/edited/updated — then "implement it".
**Did:** Added `description` to requests + collections end to end. DB migration (`ALTER TABLE requests/collections ADD COLUMN description`), `HttpRequest`/`Collection` structs + all request SQL (list/get/upsert) and collection SQL. Core `openapi.rs`: import maps `operation.description`→request and `info.description`→collection; export emits both (signature now `export_openapi(name, description, reqs)`); tests updated. `openapi_ops.rs` wires import/export through. New `set_collection_description` Db method + Tauri command (registered). MCP `create_request`/`update_request` gained optional `description`. Frontend: `description` on `HttpRequest`/`SavedSnap` types, normalize/snap/dirty tracking, new **Overview** request tab (textarea bound to `draft.description`, dirty-dot, saved via existing `upsert_request`), CSS `.overview-pane`. Rebuilt MCP bundle. All checks pass (`cargo test -p inpost-core`, `tsc --noEmit`, `cargo build -p inpost`).
**Needs next:** No collection detail view exists to surface `collections.description` editing in the UI — backend/command ready, UI wiring is a follow-up. Overview is a plain textarea; Markdown rendering deferred.

### 2026-07-25 — Params column label alignment
**User asked:** PARAM / VALUE / DESCRIPTION labels not aligned with their input fields (twice — first pass still off).  
**Did:** Two causes: (1) head vs row had different trailing column widths (`minmax(96px,auto)` for Bulk edit vs `28px` for ×); (2) the follow-up `padding-right: 108px` on the header squeezed its grid narrower than the rows. Final: ···/Bulk edit live in their own `.kv-toolbar` row above the header, header and rows share the identical grid (`28px 1fr 1.4fr [1fr] 28px`), labels inset 10px to match input text.  
**Needs next:** Phase 3 sync spike.

### 2026-07-25 — Resolved URL on status bar
**User asked:** Show the resolved URL on the status bar too, like the breadcrumb.  
**Did:** Status bar right slot now renders `resolvedUrl` (same `resolveRequestUrl` memo the crumb uses — env vars + path placeholders applied) instead of the raw `composedUrl`, with the full string in a `data-tip` since it truncates.  
**Needs next:** Phase 3 sync spike.

### 2026-07-25 — OpenAPI docs/overview research
**User asked:** Research what OpenAPI documentation/overview fields we import/export/store and gaps for editable Overview UI that round-trips.  
**Did:** Research only. Core import/export is minimal path→request (`openapi.rs`); no description/docs columns in DB; request tabs are Params/Headers/Body/Auth only (no Overview); param Description UI is ephemeral. Full gap map + first-slice recommendation in chat report.  
**Needs next:** If building: migrate `requests.description` (+ optional `collections.description`), Overview tab, wire import/export; later param/response/schema docs.

### 2026-07-25 — Params tools + conditional path variables
**User asked:** Only show Path variables when placeholders exist; add `…`, Bulk edit, and a hidden Description column that can be enabled.  
**Did:** Params Query table now has `…` → Description toggle and Bulk edit (`key:value`, one per line). Description adds an editable column; Path variables render only when the URL contains `{name}` / `:name` and get the same Description toggle (no bulk edit because keys are URL-derived).  
**Needs next:** Persist optional param descriptions if request metadata storage is expanded; Phase 3 sync spike.

### 2026-07-25 — Boxy multipart form-data body
**User asked:** Work on boxy multipart/form-data (Text/File rows like the screenshot).  
**Did:** `MultipartTable` — card rows with enable · key · Text/File select · value or Choose file · trash. Body pairs JSON keeps `{key,value,type}`; send still flattens to `(k,v)` for Rust. `httputil::parse_kv_pairs` accepts tuple + object forms (bridge/OpenAPI). File pick stores display name only — wire bytes still deferred.  
**Needs next:** Multipart file bytes on send; Phase 3 sync spike.

### 2026-07-25 — Custom header suggest input
**User asked:** Header name datalist/select design is crap — make a custom input.  
**Did:** Replaced native `<datalist>` with `SuggestInput` in `ui.tsx`: filtered menu (prefix-first), match highlight, ↑↓/Enter/Tab/Esc, portaled fixed menu so it isn’t clipped by the headers pane. PairTable header keys use it.  
**Needs next:** Phase 3 sync spike.

### 2026-07-25 — Response Headers scroll
**User asked:** Response Headers tab has no scroll (long lists clipped).  
**Did:** `.response-pane > .kv-table.read-only` gets `flex:1; min-height:0; overflow:auto` so the header list scrolls inside the pane. Long values wrap (`word-break`) instead of ellipsizing off-screen.  
**Needs next:** Phase 3 sync spike.

### 2026-07-25 — URL bar undo/redo
**User asked:** URL bar has no undo/redo for typed, overridden, cleaned, or deleted text.  
**Did:** Same pattern as search — controlled `UrlField` keeps its own undo/redo stack (`Ctrl+Z` / `Ctrl+Shift+Z` / `Ctrl+Y`). Covers typing and external rewrites (Params sync). Stack resets on `historyKey` (selected request) so tab switches don’t leak history.  
**Needs next:** Phase 3 sync spike.

### 2026-07-25 — Resolved URL preview in crumb
**User asked:** After the request title (e.g. Type — Flying), show the actual rendered URI with vars parsed.  
**Did:** Added `substituteVars` / `applyPathVars` / `resolveRequestUrl` in `envVar.ts` (same order as Rust send: env-sub path values → path placeholders → env-sub URL). Crumb row now shows the live resolved URL after the title (mono, truncated, full string in tip). Updates as env/path/query/URL change.  
**Needs next:** Phase 3 sync spike.

### 2026-07-25 — Sync Params ↔ URL bar
**User asked:** Params edits don’t update the URL bar (Requestly shows `?key` live).  
**Did:** UrlField now binds to `composedUrl` (`joinUrl(urlBase, query)`) instead of bare `urlBase`. Typing in the bar runs `splitUrl` → updates both base and query (and path pairs from the base). Editing/adding/disabling Params immediately rewrites the `?…` in the URL.  
**Needs next:** Phase 3 sync spike.

### 2026-07-25 — Search bar undo + gentler Backspace
**User asked:** Undo doesn’t work on the search bar; Backspace sometimes wipes the filter chip.  
**Did:** Controlled input + chips break the browser undo stack — added a query undo/redo stack (`Ctrl+Z` / `Ctrl+Shift+Z` / `Ctrl+Y`) covering typing, chips, clear, and suggestion commits. Empty-input Backspace now *uncommits* the last chip back to editable text (`in:Foo`) via `uncommitLastChip()` instead of deleting it; further Backspaces edit char-by-char, and undo restores the chip.  
**Needs next:** Phase 3 sync spike.

### 2026-07-25 — Collection ··· Export as OpenAPI 3.0
**User asked:** Add export to the collection ··· menu; OpenAPI 3.0 only, in the correct format so exported files re-import.  
**Did:** Collection More menu now has **Export as OpenAPI 3.0** (Rename · Export · Delete), targeting that specific collection (`exportOpenApi(id)`; menu height bumped). Export is faithful per body type: `ExportRequest` gained `body_type` + `body_pairs_json`; new `request_body_for()` emits `application/json` (parsed example), `text/plain`, or form `schema.properties` + `example` for `x-www-form-urlencoded` / `multipart/form-data`; `none` omits `requestBody`. `openapi_ops::export_from_db` passes the new fields. Tests: round-trip asserts JSON requestBody; `export_form_body_content_type` asserts urlencoded schema/example.  
**Needs next:** Phase 3 sync spike.

### 2026-07-25 — Request/response tabs Phase A–C
**User asked:** Implement request & response tabs gap plan (body types → Auth → polish).  
**Did:** Schema: `body_type`, `body_pairs_json`, `auth_type`, `auth_json`, `path_vars_json`; history `headers_json`. Core `httputil` encode/auth/path + tests. UI: Body type radios, Auth tab, Params Query+Path, header datalist autocomplete, response History tab; Content-Type sync; send/MCP apply auth+forms. OpenAPI maps body types. MCP create/update accept new fields. `src/reqMeta.ts` self-check in `npm run check`.  
**Needs next:** Phase 3 sync spike; scripts/OAuth/cookies later.

### 2026-07-25 — Scope suggestions in global search
**User asked:** Typing `in:` / `from:` should show the matching values first; it wasn’t working (`in:moves` dead-ended because Moves is a folder, not a collection).  
**Did:** `trailingScope()` + `scopeSuggestions()` in `searchQuery.ts`: a half-typed `key:value` lists the real values from the index (workspaces for `from:`, collections for `in:`, folders for `folder:`), narrowed by the chips already set. When the typed key has no match it falls back to the other keys, so `in:moves` offers `folder:Moves`. Palette shows them as the first group; ↑↓ spans suggestions + hits, Enter/Tab commits the chip, Enter on a hit still opens it. Asserts added to the `searchQuery` self-check.  
**Needs next:** Phase 3 sync spike.

### 2026-07-25 — Search tabs keyboard nav
**User asked:** Arrow keys should move selection in Search tabs; Enter opens the highlighted tab (keyboard-focused).  
**Did:** ↑/↓ cycle highlight (wraps), Enter opens highlighted match, typing resets highlight to first; mouse hover also moves highlight; `.kbd` style + scroll-into-view.  
**Needs next:** Phase 3 sync spike.

### 2026-07-25 — Search tabs + fixed env width
**User asked:** Add Search tabs (like the screenshot); make env picker a fixed width so long/short names don’t shift layout, truncate with ….  
**Did:** Chevron after `+` opens a Search tabs popover (filter + method/name/dirty; Enter picks first; Esc/outside closes). Shortcut `Ctrl+Shift+A` (`searchTabs` in `shortcuts.ts`). Env select locked to `152px` with ellipsis on the trigger and menu options.  
**Needs next:** Phase 3 sync spike.

### 2026-07-25 — API client editor feature research
**User asked:** Research request/response editor tabs/fields in Hoppscotch, Insomnia, Bruno, Yaak + Postman-like norms; MVP vs later split.  
**Did:** Consolidated checklist from docs/source (Bruno `.bru` schema, Hoppscotch types, Insomnia/Yaak panes, Postman response viewer). No code changes.  
**Needs next:** Use checklist when expanding request/response editor; Auth/scripts/GraphQL still backlog.

### 2026-07-25 — Hide tab strip scrollbar
**User asked:** The scrollbar makes the tab navigation bad UI.  
**Did:** Hid the tab strip scrollbar entirely (`scrollbar-width: none` + `::-webkit-scrollbar { display: none }`) like browser tab bars. Kept it navigable: plain vertical wheel now scrolls the strip horizontally, and the active tab auto-scrolls into view on switch/open (`scrollIntoView` effect in `App.tsx`).  
**Needs next:** Phase 3 sync spike.

### 2026-07-25 — Env dropdown on tab bar (browser +)
**User asked:** Move env dropdown after the + on the tab bar; + follows last tab and stays at the end when tabs overflow (browser-like).  
**Did:** Removed env picker from the URL bar. Tab strip is now `[tabs…][+ sticky] | [env]`. `+` lives inside the scroll row (`position: sticky; right: 0`) so it rides after the last tab and pins at the trailing edge when there’s no room. Env select pinned after the scroll area.  
**Needs next:** Phase 3 sync spike.

### 2026-07-25 — Scrub proprietary MCP product name from docs
**User asked:** Remove any references given to that closed desktop API client project from docs/code.  
**Did:** Scrubbed from README, PRD, MCP.md, ARCHITECTURE, TRACE history, `bridge.rs`, `mcp/src/index.ts`; MCP docs describe Inpost’s own localhost bridge + Requestly packaging only.  
**Needs next:** Phase 3 sync spike.

### 2026-07-25 — Left-align workspace trigger name
**User asked:** Workspace name left aligned in the top bar.  
**Did:** `.ws-trigger` / `.ws-trigger-name` `text-align: left` + `justify-content: flex-start` (button default was centering).  
**Needs next:** Phase 3 sync spike.

### 2026-07-25 — Distinct active vs hover in ws picker
**User asked:** Active and hovered rows collide (same blue).  
**Did:** Hover is light gray (`#f1f5f9`); blue `accent-soft` + accent-colored bold name reserved for the active workspace.  
**Needs next:** Phase 3 sync spike.

### 2026-07-25 — Workspace trigger min-width
**User asked:** Increase min width of workspace display in the top bar.  
**Did:** `.ws-trigger` `min-width: 160px` (still caps at 280px with ellipsis).  
**Needs next:** Phase 3 sync spike.

### 2026-07-25 — Fix workspace picker row layout
**User asked:** What’s wrong with the workspace picker UI (gear outside blue / missing on other rows).  
**Did:** Highlight is on the whole `.ws-row` (name + gear); settings icon always visible, not hover-only.  
**Needs next:** Phase 3 sync spike.

### 2026-07-25 — Workspace picker settings gear
**User asked:** Add settings icon next to each workspace name in the picker.  
**Did:** Each ws row gets a hover gear → opens Settings tab on that workspace (`ws:{id}`); name still switches workspace.  
**Needs next:** Phase 3 sync spike.

### 2026-07-25 — Workspace picker max-width + ellipsis
**User asked:** Cap workspace name width; truncate long names with ….  
**Did:** `.ws-trigger` max-width 280px; name uses flex `min-width:0` + ellipsis; tip shows full `Workspace: {name}`.  
**Needs next:** Phase 3 sync spike.

### 2026-07-25 — Global in-app tooltips
**User asked:** Fix oversized native tooltips globally.  
**Did:** Added `TipHost` (`src/tip.tsx`) for `[data-tip]` / `data-tip-side`; converted hover `title=` across App/UrlField/GlobalSearch/Select to `data-tip` (Modal dialog titles kept). Compact 11px tips, viewport-clamped; rail uses `data-tip-side="right"`.  
**Needs next:** Phase 3 sync spike.

### 2026-07-25 — Fix oversized native tooltips on rail
**User asked:** Why are tooltips huge and clipping off the left (Environments / Expand).  
**Did:** Those were OS `title=` tips (WebView draws them big and clips at the window edge). Rail uses compact CSS `data-tip` tips to the right; removed Expand/Collapse `title` on tree twists (aria-label kept).  
**Needs next:** Phase 3 sync spike.

### 2026-07-25 — Filled folder/collection + braces env icon
**User asked:** Fill folder/collection icons; change env icon.  
**Did:** Tree/menu `Folder` + `Layers` use Lucide fill (`Ifill`); env rail/tab/menus/UrlField popover switched from `Variable` → `Braces` (`{{var}}`).  
**Needs next:** Phase 3 sync spike.

### 2026-07-25 — Adopt Lucide icon pack
**User asked:** Use a proper icon pack; check Requestly / Yaak / Bruno.  
**Did:** Yaak uses Lucide, Bruno uses Tabler — went with `lucide-react` (arch ref). Replaced Unicode + hand SVGs across App/GlobalSearch/UrlField/ui (rail, tree, titlebar, tabs, settings, env popover, selects, modals). Dense default `size 12–15` / `strokeWidth 1.75`.  
**Needs next:** Phase 3 sync spike.

### 2026-07-25 — Fix miniature Unicode icons
**User asked:** Why are icons miniatured (search, titlebar, tree +, toggle).  
**Did:** Cause was Unicode glyphs (`⌕`, `⚙`, `─`, `□`, `+`) that optically fill little of the em box. Replaced titlebar/search/toggle with sized SVGs; bumped `.tree-action` / `.opentab-add` font-size and centered them with grid.  
**Needs next:** Phase 3 sync spike.

### 2026-07-25 — Expand/collapse toggle beside search
**User asked:** Make expand/collapse one toggle, keep it beside the search bar.  
**Did:** Replaced the two toolbar buttons with a single toggle (icon + tooltip flip on `anyFolderExpanded`) placed in a `.sidebar-search-row` next to the search field; `expandAllFolders`/`collapseAllFolders` still back it.  
**Needs next:** Phase 3 sync spike.

### 2026-07-25 — Collections sidebar search
**User asked:** Add a search bar (Requestly-style) to collections.  
**Did:** Search field under the explorer toolbar; filters collections by name and the active tree by request name/method/URL and folder name (keeps ancestors, expands matches); clear button; empty “No matches” state.  
**Needs next:** Phase 3 sync spike.

### 2026-07-25 — Collection + / ··· actions
**User asked:** Collections lack + / ··· context actions like Requestly.  
**Did:** Collection rows get Add (HTTP/WS/Folder at root) and More (Rename / Delete); `rename_collection` + `delete_collection` commands; create helpers accept target `collectionId` so add works on inactive collections too.  
**Needs next:** Phase 3 sync spike.

### 2026-07-25 — History Today/Yesterday/Older + title rows
**User asked:** Group history Today/Yesterday/Older; each entry title with small URI + time.  
**Did:** Buckets are only Today/Yesterday/Older; rows show request title (from index/name, else path), muted URL + clock (Older includes date); status stays on the right; opening History refreshes search index for titles.  
**Needs next:** Phase 3 sync spike.

### 2026-07-25 — Env list variable counts
**User asked:** Show counts of values on each environment.  
**Did:** Each Environments sidebar row shows a muted key count (from draft or `varsJson`); tooltip “N variables”; live while editing.  
**Needs next:** Phase 3 sync spike.

### 2026-07-25 — Fix env popup focus jump
**User asked:** Clicking Current value unexpectedly moved focus/cursor to the URL bar.  
**Did:** Restricted the URL wrapper focus handler to clicks on its real DOM descendants; React portal clicks no longer bubble into URL focus behavior.  
**Needs next:** Phase 3 sync spike.

### 2026-07-25 — Sync env vars + env context menu
**User asked:** Sync selected vars between envs (avoid copying one-by-one); right-click rename / duplicate / delete.  
**Did:** `Sync vars` on env editor + context menu “Sync variables…” opens a From→To picker with per-key checkboxes (defaults to missing-only; tags new/overwrite). `src/envSync.ts` merge helper + self-check. Right-click env: Rename / Duplicate / Delete (global undeletable). New Rust `delete_environment` cmd.  
**Needs next:** Phase 3 sync spike.

### 2026-07-25 — Env list row alignment
**User asked:** Env list counts misaligned; unsaved before count; left green only on active with text aligned.  
**Did:** Left `env-active-slot` reserved always, paints only when active. Right trail is `[dirty-slot][count]` with fixed widths so 0/1/2 stay in one column; dirty (draft ≠ saved) paints before the count. Removed always-on green `env-mark` and trailing active-dot.  
**Needs next:** Phase 3 sync spike.

### 2026-07-25 — Gate inspector behind developer mode
**User asked:** Don't let the user inspect until developer mode is on.  
**Did:** New **Settings → General → Developer** toggle (`inpost.devMode` in localStorage, default off). While off, a capture-phase guard blocks the right-click menu and inspector keys via new `isInspectKey()` in `shortcuts.ts` (F12, Ctrl+Shift+I/J/C, Cmd+Alt+I, Ctrl+U); asserts added to the shortcuts self-check.  
**Needs next:** Phase 3 sync spike; drop the Tauri `devtools` feature in release builds for a hard block.

### 2026-07-25 — Fix invisible sash
**User asked:** Sash not seen after slim pass.  
**Did:** Removed `pointer-events: none` on `::after` (it killed hit-testing on the 0-width sash). Replaced subpixel 0.5px gradient with a solid 2px centered accent line so hover/drag is visible again.  
**Needs next:** Phase 3 sync spike.

### 2026-07-25 — Slimmer, smoother sashes
**User asked:** Sash too bold; drag not quick/smooth/responsive.  
**Did:** Visual line is 1px (hit area still ~6px). Drag updates layout via DOM/`--sidebar-w` during move (no React re-render per pixel); React state commits on pointer-up. Disabled pane pointer-events while dragging.  
**Needs next:** Phase 3 sync spike.

### 2026-07-25 — Resizable sash dividers
**User asked:** Add drag lines to expand/shrink panels (sidebar + request/response).  
**Did:** VS Code-style sashes: vertical between sidebar and workspace; between request/response (col when docked right, row when docked bottom / narrow). Sizes (`sidebarWidth`, `splitRatio`) persist per workspace session. Accent highlight on hover/drag.  
**Needs next:** Phase 3 sync spike.

### 2026-07-25 — Persist per-workspace UI session
**User asked:** Save state like open tabs, dock position, etc.  
**Did:** New `src/workspaceSession.ts` (localStorage map per workspace): openTabs, selectedId, collectionId, layoutDock, responseHidden, rail, expandedFolders, settingsSection, envViewId. Boot hydrates; changes auto-save; workspace switch / new / search / settings-switch snapshot+restore. Self-check wired into `npm run check`.  
**Needs next:** Phase 3 sync spike; optional Description field / danger-zone delete on workspace settings panel.

### 2026-07-25 — Settings Workspace separator
**User asked:** Add a settings nav separator titled Workspace listing all workspaces; click opens that workspace’s settings.  
**Did:** Settings nav now has a `Workspace` separator with every workspace name (Active badge on current). Click opens a panel: rename, copy workspace ID, switch (keeps Settings tab open). Added `rename_workspace` Rust cmd + db helper.  
**Needs next:** Phase 3 sync spike; more per-workspace settings if needed.

### 2026-07-25 — Env var popover layout + icon
**User asked:** Broken UI on env var edit popup; inconsistent environment icon.  
**Did:** Constrained form grid (`minmax(0,1fr)` + full-width inputs) so fields no longer spill; aligned label/input rows; swapped hamburger for rail `⌥` chip icon.  
**Needs next:** Phase 3 sync spike.

### 2026-07-25 — Env var hover popover on URL
**User asked:** Hover on `{{var}}` like Requestly (view details + edit value).  
**Did:** `UrlField` replaces plain URL input — blue dotted `{{vars}}`, hover popover (env name, name/type/value, Edit); edit mode Save/Cancel writes active env via `saveEnvVar`; missing vars in red; `src/envVar.ts` tokenize/resolve + self-check in `npm run check`.  
**Needs next:** Phase 3 sync spike.

### 2026-07-25 — Fix Ctrl+Shift+Tab previous tab
**User asked:** Ctrl+Shift+Tab not working.  
**Did:** Stabilized shortcut listener via ref (no rebind every render); stronger Tab/Shift detection (`code`/`keyCode`/`getModifierState`); added **Ctrl+PageUp** / **Ctrl+PageDown** aliases because WebKit/WSLg often eat Ctrl+Shift+Tab before JS. Settings notes updated.  
**Needs next:** Phase 3 sync spike.

### 2026-07-25 — Stop Tab focus steal on shortcuts
**User asked:** Why are Shift/Ctrl+Tab still shifting focus on inputs?  
**Did:** Shortcut keydown now listens in **capture** (`addEventListener(..., true)`) and `stopPropagation`s after `preventDefault`, so the browser never runs reverse-tab focus before we handle env/tab cycling; matcher also accepts `code === "Tab"`.  
**Needs next:** Phase 3 sync spike.

### 2026-07-25 — Shift+Tab always env; Ctrl+Tab cycles tabs
**User asked:** Always use Shift+Tab for env; Ctrl+Tab to cycle open tabs.  
**Did:** Shift+Tab always cycles env (even in fields); Ctrl+Tab / Ctrl+Shift+Tab cycle open tabs via `nextInCycle` + `switchTab`; Settings + empty-response hints updated from `SHORTCUTS` table.  
**Needs next:** Phase 3 sync spike.

### 2026-07-25 — Dock + environment shortcuts
**User asked:** Ctrl+J hide/show response dock, Ctrl+Alt+↓/→ to dock bottom/right, Shift+Tab to cycle environments; list them in Settings.  
**Did:** New `src/shortcuts.ts` (single `SHORTCUTS` table + `matchShortcut` / `isTypingTarget` / `nextEnvId`, self-check wired into `npm run check`); App keydown handler switches on it; `responseHidden` hides the response pane via CSS (stays mounted, so results survive); `applyDock()` centralises dock set+persist for keys, dock button, and Settings; Settings → **Keyboard** section and the empty-response hints both render the table. Shift+Tab is skipped in inputs/textareas/CodeMirror so fields keep reverse-tab.  
**Needs next:** Phase 3 sync spike.

### 2026-07-25 — Smoke-tested PokéAPI via MCP
**User asked:** Try some requests.  
**Did:** Ran 5 GETs through Cursor MCP (`run_request`): Species Aegislash, Get Ditto, Ability Battle Armor, Type Flying, Evolution Eevee — all 200; each row present in `request_history` with resolved URLs.  
**Needs next:** Phase 3 sync spike.

### 2026-07-25 — MCP runs now recorded in History
**User asked:** Fix MCP `run_request` hits missing from History.  
**Did:** Bridge `run_request` (`bridge.rs`) now inserts a `HistoryEntry` after execution (success + error paths), using new `Db::workspace_for_collection` to resolve the workspace. Same table/cap as UI inserts. Verified E2E: ran `Berry — Cheri` via Cursor MCP → row landed in `request_history` (200, correct request_id, resolved URL).  
**Needs next:** Phase 3 sync spike.

### 2026-07-25 — Diagnose MCP history gap
**User asked:** Why MCP `run_request` hits do not appear in request/workspace History.  
**Did:** Traced both paths: UI `send()` explicitly calls `insert_history`; bridge `/v1/run` calls `http_exec::send` directly and returns without inserting history. MCP bridge logs are separate diagnostics, not request history.  
**Needs next:** Move history recording into a shared Rust execution path used by UI and MCP.

### 2026-07-25 — CJK glyphs in response JSON
**User asked:** Lang not rendered (ja/ko tofu boxes) on Species — Aegislash vs Requestly; hit again.  
**Did:** Re-ran request via MCP (200, body has real ja/ko); root cause was `IBM Plex Mono` with no CJK coverage. Added `--mono` stack with system CJK/emoji fallbacks; applied to all mono/editor CSS.  
**Needs next:** Phase 3 sync spike.

### 2026-07-25 — PokéAPI workspace via MCP (E2E test)
**User asked:** Use all MCP tools to set up a workspace for https://pokeapi.co (free, no auth).  
**Did:** Via Cursor MCP: `PokéAPI` workspace → `PokéAPI v2` collection → 5 folders (Pokémon / Species & Evolution / Types & Abilities / Moves / Items & Berries) → 10 `{{baseUrl}}` GET requests → active env `PokéAPI Prod` (`baseUrl`, `spriteBase`) → reorder folders → `run_request` ×2 (200 OK, env substitution verified) → `export_openapi` OK. MCP bridge confirmed working end-to-end after shebang fix.  
**Needs next:** Phase 3 sync spike.

### 2026-07-25 — Dirty tab + breadcrumb rename
**User asked:** Show saved/unsaved status; move request name edit to breadcrumb (click to title/rename).  
**Did:** Removed URL-bar name input; breadcrumb title click → inline rename; blue dirty dot on request tabs via saved snapshot vs live draft/cache; Save/tree-rename update snap. Also re-wired broken tree ···/inline rename.  
**Needs next:** Phase 3 sync spike.

### 2026-07-25 — Fix stdio.mjs double shebang
**User asked:** Cursor MCP log: `SyntaxError: Invalid or unexpected token` at `#!/usr/bin/env node` line 2.  
**Did:** esbuild `--banner:js` duplicated the shebang already in `src/index.ts`; dropped the banner flag, rebuilt, copied fixed bundle to app data.  
**Needs next:** Phase 3 sync spike.

### 2026-07-25 — MCP status + logs
**User asked:** MCP port/running status on Settings + status bar (green/red); click to read logs.  
**Did:** `BridgeState` + ring log (200); `mcp_status` / `mcp_logs`; Settings Status card (dot, port, URL, Logs); statusbar “Inpost MCP · :port” popover with recent bridge requests.  
**Needs next:** Phase 3 sync spike.

### 2026-07-25 — Settings inset padding
**User asked:** Don’t start immediately — add padding so settings sits a bit inside (first pass read as “nothing changed”).  
**Did:** `.settings-view` padding 40/48 + 40px nav↔panel gutter (was 20/28 + 8px); cards widen to 860px; slightly roomier card rows.  
**Needs next:** Phase 3 sync spike.

### 2026-07-25 — Folder menus open outside sidebar
**User asked:** Show folder action menus outside — they were hiding tree content.  
**Did:** Position fixed portal menus to the right of the +/··· trigger (over the main pane), flip left only if off-screen.  
**Needs next:** Phase 3 sync spike.

### 2026-07-24 — Settings Cursor match
**User asked:** Settings still doesn’t feel like Cursor.  
**Did:** Flipped to Cursor recipe — white canvas, soft grey inset cards (no shadow), capped content width, quieter nav/search, chip-style Copy actions.  
**Needs next:** Phase 3 sync spike.

### 2026-07-24 — Settings floating polish
**User asked:** No dividers; more space; separate floating cards.  
**Did:** Removed nav/panel dividers & row borders; soft grey canvas; white floating cards with shadow + more padding/gaps.  
**Needs next:** Phase 3 sync spike.

### 2026-07-24 — Fix folder menu cutoff
**User asked:** Why folder + / … action menus are cut off.  
**Did:** Sidebar `overflow: auto` clipped absolute menus; menus now portal to `document.body` with `position: fixed` from the trigger button.  
**Needs next:** Phase 3 sync spike.

### 2026-07-24 — Settings UI polish
**User asked:** Make settings UI similar to Cursor Settings (sidebar + cards).  
**Did:** Restyled Settings: search + icon nav; card groups with title/desc/control rows; General layout dock (Right/Bottom); MCP copy actions unchanged.  
**Needs next:** Phase 3 sync spike.

### 2026-07-24 — Folder row + / … actions
**User asked:** Folder actions like Requestly — `+` and `...` on folder rows.  
**Did:** `+` menu (HTTP / WebSocket / Folder into that folder); `...` menu (Rename / Delete); `rename_folder` command + MCP/bridge PATCH.  
**Needs next:** Phase 3 sync spike · request-row `...` later if needed.

### 2026-07-24 — Settings tab (titlebar + MCP)
**User asked:** Settings before minimize on top nav; open like a request tab with left tabs / right content.  
**Did:** Titlebar ⚙ left of window controls opens a Settings open-tab; left nav (General, MCP) + right panel; MCP copies stdio path + Cursor config JSON via `mcp_stdio_path`.  
**Needs next:** Phase 3 sync spike.

### 2026-07-24 — Environment dedicated view
**User asked:** Environments get a separate manage view, not under the request Env tab.  
**Did:** Clicking an env opens a full workspace editor (tab + name/vars/Save/Use/Delete all); removed request “Env” tab; env picker on URL bar still selects active env for `{{var}}`.  
**Needs next:** Phase 3 sync spike · variable types (secret) later.

### 2026-07-24 — Explorer design cleanup
**User asked:** Fix messed-up sidebar design; nested explorer looks crap — make it clean (Requestly-like).  
**Did:** Restored `+ New` / Import toolbar (HTTP/WS/Collection/Environment/Export in menu); compact folder/refresh/collapse icons; removed stacked text links; tree uses CSS nest guides only (no double indent), folder icons, method pills, quieter selection.  
**Needs next:** Phase 3 sync spike.

### 2026-07-24 — Explorer toolbar (VS Code-style)
**User asked:** 4 explorer icons — new request (HTTP/WebSocket), new folder, refresh, collapse all; create relative to selected folder/request like VS Code.  
**Did:** Collections header icon toolbar + HTTP/WS menu; `treeAnchor` targets create parent (folder → inside, request → sibling, collection → root); refresh/collapse; WS placeholder request (send still HTTP-only).  
**Needs next:** Phase 3 sync spike · real WebSocket runtime later.

### 2026-07-24 — Search palette polish
**User asked:** Redundant scope text in search + palette feels flat / lost on dark titlebar.  
**Did:** Input shows free text only (scopes commit to dismissible chips on space); stronger white elevated field + attached results panel with shadow; match highlight in titles.  
**Needs next:** Phase 3 sync spike.

### 2026-07-24 — Sidebar UX (less lost)
**User asked:** Refine sidebar UX/usability — feels lost between Requestly-style rail+tree and Inpost’s stacked controls.  
**Did:** Removed env + collection dropdowns from sidebar; collections shown as a forest (click row to switch/expand); env picker moved to URL bar; lighter + Collection / + Folder / Export subactions; Environments rail stays put when editing; tree nest guides + clearer active collection.  
**Needs next:** Phase 3 sync spike.

### 2026-07-24 — Workspace + per-request history
**User asked:** Sidebar collections/environments/workspace history; response-bar history icon for that request’s responses.  
**Did:** SQLite `request_history` (workspace + request scoped, body capped 256KiB); sidebar History rail loads workspace entries (Today/Yesterday); response ⟳ popover lists this request’s past responses (restore body/status, Delete all).  
**Needs next:** Phase 3 sync spike.

### 2026-07-24 — Scoped global search
**User asked:** Search inside workspace/collection/folder (`from:` / `in:` / `folder:`) like Postman/Requestly.  
**Did:** Palette under titlebar search; scopes `in:collection`, `folder:name`, `from:workspace` (+ quoted values); chips; keyboard nav; opens request/collection/folder; indexes all local workspaces; `searchQuery.ts` self-check in `npm run check`.  
**Needs next:** Phase 3 sync spike.

### 2026-07-24 — Inpost UI kit (modals/selects)
**User asked:** Replace basic native modals/components with a design system used across the app.  
**Did:** Added `src/ui.tsx` + `ui.css` (Button, TextField, Select, Modal, DialogProvider); all prompt/confirm flows use custom dialogs; env/collection/method use Select; Send/Save/etc. use Button.  
**Needs next:** Phase 3 sync spike.

### 2026-07-24 — Titlebar center search
**User asked:** Add center search on top bar (Postman-style); align inner chrome with ref.  
**Did:** Centered “Search requests…” in titlebar grid; Ctrl+K focuses it; removed duplicate sidebar search; Collections header with + New / Import / Export like Requestly.  
**Needs next:** Phase 3 sync spike.

### 2026-07-24 — Workspace picker in titlebar
**User asked:** Move workspace choosing/search to top nav after Inpost (Requestly/Postman style).  
**Did:** Local `workspaces` table; collections scoped by `workspaceId`; titlebar picker with “Search workspaces…” + create; sidebar keeps env only (no duplicate brand); MCP `list_workspaces`/`create_workspace`; OpenAPI import takes workspace.  
**Needs next:** Phase 3 sync spike.

### 2026-07-24 — Tree UX vs Requestly
**User asked:** (screenshots) Inpost sidebar vs Requestly nested trees.  
**Did:** Fixed folder rows crushed by `.tree button { width:100% }` (carets with no names); collection as tree root; compact Import/Export links; path crumb; DEL short labels.  
**Needs next:** Workspaces or Phase 3 sync spike.

### 2026-07-24 — Phase 2 folders + drag-reorder
**User asked:** Proceed with folders/reorder (finish Phase 2).  
**Did:** Nested `folders` table + `folder_id`/`sort_order` on requests; unique sibling names; HTML5 drag-reorder (drop on folder = nest, on request = reorder, collection label = root; Shift+drop on folder = sibling reorder); collection select; MCP `list_folders`/`create_folder`/`delete_folder`/`reorder_siblings`; core tests in `tree.rs`.  
**Needs next:** Workspaces (if sync soon) or Phase 3 sync spike.

### 2026-07-24 — What next?
**User asked:** what next  
**Did:** Pointed to recommended next: Phase 2 folders/drag-reorder (or workspaces if sync is the goal).  
**Needs next:** User pick — folders vs workspaces vs Phase 3 spike.

### 2026-07-24 — TRACE.md + always-on Cursor rule
**User asked:** Log each request as a trace MD so new sessions stay on track.  
**Did:** Created `docs/TRACE.md`; added `.cursor/rules/trace.mdc` (always apply: read/update TRACE).  
**Needs next:** Continue from **Current status → Next up**.

### 2026-07-24 — Terminal errors review
**User asked:** Are fixes needed for tauri compile errors in terminal?  
**Did:** Confirmed latest run is healthy (`Finished` + MCP bridge up). Earlier errors were mid-edit. Silenced dead_code warnings; ensured `resources/mcp` path.  
**Needs next:** None for that issue.

### 2026-07-24 — Phase 2 OpenAPI
**User asked:** Proceed to next phase/feature.  
**Did:** OpenAPI import/export in `inpost-core`; Tauri commands; bridge + MCP `import_openapi`/`export_openapi`; sidebar Import/Export UI; tests in `npm run check`.  
**Needs next:** Folders/reorder or Phase 3 sync spike.

### 2026-07-24 — MCP stdio packaging ethics
**User asked:** Is copying a proprietary third-party `stdio.mjs` unprofessional?  
**Did:** Clarified: study patterns OK; do not copy proprietary files. We use our own MCP + Requestly-style SDK.  
**Needs next:** —

### 2026-07-24 — Phase 1 MCP
**User asked:** Start Phase 1; check open-source MCP repos + localhost bridge pattern.  
**Did:** Designed `session.json` + stdio→localhost bridge; studied Requestly `mcp` (MIT, remote API). Implemented localhost HTTP bridge (`tiny_http`), `session.json`, Node `mcp/` → `stdio.mjs`, tools (collections/requests/envs/`run_request`). Docs: `docs/MCP.md`.  
**Needs next:** MCP settings UI (optional); OpenAPI was next and is now done.

### 2026-07-24 — Workspace hierarchy Q
**User asked:** Multiple workspaces, collections inside — is that standard?  
**Did:** Confirmed Workspace → Collection → Request is standard (Postman/Requestly/Yaak). Inpost still single implicit workspace.  
**Needs next:** Implement workspaces when prioritized.

### 2026-07-24 — “What’s next per plan?”
**User asked:** What next according to plan?  
**Did:** Pointed to Phase 1 MCP then Phase 2 OpenAPI (both since done).  
**Needs next:** See Current status.

### 2026-07-24 — CodeMirror like Yaak
**User asked:** Use same JSON viewer/editor as Yaak for body/response.  
**Did:** CodeMirror 6 + `@codemirror/lang-json` via `@uiw/react-codemirror` for request body + response JSON/raw.  
**Needs next:** —

### 2026-07-24 — Dock toggle (single icon)
**User asked:** Dock to right/bottom; then one toggle not two icons.  
**Did:** Single dock button; icon/tooltip flip between bottom ↔ right; `localStorage` persist.  
**Needs next:** —

### 2026-07-24 — Open request tabs
**User asked:** Where are opened request tabs (Requestly-style)?  
**Did:** Added open-tabs bar (open/switch/close/+); tab cache for in-memory edits.  
**Needs next:** —

### 2026-07-24 — Slim window title bar
**User asked:** Slim the “Inpost” window title bar (not app chrome).  
**Did:** `decorations: false` + custom 28px titlebar (drag, min/max/close). Restart tauri required for decorations.  
**Needs next:** —

### 2026-07-24 — Slim app header stack
**User asked:** Top bar too much.  
**Did:** Removed fat workspace header / breadcrumb / tab row; moved env+actions into sidebar; single slim URL row (later tabs restored separately).  
**Needs next:** —

### 2026-07-24 — Requestly UI
**User asked:** Want Requestly-clean UX; checked org repos for API client source.  
**Did:** Confirmed API Client is closed-source; interceptor/desktop/mcp/ui are other products. Restyled Inpost to Requestly-like light 3-pane shell.  
**Needs next:** —

### 2026-07-24 — Phase 0 UI polish
**User asked:** Proceed next (after tauri running).  
**Did:** Params/headers KV editors, env editor tab, pretty/raw, create collection/env.  
**Needs next:** —

### 2026-07-24 — Install Tauri Linux deps
**User asked:** Build failed on pkg-config/glib.  
**Did:** User installed system packages locally; then `tauri dev` compiled.  
**Needs next:** —

### 2026-07-24 — PRD + project init
**User asked:** Create PRD and init project (Yaak-like architecture; local-first).  
**Did:** `docs/PRD.md`, Tauri+React scaffold, SQLite, HTTP send, envs, MIT, `inpost-core` envsubst tests, README/AGENTS restored after scaffold wipe.  
**Needs next:** Phased build (now through Phase 2 core).

---

## How agents update this file

After finishing work for a user message, **prepend** a new `### YYYY-MM-DD — short title` under **Trace log** with:

```markdown
### YYYY-MM-DD — <title>
**User asked:** …
**Did:** …
**Needs next:** …
```

Also update **Current status** and **Backlog** checkboxes when phase/scope changes.
