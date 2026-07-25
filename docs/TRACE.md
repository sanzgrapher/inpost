# Inpost — session trace & status

**Purpose:** Living log so any new chat stays on track. Agents **read this first**, then **append** after each user request they work on.

**Last updated:** 2026-07-25

---

## Current status (read this first)

| Item | State |
|---|---|
| **Phase** | Phase 0 ✅ · Phase 1 MCP ✅ · Phase 2 ✅ · Local workspaces ✅ · Settings tab ✅ |
| **Next up** | Phase 3 sync-engine spike (PowerSync vs ElectricSQL) |
| **App** | Tauri 2 + React + SQLite · `com.inpost.desktop` · MIT |
| **UX ref** | Requestly (layout/flow) — proprietary app; study screenshots only |
| **Arch ref** | Yaak (Tauri/Rust/React) |
| **MCP ref** | Outpost *pattern* (stdio→localhost bridge+session.json); Requestly MCP *packaging* (open MIT SDK) — do **not** copy Outpost `stdio.mjs` |
| **Run** | `npm run build:mcp && npm run tauri dev` (or `npm run tauri dev` which runs build:mcp first) |
| **Check** | `npm run check` → `cargo test -p inpost-core` + `src/searchQuery.ts` / `src/shortcuts.ts` / `src/workspaceSession.ts` / `src/envVar.ts` / `src/envSync.ts` self-checks |
| **MCP config** | Keep app open; point Cursor at `~/.local/share/com.inpost.desktop/mcp/stdio.mjs` (Linux) / `%APPDATA%\com.inpost.desktop\mcp\stdio.mjs` (Windows) — or copy from **Settings → MCP** |

### Key docs
- [PRD.md](./PRD.md) — product scope & phases  
- [MCP.md](./MCP.md) — MCP architecture notes  
- [ARCHITECTURE.md](./ARCHITECTURE.md) — code layout  

---

## Backlog (not done yet)

- [ ] Phase 3: sync spike (PowerSync vs ElectricSQL vs Zero) then opt-in sync  
- [ ] Phase 4: multi-user roles / presence  
- [ ] GitHub Actions cross-platform builds  
- [ ] Auth tab, scripts, GraphQL/WS (non-goals for v1 / backlog)

---

## Done (summary)

- PRD + project init (Tauri/React/SQLite Phase 0)  
- Requestly-like light UI (slim custom titlebar, open tabs, dock right/bottom, CodeMirror JSON)  
- Env `{{var}}`, collections, send HTTP  
- Phase 1: localhost MCP bridge + bundled `stdio.mjs` + tools  
- Phase 2: OpenAPI import/export + collection folders, unique sibling names, drag-reorder  
- Local **workspaces** (Workspace → Collections) with searchable picker in titlebar  
- Scoped global search + persisted **workspace / per-request** history  
- Sidebar cleaned up (collections forest, env on URL bar) like Requestly rail+tree  
- Settings tab (titlebar ⚙ → open tab; General + MCP copy path/config)  
- Request dirty dot on tabs; rename via breadcrumb (URL-bar name field removed)  
- Shortcut table (`src/shortcuts.ts`) drives handler + Settings → Keyboard + empty-response hints  

---

## Trace log (newest first)

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
**User asked:** Search inside workspace/collection/folder (`from:` / `in:` / `folder:`) like Postman/Outpost.  
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
**User asked:** Move workspace choosing/search to top nav after Inpost (Outpost/Requestly/Postman style).  
**Did:** Local `workspaces` table; collections scoped by `workspaceId`; titlebar picker with “Search workspaces…” + create; sidebar keeps env only (no duplicate brand); MCP `list_workspaces`/`create_workspace`; OpenAPI import takes workspace.  
**Needs next:** Phase 3 sync spike.

### 2026-07-24 — Tree UX vs Requestly/Outpost
**User asked:** (screenshots) Inpost sidebar vs Requestly/Outpost nested trees.  
**Did:** Fixed folder rows crushed by `.tree button { width:100% }` (carets with no names); collection as tree root; compact Import/Export links; Outpost-style path crumb; DEL short labels.  
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

### 2026-07-24 — Outpost stdio.mjs ethics
**User asked:** Is referencing Outpost’s `stdio.mjs` unprofessional?  
**Did:** Clarified: study pattern OK; do not copy proprietary file. We use own MCP + Requestly-style SDK.  
**Needs next:** —

### 2026-07-24 — Phase 1 MCP
**User asked:** Start Phase 1; check Outpost MCP file + open-source MCP repos.  
**Did:** Inspected Outpost `session.json` + stdio bridge pattern; Requestly `mcp` (MIT, remote API). Implemented localhost HTTP bridge (`tiny_http`), `session.json`, Node `mcp/` → `stdio.mjs`, tools (collections/requests/envs/`run_request`). Docs: `docs/MCP.md`.  
**Needs next:** MCP settings UI (optional); OpenAPI was next and is now done.

### 2026-07-24 — Workspace hierarchy Q
**User asked:** Multiple workspaces, collections inside — is that standard?  
**Did:** Confirmed Workspace → Collection → Request is standard (Postman/Requestly/Yaak/Outpost). Inpost still single implicit workspace.  
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
**User asked:** Create PRD and init project (Yaak-like, Outpost feature parity later; local-first).  
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
