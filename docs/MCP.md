# MCP (Phase 1)

## What we learned

### Outpost (`%APPDATA%/com.outpost.desktop/mcp/`)

Inspected local install:

| File | Role |
|---|---|
| `stdio.mjs` | Bundled Node MCP (`@modelcontextprotocol/sdk` + `StdioServerTransport`) |
| `session.json` | `{ bridgeUrl, mcpUrl, token }` — written while the desktop app is signed in / running |

Pattern: **stdio is a thin proxy**. Cursor talks stdio → `stdio.mjs` → authenticated HTTP to the **running desktop app** (`bridgeUrl` + `Bearer token`). App must stay open. Tools include `run_request`, `create_request`, `list_collections`, env CRUD, OpenAPI, workspaces, etc. (~29 snake_case tools in the bundle).

### Requestly ([requestly/mcp](https://github.com/requestly/mcp) — MIT)

Open-source reference for **how to structure** an MCP package:

- `@modelcontextprotocol/sdk` + `McpServer` + `StdioServerTransport`
- `registerTools(server)` modules
- esbuild single-file bundle; `npx @requestly/mcp`
- Auth via API key to **remote** Requestly API (rules/groups — not the local API Client DB)

### Yaak

Deprecated in-app MCP in favor of a standalone CLI for agents — different tradeoff (no live UI bridge).

## Inpost choice (Phase 1)

**Outpost transport shape + Requestly SDK packaging:**

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

Aligned with Outpost names where we have the feature:

- `list_collections` / `create_collection`
- `list_requests` / `get_request` / `create_request` / `update_request` / `delete_request`
- `list_environments` / `create_environment` / `update_environment` / `set_active_environment` / `get_active_environment`
- `run_request` (optional `environmentId`)

OpenAPI import/export is Phase 2 (UI + MCP `import_openapi` / `export_openapi`).
Folders: `list_folders` / `create_folder` / `delete_folder` / `reorder_siblings`.
