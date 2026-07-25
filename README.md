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

## Release / preflight

Before pushing, run the full release pipeline locally — the **same** gate sequence the GitHub Action runs:

```bash
./scripts/preflight.sh        # = npm run preflight + artifact summary
```

This runs `build:mcp → tsc --noEmit → cargo test + tsx self-checks → vite build → cargo build --release → tauri build`, then lists the **Linux** installers under `src-tauri/target/release/bundle/` (Tauri only produces installers for the OS it runs on — Windows `.msi`/`.exe` and macOS `.dmg`/`.app` are built in CI, see below).

CI:

- Push to `main` or any PR runs `.github/workflows/check.yml` (gates only, no bundling).
- Tag a release with `git tag vX.Y.Z && git push --tags` — `.github/workflows/release.yml` uses `tauri-apps/tauri-action@v0` to build Linux + Windows + macOS (Intel + arm64) installers in parallel and attaches them to the GitHub Release. (Unsigned — code-signing/notarization is a follow-up.)

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
