# MCP (Phase 1)

## What we learned

### Local stdio → desktop bridge

Common pattern for desktop API clients that expose MCP while the app is running:

| File | Role |
|---|---|
| `stdio.mjs` | Bundled Node MCP (`@modelcontextprotocol/sdk` + `StdioServerTransport`) |
| `session.json` | `{ bridgeUrl, mcpUrl, token }` — written while the desktop app is running |

**stdio is a thin proxy.** Cursor talks stdio → `stdio.mjs` → authenticated HTTP to the **running desktop app** (`bridgeUrl` + `Bearer token`). App must stay open. Tools cover requests, collections, environments, OpenAPI, workspaces, etc.

### Requestly ([requestly/mcp](https://github.com/requestly/mcp) — MIT)

Open-source reference for **how to structure** an MCP package:

- `@modelcontextprotocol/sdk` + `McpServer` + `StdioServerTransport`
- `registerTools(server)` modules
- esbuild single-file bundle; `npx @requestly/mcp`
- Auth via API key to **remote** Requestly API (rules/groups — not the local API Client DB)

### Yaak

Deprecated in-app MCP in favor of a standalone CLI for agents — different tradeoff (no live UI bridge).

## Inpost choice (Phase 1)

**Localhost bridge + Requestly-style SDK packaging:**

1. Desktop app starts a **localhost-only HTTP bridge** and writes `session.json`.
2. Bundled `stdio.mjs` (Node MCP SDK) reads `session.json` and proxies tool calls to the bridge.
3. Same SQLite / send path as the UI — agent and UI share one running app.

Config for Cursor / Claude (after first app launch):

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

| OS | Path |
|---|---|
| Linux | `~/.local/share/com.inpost.desktop/mcp/stdio.mjs` |
| macOS | `~/Library/Application Support/com.inpost.desktop/mcp/stdio.mjs` |
| Windows | `%APPDATA%\com.inpost.desktop\mcp\stdio.mjs` |

## Phase 1 tools (minimum agent loop)

Snake_case tool names matching the UI feature set:

- `list_collections` / `create_collection` (optional `description` Markdown)
- `set_collection_description` — collection docs (OpenAPI `info.description`)
- `list_requests` / `get_request` / `create_request` / `update_request` / `delete_request`
  - Request `description` is Markdown (OpenAPI `operation.description`). Omit on `update_request` to keep existing docs; pass `""` to clear.
- `list_environments` / `create_environment` / `update_environment` / `set_active_environment` / `get_active_environment` — environments are **per workspace** (`workspaceId` required on list/get-active/create/update). Each workspace has its own Global + active Local/Prod/….
- `run_request` — optional `environmentId` (omit = active env). Same request against Local vs Prod: two calls, different ids; does **not** flip the UI active env. Use `set_active_environment` only when you want the app's active env to change. Env resolution uses the request's workspace (Global + chosen/active non-global from that workspace only).
- `get_history` / `list_workspace_history` / `list_request_history` — read persisted run snapshots (request + response + `requestJson`). In the app: **History** rail or snapshot tab → **Copy ID** → `get_history({ historyId })` for full debug payload. `list_workspace_history` needs `workspaceId` (Settings → workspace → Copy). `list_request_history` scopes to one saved request.

### Documentation field (agents)

Docs are **CommonMark Markdown strings** — same format OpenAPI uses. Tool descriptions spell out allow/deny; summary:

| OK | Not available |
|---|---|
| Headings, bold/italic/strike, lists, quotes, code fences, links, remote `![img](https://…)` | Raw HTML/script, Editor.js JSON, uploaded image bytes, folder-level docs |

OpenAPI import/export is Phase 2 (UI + MCP `import_openapi` / `export_openapi`).
Folders: `list_folders` / `create_folder` / `delete_folder` / `reorder_siblings`.

### Environment variable substitution

Env vars are **plain strings**. `{{var}}` is a literal text replace in:
- URL (after `{{baseUrl}}/{{ … }}`)
- Query, path, headers, auth, urlencoded/multipart values
- JSON / text body — `envsubst::substitute` replaces the token with the env's string value

For JSON bodies: write quotation marks in the JSON when the value is text, leave them off when it's a number/bool/null. Idiotsync — env vars don't carry type, the JSON you write decides it.

```json
{ "id": {{id}}, "name": "{{name}}", "active": {{flag}} }
```
- `id="42"`    → `{ "id": 42 }`           (no quotes around `{{id}}` → int)
- `name="ada"` → `{ "name": "ada" }`      (quotes required → string)
- `flag="true"`→ `{ "active": true }`     (no quotes → bool)

Wrong: `"id": "{{id}}"` with `id="42"` sends `"id": "42"` (string in JSON).
Missing vars stay as `{{token}}` on the wire (server will likely 4xx).
