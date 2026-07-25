# Inpost

Local-first desktop API client (Tauri + Rust + React). No account required. MCP and sync land in later phases.

See **[docs/PRD.md](docs/PRD.md)** for product scope and **[docs/TRACE.md](docs/TRACE.md)** for live status / session log (keep this updated across chats).

## Status

Live detail: **[docs/TRACE.md](docs/TRACE.md)**. Phase 2 + local workspaces done; next is Phase 3 sync spike.

## Dev

Prerequisites: [Tauri Linux deps](https://tauri.app/start/prerequisites/) (or macOS/Windows equivalents), Rust, Node 22+.

```bash
npm install
npm run build:mcp   # bundled stdio MCP (Node → app-data)
npm run tauri dev
```

Self-check (env substitution — no UI needed):

```bash
npm run check
```

## MCP (Phase 1)

Keep **Inpost running**, then point your MCP client at the copied stdio script (refreshed on each launch):

| OS | Path |
|---|---|
| Linux | `~/.local/share/com.inpost.desktop/mcp/stdio.mjs` |
| macOS | `~/Library/Application Support/com.inpost.desktop/mcp/stdio.mjs` |
| Windows | `%APPDATA%\com.inpost.desktop\mcp\stdio.mjs` |

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

See [docs/MCP.md](docs/MCP.md) for bridge notes, Requestly packaging refs, and tool list.

## License

MIT
