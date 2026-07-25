#!/usr/bin/env node
// Cross-shell MCP build helper (replaces the npm-script `cp`/`mkdir -p` chain
// that breaks under cmd.exe on Windows). Uses Node's fs only — runs on every OS.
//
// Does: npm install (mcp/) → npm run build (mcp/) → copy dist/stdio.mjs to
// src-tauri/resources/mcp/stdio.mjs so tauri can bundle it as a resource.

import { execSync } from 'node:child_process'
import { mkdirSync, copyFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const mcpDir = resolve(root, 'mcp')
const dest = resolve(root, 'src-tauri/resources/mcp/stdio.mjs')
const src = resolve(mcpDir, 'dist/stdio.mjs')

const run = (cmd, opts = {}) => execSync(cmd, { stdio: 'inherit', cwd: mcpDir, ...opts })

run('npm install')
run('npm run build')

if (!existsSync(src)) {
  console.error(`build:mcp: expected output not found: ${src}`)
  process.exit(1)
}
mkdirSync(dirname(dest), { recursive: true })
copyFileSync(src, dest)
console.log(`build:mcp: copied ${src} → ${dest}`)
