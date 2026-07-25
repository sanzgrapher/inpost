import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  BookOpen,
  Braces,
  Box,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  FileUp,
  Folder,
  FolderPlus,
  Hexagon,
  History,
  Keyboard,
  Layers,
  Library,
  Minus,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings,
  SlidersHorizontal,
  Square,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { CodeEditor } from "./CodeEditor";
import { DocArticle } from "./Docs";
import { GlobalSearch } from "./GlobalSearch";
import { methodClass, methodLabel } from "./methodStyle";
import {
  type IndexItem,
} from "./searchQuery";
import { UrlField } from "./UrlField";
import { VarField, type EnvVarHoverProps } from "./EnvVarHover";
import { SHORTCUTS, isInspectKey, matchShortcut, nextInCycle } from "./shortcuts";
import { Button, Modal, Select, SuggestInput, useDialogs } from "./ui";
import {
  sourceKeys,
  syncSelectedVars,
  uniqueEnvName,
} from "./envSync";
import { encodeQueryPart, pairsToMap, resolveRequestUrl } from "./envVar";
import { diffTokens } from "./envSync";
import {
  AUTH_TYPE_OPTIONS,
  BODY_TYPE_OPTIONS,
  COMMON_HEADERS,
  parseAuthJson,
  parseHistoryHeaders,
  pathVarNames,
  syncContentType,
  type AuthType,
  type BodyType,
} from "./reqMeta";
import {
  clampSidebar,
  clampSplit,
  emptySession,
  loadWorkspaceSession,
  saveLayoutDock,
  saveWorkspaceSession,
  type LayoutDock,
  type Rail,
  type WorkspaceSession,
} from "./workspaceSession";
import "./App.css";

/** Dense UI stroke — matches Yaak/Lucide desktop defaults. */
const I = { size: 14, strokeWidth: 1.75 } as const;
const Ism = { size: 12, strokeWidth: 1.75 } as const;
const Imd = { size: 15, strokeWidth: 1.75 } as const;
/** Solid fill for folder/collection marks in the tree. */
const Ifill = { size: 14, strokeWidth: 1.5, fill: "currentColor" } as const;

type Workspace = { id: string; name: string };
type Collection = {
  id: string;
  name: string;
  workspaceId?: string;
  description?: string;
};
type Folder = {
  id: string;
  collectionId: string;
  parentId: string | null;
  name: string;
  sortOrder: number;
};
type HttpRequest = {
  id: string;
  collectionId: string;
  folderId?: string | null;
  name: string;
  description?: string;
  method: string;
  url: string;
  headersJson: string;
  body: string;
  bodyType?: string;
  bodyPairsJson?: string;
  authType?: string;
  authJson?: string;
  pathVarsJson?: string;
  sortOrder?: number;
};
type SavedSnap = {
  name: string;
  description: string;
  method: string;
  url: string;
  headersJson: string;
  body: string;
  bodyType: string;
  bodyPairsJson: string;
  authType: string;
  authJson: string;
  pathVarsJson: string;
};
type TreeKind = "folder" | "request";
type TreeSibling = { kind: TreeKind; id: string; name: string; sortOrder: number };
type Environment = {
  id: string;
  name: string;
  isGlobal: boolean;
  isActive: boolean;
  varsJson: string;
};
type SendResult = {
  status: number;
  statusText: string;
  headers: [string, string][];
  body: string;
  bodyPretty: string | null;
  elapsedMs: number;
  resolvedUrl: string;
};
type Pair = {
  key: string;
  value: string;
  enabled?: boolean;
  /** Multipart part kind — ignored for headers/query/path. */
  type?: "text" | "file";
  description?: string;
};
type HistoryEntry = {
  id: string;
  workspaceId: string;
  requestId?: string | null;
  method: string;
  url: string;
  status?: number | null;
  statusText?: string | null;
  elapsedMs?: number | null;
  sizeBytes?: number | null;
  error?: string | null;
  body?: string | null;
  bodyPretty?: string | null;
  headersJson?: string | null;
  createdAt: number;
};
type ReqTab = "overview" | "params" | "headers" | "body" | "auth";
type ResTab = "body" | "headers" | "history";
type SettingsAppSection = "general" | "shortcuts" | "mcp";
type SettingsSection = SettingsAppSection | `ws:${string}`;

const WS_SETTINGS_PREFIX = "ws:";
function wsSettingsId(id: string): SettingsSection {
  return `${WS_SETTINGS_PREFIX}${id}`;
}
function parseWsSettings(section: SettingsSection): string | null {
  return section.startsWith(WS_SETTINGS_PREFIX)
    ? section.slice(WS_SETTINGS_PREFIX.length)
    : null;
}
type McpStatus = {
  running: boolean;
  port: number;
  bridgeUrl: string;
  stdioPath: string;
};
type McpLogEntry = {
  at: number;
  method: string;
  path: string;
  status: number;
  detail?: string | null;
};

const WS_KEY = "inpost.workspaceId";
const DEV_MODE_KEY = "inpost.devMode";
/** Sentinel open-tab id — sits beside request tabs. */
const SETTINGS_ID = "__settings__";
/** Collection-docs tabs share the strip: `__coldoc__:<collectionId>`. */
const COLDOC_PREFIX = "__coldoc__:";
const coldocTabId = (collectionId: string) => `${COLDOC_PREFIX}${collectionId}`;
function parseColdocTab(id: string | null): string | null {
  return id?.startsWith(COLDOC_PREFIX) ? id.slice(COLDOC_PREFIX.length) : null;
}

function mcpCursorConfig(stdioPath: string): string {
  return JSON.stringify(
    {
      mcpServers: {
        inpost: {
          command: "node",
          args: [stdioPath],
        },
      },
    },
    null,
    2,
  );
}

function loadWorkspaceId(): string {
  try {
    return localStorage.getItem(WS_KEY) || "";
  } catch {
    return "";
  }
}

function saveWorkspaceId(id: string) {
  try {
    localStorage.setItem(WS_KEY, id);
  } catch {
    /* ignore */
  }
}

function loadDevMode(): boolean {
  try {
    return localStorage.getItem(DEV_MODE_KEY) === "1";
  } catch {
    return false;
  }
}

function saveDevMode(on: boolean) {
  try {
    localStorage.setItem(DEV_MODE_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}

function asSettingsSection(v: string): SettingsSection {
  if (v === "general" || v === "shortcuts" || v === "mcp") return v;
  if (v.startsWith(WS_SETTINGS_PREFIX)) return v as SettingsSection;
  return "mcp";
}

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

function folderPath(
  folderId: string | null | undefined,
  folders: Folder[],
): string[] {
  const parts: string[] = [];
  let fid = folderId ?? null;
  let guard = 0;
  while (fid && guard++ < 64) {
    const f = folders.find((x) => x.id === fid);
    if (!f) break;
    parts.unshift(f.name);
    fid = f.parentId ?? null;
  }
  return parts;
}

function siblingsOf(
  parentId: string | null,
  folders: Folder[],
  requests: HttpRequest[],
): TreeSibling[] {
  const foldersHere = folders
    .filter((f) => (f.parentId ?? null) === parentId)
    .map((f) => ({
      kind: "folder" as const,
      id: f.id,
      name: f.name,
      sortOrder: f.sortOrder,
    }));
  const reqsHere = requests
    .filter((r) => (r.folderId ?? null) === parentId)
    .map((r) => ({
      kind: "request" as const,
      id: r.id,
      name: r.name,
      sortOrder: r.sortOrder ?? 0,
    }));
  return [...foldersHere, ...reqsHere].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
  );
}

/** null = show everything; otherwise only these folder/request ids. */
function computeTreeVisibility(
  needle: string,
  folders: Folder[],
  requests: HttpRequest[],
): { folders: Set<string>; requests: Set<string> } | null {
  const q = needle.trim().toLowerCase();
  if (!q) return null;
  const visF = new Set<string>();
  const visR = new Set<string>();
  const byId = new Map(folders.map((f) => [f.id, f]));

  function markAncestors(folderId: string | null | undefined) {
    let fid = folderId ?? null;
    let guard = 0;
    while (fid && guard++ < 64) {
      visF.add(fid);
      fid = byId.get(fid)?.parentId ?? null;
    }
  }

  function includeDescendants(folderId: string) {
    for (const f of folders) {
      if ((f.parentId ?? null) === folderId) {
        visF.add(f.id);
        includeDescendants(f.id);
      }
    }
    for (const r of requests) {
      if ((r.folderId ?? null) === folderId) visR.add(r.id);
    }
  }

  for (const r of requests) {
    if (
      r.name.toLowerCase().includes(q) ||
      r.url.toLowerCase().includes(q) ||
      r.method.toLowerCase().includes(q)
    ) {
      visR.add(r.id);
      markAncestors(r.folderId);
    }
  }
  for (const f of folders) {
    if (f.name.toLowerCase().includes(q)) {
      visF.add(f.id);
      markAncestors(f.parentId);
      includeDescendants(f.id);
    }
  }
  return { folders: visF, requests: visR };
}

function parsePairs(json: string): Pair[] {
  try {
    const arr = JSON.parse(json || "[]") as unknown;
    if (!Array.isArray(arr)) return [{ key: "", value: "", enabled: true }];
    const pairs = arr.map((item): Pair => {
      if (Array.isArray(item)) {
        const [key, value, kind] = item as [string, string, string?];
        return {
          key: key ?? "",
          value: value ?? "",
          enabled: true,
          type: kind === "file" ? "file" : "text",
        };
      }
      if (item && typeof item === "object") {
        const o = item as {
          key?: string;
          value?: string;
          enabled?: boolean;
          type?: string;
        };
        return {
          key: o.key ?? "",
          value: o.value ?? "",
          enabled: o.enabled !== false,
          type: o.type === "file" ? "file" : "text",
        };
      }
      return { key: "", value: "", enabled: true, type: "text" };
    });
    return pairs.length ? pairs : [{ key: "", value: "", enabled: true }];
  } catch {
    return [{ key: "", value: "", enabled: true }];
  }
}

/** Headers / query / path — always `[[k,v],…]` for the Rust wire. */
function pairsToJson(pairs: Pair[]): string {
  return JSON.stringify(
    pairs
      .filter((p) => p.enabled !== false && p.key.trim())
      .map((p) => [p.key, p.value]),
  );
}

/** Body form pairs — keep `type` so multipart Text/File survives reload. */
function bodyPairsToJson(pairs: Pair[]): string {
  return JSON.stringify(
    pairs
      .filter((p) => p.enabled !== false && p.key.trim())
      .map((p) => ({
        key: p.key,
        value: p.value,
        type: p.type === "file" ? "file" : "text",
      })),
  );
}

/** Flatten for send_http_request (`Vec<(String,String)>`). */
function bodyPairsForSend(pairs: Pair[]): [string, string][] {
  return pairs
    .filter((p) => p.enabled !== false && p.key.trim())
    .map((p) => [p.key, p.value]);
}

function asBodyType(s: string | undefined | null): BodyType {
  if (
    s === "none" ||
    s === "json" ||
    s === "text" ||
    s === "urlencoded" ||
    s === "multipart"
  ) {
    return s;
  }
  return "none";
}

function asAuthType(s: string | undefined | null): AuthType {
  if (s === "bearer" || s === "basic" || s === "apikey" || s === "none") {
    return s;
  }
  return "none";
}

function normalizeRequest(r: HttpRequest): HttpRequest {
  return {
    ...r,
    description: r.description ?? "",
    bodyType: r.bodyType ?? (r.body?.trim() ? "json" : "none"),
    bodyPairsJson: r.bodyPairsJson ?? "[]",
    authType: r.authType ?? "none",
    authJson: r.authJson ?? "{}",
    pathVarsJson: r.pathVarsJson ?? "[]",
  };
}

function mergePathPairs(url: string, stored: Pair[]): Pair[] {
  const names = pathVarNames(url);
  return names.map((name) => {
    const found = stored.find((p) => p.key === name);
    return { key: name, value: found?.value ?? "", enabled: true };
  });
}

function snapOf(r: HttpRequest): SavedSnap {
  const n = normalizeRequest(r);
  return {
    name: n.name,
    description: n.description ?? "",
    method: n.method,
    url: n.url,
    headersJson: n.headersJson,
    body: n.body,
    bodyType: n.bodyType!,
    bodyPairsJson: n.bodyPairsJson!,
    authType: n.authType!,
    authJson: n.authJson!,
    pathVarsJson: n.pathVarsJson!,
  };
}

function snapDirty(
  saved: SavedSnap | undefined,
  cur: SavedSnap,
): boolean {
  if (!saved) return false;
  return (
    cur.name !== saved.name ||
    cur.description !== saved.description ||
    cur.method !== saved.method ||
    cur.url !== saved.url ||
    cur.headersJson !== saved.headersJson ||
    cur.body !== saved.body ||
    cur.bodyType !== saved.bodyType ||
    cur.bodyPairsJson !== saved.bodyPairsJson ||
    cur.authType !== saved.authType ||
    cur.authJson !== saved.authJson ||
    cur.pathVarsJson !== saved.pathVarsJson
  );
}

function splitUrl(url: string): { base: string; query: Pair[] } {
  const i = url.indexOf("?");
  if (i < 0) return { base: url, query: [{ key: "", value: "", enabled: true }] };
  const base = url.slice(0, i);
  const query = url
    .slice(i + 1)
    .split("&")
    .filter(Boolean)
    .map((part) => {
      const eq = part.indexOf("=");
      if (eq < 0)
        return {
          key: decodeURIComponent(part),
          value: "",
          enabled: true,
        };
      return {
        key: decodeURIComponent(part.slice(0, eq)),
        value: decodeURIComponent(part.slice(eq + 1)),
        enabled: true,
      };
    });
  return {
    base,
    query: query.length ? query : [{ key: "", value: "", enabled: true }],
  };
}

function joinUrl(base: string, query: Pair[]): string {
  const qs = query
    .filter((p) => p.enabled !== false && p.key.trim())
    .map((p) => `${encodeQueryPart(p.key)}=${encodeQueryPart(p.value)}`)
    .join("&");
  return qs ? `${base}?${qs}` : base;
}

function parseVars(json: string): Pair[] {
  try {
    const obj = JSON.parse(json || "{}") as Record<string, string>;
    const pairs = Object.entries(obj).map(([key, value]) => ({
      key,
      value,
      enabled: true,
    }));
    return pairs.length ? pairs : [{ key: "", value: "", enabled: true }];
  } catch {
    return [{ key: "", value: "", enabled: true }];
  }
}

function varsToJson(pairs: Pair[]): string {
  const out: Record<string, string> = {};
  for (const p of pairs) {
    if (p.key.trim()) out[p.key.trim()] = p.value;
  }
  return JSON.stringify(out);
}

function countEnvVars(
  env: { id: string; varsJson: string },
  drafts: Record<string, Pair[]>,
): number {
  const pairs = drafts[env.id] ?? parseVars(env.varsJson);
  return pairs.filter((p) => p.key.trim()).length;
}

function envIsDirty(
  env: { id: string; varsJson: string },
  drafts: Record<string, Pair[]>,
): boolean {
  const draft = drafts[env.id];
  if (!draft) return false;
  return varsToJson(draft) !== env.varsJson;
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatHistoryBucket(ts: number): "Today" | "Yesterday" | "Older" {
  const now = new Date();
  const startToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  if (ts >= startToday) return "Today";
  if (ts >= startToday - 86400000) return "Yesterday";
  return "Older";
}

function formatHistoryTime(ts: number, bucket: "Today" | "Yesterday" | "Older") {
  const d = new Date(ts);
  const time = d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  if (bucket === "Older") {
    const date = d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
    return `${date} · ${time}`;
  }
  return time;
}

function groupHistory(entries: HistoryEntry[]) {
  const buckets: Record<"Today" | "Yesterday" | "Older", HistoryEntry[]> = {
    Today: [],
    Yesterday: [],
    Older: [],
  };
  for (const e of entries) {
    buckets[formatHistoryBucket(e.createdAt)].push(e);
  }
  return (["Today", "Yesterday", "Older"] as const)
    .filter((k) => buckets[k].length > 0)
    .map((k) => [k, buckets[k]] as [typeof k, HistoryEntry[]]);
}

function historyTitle(
  h: HistoryEntry,
  titles: Map<string, string>,
): string {
  if (h.requestId) {
    const name = titles.get(h.requestId);
    if (name?.trim()) return name;
  }
  const raw = h.url.trim();
  if (!raw) return h.method;
  // Strip {{var}} prefix / host so a path segment can stand in as a title.
  const path = raw
    .replace(/^\{\{[^}]+\}\}/, "")
    .replace(/^https?:\/\/[^/?#]+/i, "")
    .replace(/^\//, "");
  const seg = path.split(/[/?#]/).filter(Boolean)[0];
  return seg || raw;
}

function historyMeta(h: HistoryEntry) {
  if (h.error) return "ERR";
  const parts: string[] = [];
  if (h.status != null) parts.push(String(h.status));
  if (h.elapsedMs != null) parts.push(`${h.elapsedMs} ms`);
  if (h.sizeBytes != null) parts.push(formatBytes(h.sizeBytes));
  return parts.join(" · ") || "—";
}

function PairTable({
  pairs,
  onChange,
  keyLabel = "Key",
  filter = "",
  keySuggestions,
  lockKeys = false,
  tools = false,
  envHover,
}: {
  pairs: Pair[];
  onChange: (next: Pair[]) => void;
  keyLabel?: string;
  /** Display filter only — edits still target full list indices. */
  filter?: string;
  keySuggestions?: string[];
  /** Path params: keys are derived from the URL, not editable. */
  lockKeys?: boolean;
  /** Params table actions: description column + bulk key:value editor. */
  tools?: boolean;
  /** Hover-edit `{{vars}}` in the Value column. */
  envHover?: EnvVarHoverProps;
}) {
  const [showDescription, setShowDescription] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkDraft, setBulkDraft] = useState("");
  const toolsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      if (toolsRef.current && !toolsRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  function update(i: number, patch: Partial<Pair>) {
    const next = pairs.map((p, idx) => (idx === i ? { ...p, ...patch } : p));
    if (!lockKeys) {
      const last = next[next.length - 1];
      if (last && (last.key || last.value)) {
        next.push({ key: "", value: "", enabled: true });
      }
    }
    onChange(next);
  }

  function remove(i: number) {
    if (lockKeys) return;
    const next = pairs.filter((_, idx) => idx !== i);
    onChange(
      next.length ? next : [{ key: "", value: "", enabled: true }],
    );
  }

  const q = filter.trim().toLowerCase();
  const rowClass = `kv-row${showDescription ? " has-description" : ""}`;

  function openBulk() {
    setBulkDraft(
      pairs
        .filter((p) => p.key || p.value)
        .map((p) => `${p.key}:${p.value}`)
        .join("\n"),
    );
    setBulkOpen(true);
  }

  function applyBulk() {
    const next = bulkDraft
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .map((line): Pair => {
        const colon = line.indexOf(":");
        return {
          key: (colon < 0 ? line : line.slice(0, colon)).trim(),
          value: colon < 0 ? "" : line.slice(colon + 1).trim(),
          enabled: true,
        };
      });
    onChange([...next, { key: "", value: "", enabled: true }]);
    setBulkOpen(false);
  }

  return (
    <div className={`kv-table${tools ? " has-tools" : ""}`}>
      {tools && (
        <div className="kv-toolbar" ref={toolsRef}>
          <button
            type="button"
            className="kv-more"
            aria-label="Table options"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <MoreHorizontal {...Ism} />
          </button>
          {menuOpen && (
            <div className="kv-tools-menu">
              <label>
                <input
                  type="checkbox"
                  checked={showDescription}
                  onChange={(e) => setShowDescription(e.target.checked)}
                />
                Description
              </label>
            </div>
          )}
          {!lockKeys && (
            <button type="button" className="kv-bulk-btn" onClick={openBulk}>
              Bulk edit
            </button>
          )}
        </div>
      )}
      <div className={`kv-head${showDescription ? " has-description" : ""}`}>
        <span />
        <span>{keyLabel}</span>
        <span>Value</span>
        {showDescription && <span>Description</span>}
        <span />
      </div>
      {bulkOpen && (
        <div className="kv-bulk">
          <div className="kv-bulk-head">
            <span>Bulk edit as key:value pairs</span>
            <button
              type="button"
              className="icon-btn"
              aria-label="Close bulk edit"
              onClick={() => setBulkOpen(false)}
            >
              <X {...Ism} />
            </button>
          </div>
          <textarea
            value={bulkDraft}
            autoFocus
            placeholder={"page:1\nlimit:20"}
            onChange={(e) => setBulkDraft(e.target.value)}
          />
          <div className="kv-bulk-actions">
            <Button size="sm" onClick={() => setBulkOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" onClick={applyBulk}>
              Apply
            </Button>
          </div>
        </div>
      )}
      {pairs.map((p, i) => {
        const isLast = i === pairs.length - 1 && !p.key && !p.value;
        if (
          q &&
          !isLast &&
          !p.key.toLowerCase().includes(q) &&
          !p.value.toLowerCase().includes(q)
        ) {
          return null;
        }
        return (
        <div className={rowClass} key={lockKeys ? p.key : i}>
          <input
            type="checkbox"
            checked={p.enabled !== false}
            onChange={(e) => update(i, { enabled: e.target.checked })}
            aria-label="Enable row"
            disabled={lockKeys}
          />
          {keySuggestions?.length && !lockKeys ? (
            <SuggestInput
              placeholder={keyLabel}
              value={p.key}
              suggestions={keySuggestions}
              onChange={(key) => update(i, { key })}
            />
          ) : (
            <input
              placeholder={keyLabel}
              value={p.key}
              readOnly={lockKeys}
              onChange={(e) => update(i, { key: e.target.value })}
            />
          )}
          {envHover ? (
            <VarField
              value={p.value}
              placeholder="Value"
              env={envHover.env}
              envPairs={envHover.envPairs}
              globalPairs={envHover.globalPairs}
              onSaveVar={envHover.onSaveVar}
              onOpenEnv={envHover.onOpenEnv}
              onChange={(value) => update(i, { value })}
            />
          ) : (
            <input
              placeholder="Value"
              value={p.value}
              onChange={(e) => update(i, { value: e.target.value })}
            />
          )}
          {showDescription && (
            <input
              placeholder="Description"
              value={p.description ?? ""}
              onChange={(e) => update(i, { description: e.target.value })}
            />
          )}
          {!lockKeys ? (
            <button
              type="button"
              className="icon-btn"
              onClick={() => remove(i)}
              aria-label="Remove"
            >
              <X {...Ism} />
            </button>
          ) : (
            <span />
          )}
        </div>
        );
      })}
      {lockKeys ? (
        pairs.length === 0 && (
          <div className="kv-empty muted">No path variables in URL</div>
        )
      ) : (
        <button
          type="button"
          className="link-btn"
          onClick={() =>
            onChange([...pairs, { key: "", value: "", enabled: true }])
          }
        >
          <Plus {...Ism} /> Add more
        </button>
      )}
    </div>
  );
}

/** Boxy multipart/form-data editor — Text | File parts in card rows. */
function MultipartTable({
  pairs,
  onChange,
  envHover,
}: {
  pairs: Pair[];
  onChange: (next: Pair[]) => void;
  envHover?: EnvVarHoverProps;
}) {
  const fileRefs = useRef<Record<number, HTMLInputElement | null>>({});

  function ensureTrailing(next: Pair[]) {
    const last = next[next.length - 1];
    if (last && (last.key || last.value || last.type === "file")) {
      next.push({ key: "", value: "", enabled: true, type: "text" });
    }
    return next;
  }

  function update(i: number, patch: Partial<Pair>) {
    onChange(
      ensureTrailing(pairs.map((p, idx) => (idx === i ? { ...p, ...patch } : p))),
    );
  }

  function remove(i: number) {
    const next = pairs.filter((_, idx) => idx !== i);
    onChange(
      next.length
        ? next
        : [{ key: "", value: "", enabled: true, type: "text" }],
    );
  }

  return (
    <div className="mp-table">
      {pairs.map((p, i) => {
        const isFile = p.type === "file";
        return (
          <div className="mp-row" key={i}>
            <input
              type="checkbox"
              checked={p.enabled !== false}
              onChange={(e) => update(i, { enabled: e.target.checked })}
              aria-label="Enable part"
            />
            <input
              className="mp-key"
              placeholder="Key"
              value={p.key}
              onChange={(e) => update(i, { key: e.target.value })}
            />
            <Select
              className="mp-kind"
              value={isFile ? "file" : "text"}
              options={[
                { id: "text", label: "Text" },
                { id: "file", label: "File" },
              ]}
              onChange={(id) =>
                update(i, {
                  type: id === "file" ? "file" : "text",
                  // Clear value when switching kinds so Text ↔ File don’t share junk.
                  value: "",
                })
              }
            />
            {isFile ? (
              <div className="mp-file">
                <button
                  type="button"
                  className="mp-file-btn"
                  onClick={() => fileRefs.current[i]?.click()}
                >
                  {p.value ? p.value : "Choose file…"}
                </button>
                <input
                  ref={(el) => {
                    fileRefs.current[i] = el;
                  }}
                  type="file"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    // ponytail: webview file input only gives a display name, not a
                    // filesystem path — wire bytes on send still deferred.
                    update(i, { value: f?.name ?? "" });
                    e.target.value = "";
                  }}
                />
                {p.value && (
                  <button
                    type="button"
                    className="mp-file-clear"
                    aria-label="Clear file"
                    onClick={() => update(i, { value: "" })}
                  >
                    <X {...Ism} />
                  </button>
                )}
              </div>
            ) : envHover ? (
              <VarField
                className="mp-value"
                value={p.value}
                placeholder="Value"
                env={envHover.env}
                envPairs={envHover.envPairs}
                globalPairs={envHover.globalPairs}
                onSaveVar={envHover.onSaveVar}
                onOpenEnv={envHover.onOpenEnv}
                onChange={(value) => update(i, { value })}
              />
            ) : (
              <input
                className="mp-value"
                placeholder="Value"
                value={p.value}
                onChange={(e) => update(i, { value: e.target.value })}
              />
            )}
            <button
              type="button"
              className="icon-btn"
              onClick={() => remove(i)}
              aria-label="Remove"
            >
              <Trash2 {...Ism} />
            </button>
          </div>
        );
      })}
      <button
        type="button"
        className="link-btn"
        onClick={() => {
          const filled = pairs.filter(
            (p) => p.key || p.value || p.type === "file",
          );
          onChange([
            ...filled,
            { key: "", value: "", enabled: true, type: "text" },
          ]);
        }}
      >
        <Plus {...Ism} /> Add more
      </button>
    </div>
  );
}

function TitleBar({
  workspaces,
  workspaceId,
  onSelect,
  onCreate,
  search,
  onSearch,
  searchInputRef,
  searchIndex,
  searchLoading,
  onSearchOpen,
  onFocusSearch,
  onOpenSettings,
  onOpenWorkspaceSettings,
}: {
  workspaces: Workspace[];
  workspaceId: string;
  onSelect: (id: string) => void;
  onCreate: () => void;
  search: string;
  onSearch: (q: string) => void;
  searchInputRef: RefObject<HTMLInputElement | null>;
  searchIndex: IndexItem[];
  searchLoading?: boolean;
  onSearchOpen: (item: IndexItem) => void;
  onFocusSearch?: () => void;
  onOpenSettings: () => void;
  onOpenWorkspaceSettings: (id: string) => void;
}) {
  const win = getCurrentWindow();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const wsSearchRef = useRef<HTMLInputElement>(null);
  const current = workspaces.find((w) => w.id === workspaceId);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return workspaces;
    return workspaces.filter((w) => w.name.toLowerCase().includes(needle));
  }, [workspaces, q]);

  useEffect(() => {
    if (!open) return;
    wsSearchRef.current?.focus();
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQ("");
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="titlebar" data-tauri-drag-region>
      <div className="titlebar-left" data-tauri-drag-region>
        <span className="titlebar-mark" data-tauri-drag-region>
          In
        </span>
        <span className="titlebar-label" data-tauri-drag-region>
          Inpost
        </span>
        <div className="ws-picker" ref={rootRef}>
          <button
            type="button"
            className="ws-trigger"
            onClick={() => setOpen((v) => !v)}
            data-tip={current?.name ? `Workspace: ${current.name}` : "Switch workspace"}
          >
            <span className="ws-trigger-name">
              {current?.name ?? "Workspace"}
            </span>
            <span className="ws-chevron">
              <ChevronDown {...Ism} />
            </span>
          </button>
          {open && (
            <div className="ws-menu">
              <input
                ref={wsSearchRef}
                className="ws-search"
                placeholder="Search workspaces…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setOpen(false);
                    setQ("");
                  } else if (e.key === "Enter" && filtered[0]) {
                    onSelect(filtered[0].id);
                    setOpen(false);
                    setQ("");
                  }
                }}
              />
              <ul className="ws-list">
                {filtered.length === 0 && (
                  <li className="ws-empty">No workspaces match</li>
                )}
                {filtered.map((w) => (
                  <li
                    key={w.id}
                    className={`ws-row ${w.id === workspaceId ? "active" : ""}`}
                  >
                    <button
                      type="button"
                      className="ws-row-main"
                      onClick={() => {
                        onSelect(w.id);
                        setOpen(false);
                        setQ("");
                      }}
                    >
                      <span className="ws-row-name">{w.name}</span>
                    </button>
                    <button
                      type="button"
                      className="ws-row-settings"
                      data-tip="Workspace settings"
                      aria-label={`Settings for ${w.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpen(false);
                        setQ("");
                        onOpenWorkspaceSettings(w.id);
                      }}
                    >
                      <Settings {...Ism} />
                    </button>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className="ui-btn ui-btn-ghost ui-btn-sm ws-create"
                onClick={() => {
                  setOpen(false);
                  setQ("");
                  onCreate();
                }}
              >
                <Plus {...Ism} /> Create workspace
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="titlebar-center">
        <GlobalSearch
          query={search}
          onQuery={onSearch}
          inputRef={searchInputRef}
          index={searchIndex}
          loading={searchLoading}
          workspaceId={workspaceId}
          onOpen={onSearchOpen}
          onFocusSearch={onFocusSearch}
        />
      </div>

      <div className="titlebar-right">
        <button
          type="button"
          className="titlebar-settings"
          aria-label="Settings"
          data-tip="Settings"
          onClick={onOpenSettings}
        >
          <Settings {...Imd} />
        </button>
        <div className="titlebar-controls">
          <button
            type="button"
            aria-label="Minimize"
            onClick={() => void win.minimize()}
          >
            <Minus {...Ism} />
          </button>
          <button
            type="button"
            aria-label="Maximize"
            onClick={() => void win.toggleMaximize()}
          >
            <Square {...Ism} />
          </button>
          <button
            type="button"
            className="close"
            aria-label="Close"
            onClick={() => void win.close()}
          >
            <X {...Ism} />
          </button>
        </div>
      </div>
    </div>
  );
}

function CollectionDocView({
  collection,
  onSaved,
}: {
  collection: Collection | undefined;
  onSaved: (col: Collection) => void;
}) {
  const savedDesc = collection?.description ?? "";
  const [text, setText] = useState(savedDesc);
  const [saving, setSaving] = useState(false);
  const lastSaved = useRef(savedDesc);
  // Adopt the stored description once it (re)loads; keeps local edits otherwise.
  useEffect(() => {
    if (lastSaved.current !== savedDesc) {
      lastSaved.current = savedDesc;
      setText(savedDesc);
    }
  }, [savedDesc]);

  if (!collection) {
    return (
      <div className="empty-main">
        <h2>Collection not found</h2>
        <p>This collection may have been deleted.</p>
      </div>
    );
  }
  const dirty = text !== savedDesc;

  async function save() {
    if (!collection) return;
    setSaving(true);
    try {
      const updated = await invoke<Collection>("set_collection_description", {
        id: collection.id,
        description: text,
      });
      onSaved(updated);
    } finally {
      setSaving(false);
    }
  }

  return (
    <DocArticle
      key={collection.id}
      title={collection.name}
      value={text}
      onChange={setText}
      placeholder="Document this collection — Markdown supported. Exports as the OpenAPI info description."
      emptyHint="Document this collection…"
      actions={
        dirty ? (
          <Button variant="primary" onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        ) : null
      }
    />
  );
}

function SettingsView({
  section,
  onSection,
  layoutDock,
  onLayoutDock,
  devMode,
  onDevMode,
  mcpStatus,
  onOpenMcpLogs,
  workspaces,
  workspaceId,
  onRenameWorkspace,
  onSwitchWorkspace,
}: {
  section: SettingsSection;
  onSection: (s: SettingsSection) => void;
  layoutDock: LayoutDock;
  onLayoutDock: (d: LayoutDock) => void;
  devMode: boolean;
  onDevMode: (on: boolean) => void;
  mcpStatus: McpStatus | null;
  onOpenMcpLogs: () => void;
  workspaces: Workspace[];
  workspaceId: string;
  onRenameWorkspace: (ws: Workspace) => void;
  onSwitchWorkspace: (id: string) => void;
}) {
  const [stdioPath, setStdioPath] = useState<string | null>(null);
  const [copied, setCopied] = useState<"path" | "json" | "url" | "wsid" | null>(
    null,
  );
  const [filter, setFilter] = useState("");

  useEffect(() => {
    let cancelled = false;
    invoke<string>("mcp_stdio_path")
      .then((p) => {
        if (!cancelled) setStdioPath(p);
      })
      .catch(() => {
        if (!cancelled) setStdioPath(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function copy(
    kind: "path" | "json" | "url" | "wsid",
    text: string,
  ) {
    await navigator.clipboard.writeText(text);
    setCopied(kind);
    window.setTimeout(() => setCopied(null), 1500);
  }

  const sections: { id: SettingsAppSection; label: string; icon: ReactNode }[] = [
    { id: "general", label: "General", icon: <SlidersHorizontal {...I} /> },
    { id: "shortcuts", label: "Keyboard", icon: <Keyboard {...I} /> },
    { id: "mcp", label: "MCP", icon: <Hexagon {...I} /> },
  ];
  const needle = filter.trim().toLowerCase();
  const visible = needle
    ? sections.filter((s) => s.label.toLowerCase().includes(needle))
    : sections;
  const visibleWorkspaces = needle
    ? workspaces.filter(
        (w) =>
          w.name.toLowerCase().includes(needle) ||
          "workspace".includes(needle),
      )
    : workspaces;
  const showWorkspaceSep =
    visibleWorkspaces.length > 0 ||
    (!needle && workspaces.length === 0);
  const path = stdioPath ?? mcpStatus?.stdioPath ?? null;
  const selectedWsId = parseWsSettings(section);
  const selectedWs =
    selectedWsId != null
      ? (workspaces.find((w) => w.id === selectedWsId) ?? null)
      : null;

  return (
    <div className="settings-view">
      <nav className="settings-nav" aria-label="Settings">
        <input
          className="settings-search"
          placeholder="Search settings"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          aria-label="Search settings"
        />
        <div className="settings-nav-list">
          {visible.map((s) => (
            <button
              key={s.id}
              type="button"
              className={section === s.id ? "active" : ""}
              onClick={() => onSection(s.id)}
            >
              <span className="settings-nav-ico" aria-hidden>
                {s.icon}
              </span>
              {s.label}
            </button>
          ))}
          {showWorkspaceSep && (
            <>
              <div className="settings-nav-sep" role="presentation">
                Workspace
              </div>
              {visibleWorkspaces.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  className={selectedWsId === w.id ? "active" : ""}
                  onClick={() => onSection(wsSettingsId(w.id))}
                >
                  <span className="settings-nav-ico" aria-hidden>
                    <Box {...I} />
                  </span>
                  <span className="settings-nav-label">{w.name}</span>
                  {w.id === workspaceId && (
                    <span className="settings-nav-badge">Active</span>
                  )}
                </button>
              ))}
              {visibleWorkspaces.length === 0 && (
                <div className="settings-nav-empty">No workspaces yet</div>
              )}
            </>
          )}
          {visible.length === 0 && visibleWorkspaces.length === 0 && (
            <div className="settings-nav-empty">No matches</div>
          )}
        </div>
      </nav>
      <div className="settings-panel">
        <div className="settings-panel-inner">
        {section === "general" && (
          <>
            <h2 className="settings-title">General</h2>

            <h3 className="settings-group">About</h3>
            <div className="settings-stack">
              <div className="settings-card">
                <div className="settings-item">
                  <div className="settings-item-text">
                    <div className="settings-item-title">Local-first</div>
                    <div className="settings-item-desc">
                      No account required. Collections, environments, and history
                      stay on this device.
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <h3 className="settings-group">Layout</h3>
            <div className="settings-stack">
              <div className="settings-card">
                <div className="settings-item">
                  <div className="settings-item-text">
                    <div className="settings-item-title">Response pane</div>
                    <div className="settings-item-desc">
                      Dock the response editor to the right of the request, or
                      below it. <kbd>Ctrl</kbd> <kbd>J</kbd> shows and hides it.
                    </div>
                  </div>
                  <div
                    className="settings-seg"
                    role="group"
                    aria-label="Response dock"
                  >
                    <button
                      type="button"
                      className={layoutDock === "right" ? "active" : ""}
                      onClick={() => onLayoutDock("right")}
                    >
                      Right
                    </button>
                    <button
                      type="button"
                      className={layoutDock === "bottom" ? "active" : ""}
                      onClick={() => onLayoutDock("bottom")}
                    >
                      Bottom
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <h3 className="settings-group">Developer</h3>
            <div className="settings-stack">
              <div className="settings-card">
                <div className="settings-item">
                  <div className="settings-item-text">
                    <div className="settings-item-title">Developer mode</div>
                    <div className="settings-item-desc">
                      While off, the right-click menu and inspector shortcuts
                      (<kbd>F12</kbd>, <kbd>Ctrl</kbd> <kbd>Shift</kbd>{" "}
                      <kbd>I</kbd>) are blocked.
                    </div>
                  </div>
                  <div
                    className="settings-seg"
                    role="group"
                    aria-label="Developer mode"
                  >
                    <button
                      type="button"
                      className={devMode ? "" : "active"}
                      onClick={() => onDevMode(false)}
                    >
                      Off
                    </button>
                    <button
                      type="button"
                      className={devMode ? "active" : ""}
                      onClick={() => onDevMode(true)}
                    >
                      On
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
        {section === "shortcuts" && (
          <>
            <h2 className="settings-title">Keyboard</h2>

            <h3 className="settings-group">Shortcuts</h3>
            <div className="settings-stack">
              <div className="settings-card">
                {SHORTCUTS.map((s) => (
                  <div className="settings-item compact" key={s.action}>
                    <div className="settings-item-text">
                      <div className="settings-item-title">{s.label}</div>
                      {s.note && (
                        <div className="settings-item-desc">{s.note}</div>
                      )}
                    </div>
                    <div className="settings-keys">
                      {s.keys.map((k) => (
                        <kbd key={k}>{k}</kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
        {section === "mcp" && (
          <>
            <h2 className="settings-title">MCP</h2>

            <h3 className="settings-group">Status</h3>
            <div className="settings-stack">
              <div className="settings-card">
                <div className="settings-item">
                  <div className="settings-item-text">
                    <div className="settings-item-title">
                      <span
                        className={`mcp-dot ${
                          mcpStatus?.running ? "ok" : "bad"
                        }`}
                        aria-hidden
                      />
                      Bridge{" "}
                      {mcpStatus == null
                        ? "…"
                        : mcpStatus.running
                          ? "running"
                          : "not running"}
                    </div>
                    <div className="settings-item-desc">
                      {mcpStatus
                        ? `Port ${mcpStatus.port} · ${mcpStatus.bridgeUrl}`
                        : "Checking localhost bridge…"}
                      {" · "}
                      Keep Inpost open while agents use stdio.
                    </div>
                  </div>
                  <button
                    type="button"
                    className="settings-action"
                    onClick={onOpenMcpLogs}
                  >
                    Logs
                  </button>
                </div>
              </div>
              {mcpStatus && (
                <div className="settings-card">
                  <div className="settings-item">
                    <div className="settings-item-text">
                      <div className="settings-item-title">Bridge URL</div>
                      <div className="settings-item-desc">
                        Local HTTP endpoint the stdio proxy talks to.
                      </div>
                      <code className="settings-mono">
                        {mcpStatus.bridgeUrl}
                      </code>
                    </div>
                    <button
                      type="button"
                      className="settings-action"
                      onClick={() =>
                        void copy("url", mcpStatus.bridgeUrl)
                      }
                    >
                      {copied === "url" ? "Copied" : "Copy"}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <h3 className="settings-group">Setup</h3>
            <div className="settings-stack">
              <div className="settings-card">
                <div className="settings-item">
                  <div className="settings-item-text">
                    <div className="settings-item-title">Stdio path</div>
                    <div className="settings-item-desc">
                      Point Cursor or another MCP client at this script. Keep
                      Inpost open — the path refreshes each launch.
                    </div>
                    <code className="settings-mono">
                      {path ?? "Loading…"}
                    </code>
                  </div>
                  <button
                    type="button"
                    className="settings-action"
                    disabled={!path}
                    onClick={() => path && void copy("path", path)}
                  >
                    {copied === "path" ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>
            </div>

            <h3 className="settings-group">Cursor config</h3>
            <div className="settings-stack">
              <div className="settings-card">
                <div className="settings-item settings-item-stack">
                  <div className="settings-item-head">
                    <div className="settings-item-text">
                      <div className="settings-item-title">mcp.json snippet</div>
                      <div className="settings-item-desc">
                        Paste into your MCP client config.
                      </div>
                    </div>
                    <button
                      type="button"
                      className="settings-action"
                      disabled={!path}
                      onClick={() =>
                        path && void copy("json", mcpCursorConfig(path))
                      }
                    >
                      {copied === "json" ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <pre className="settings-code">
                    {path ? mcpCursorConfig(path) : "Loading…"}
                  </pre>
                </div>
              </div>
            </div>
          </>
        )}
        {selectedWsId != null && (
          <>
            <h2 className="settings-title">
              {selectedWs?.name ?? "Workspace"}
            </h2>

            {selectedWs == null ? (
              <div className="settings-stack">
                <div className="settings-card">
                  <div className="settings-item">
                    <div className="settings-item-text">
                      <div className="settings-item-title">Not found</div>
                      <div className="settings-item-desc">
                        This workspace was removed. Pick another from the list.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <h3 className="settings-group">Identity</h3>
                <div className="settings-stack">
                  <div className="settings-card">
                    <div className="settings-item">
                      <div className="settings-item-text">
                        <div className="settings-item-title">Name</div>
                        <div className="settings-item-desc">
                          Shown in the workspace picker and titlebar.
                        </div>
                      </div>
                      <button
                        type="button"
                        className="settings-action"
                        onClick={() => onRenameWorkspace(selectedWs)}
                      >
                        Rename
                      </button>
                    </div>
                  </div>
                  <div className="settings-card">
                    <div className="settings-item">
                      <div className="settings-item-text">
                        <div className="settings-item-title">Workspace ID</div>
                        <div className="settings-item-desc">
                          Use with MCP tools that take a workspaceId.
                        </div>
                        <code className="settings-mono">{selectedWs.id}</code>
                      </div>
                      <button
                        type="button"
                        className="settings-action"
                        onClick={() => void copy("wsid", selectedWs.id)}
                      >
                        {copied === "wsid" ? "Copied" : "Copy"}
                      </button>
                    </div>
                  </div>
                </div>

                <h3 className="settings-group">Switch</h3>
                <div className="settings-stack">
                  <div className="settings-card">
                    <div className="settings-item">
                      <div className="settings-item-text">
                        <div className="settings-item-title">
                          {selectedWs.id === workspaceId
                            ? "Currently active"
                            : "Open this workspace"}
                        </div>
                        <div className="settings-item-desc">
                          {selectedWs.id === workspaceId
                            ? "Collections, open tabs, dock, and history in the main view belong to this workspace and are restored when you return."
                            : "Switches the sidebar and restores this workspace’s open tabs and layout."}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="settings-action"
                        disabled={selectedWs.id === workspaceId}
                        onClick={() => onSwitchWorkspace(selectedWs.id)}
                      >
                        {selectedWs.id === workspaceId ? "Active" : "Switch"}
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </>
        )}
        </div>
      </div>

    </div>
  );
}

/** Zero-size drag handle. Live layout is applied via DOM in `onDrag` (no React re-render). */
function Sash({
  axis,
  onDrag,
  onDragEnd,
  label,
}: {
  axis: "x" | "y";
  onDrag: (clientX: number, clientY: number) => void;
  onDragEnd: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      className={`sash sash-${axis === "x" ? "col" : "row"}`}
      aria-label={label}
      tabIndex={-1}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        const el = e.currentTarget;
        el.setPointerCapture(e.pointerId);
        el.classList.add("active");
        document.body.classList.add(
          "sash-dragging",
          axis === "x" ? "sash-dragging-col" : "sash-dragging-row",
        );
      }}
      onPointerMove={(e) => {
        if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
        onDrag(e.clientX, e.clientY);
      }}
      onPointerUp={(e) => {
        if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
        e.currentTarget.releasePointerCapture(e.pointerId);
        e.currentTarget.classList.remove("active");
        document.body.classList.remove(
          "sash-dragging",
          "sash-dragging-col",
          "sash-dragging-row",
        );
        onDragEnd();
      }}
      onPointerCancel={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
        e.currentTarget.classList.remove("active");
        document.body.classList.remove(
          "sash-dragging",
          "sash-dragging-col",
          "sash-dragging-row",
        );
        onDragEnd();
      }}
    />
  );
}

function applyEditorSplitStyle(
  el: HTMLElement | null,
  axis: "x" | "y",
  ratio: number,
) {
  if (!el) return;
  if (axis === "x") {
    el.style.gridTemplateColumns = `minmax(140px, ${ratio}fr) 0px minmax(140px, ${1 - ratio}fr)`;
    el.style.gridTemplateRows = "1fr";
  } else {
    el.style.gridTemplateColumns = "1fr";
    el.style.gridTemplateRows = `minmax(100px, ${ratio}fr) 0px minmax(100px, ${1 - ratio}fr)`;
  }
}

function App() {
  const dialogs = useDialogs();
  const bootSession = useMemo(() => {
    const id = loadWorkspaceId();
    return loadWorkspaceSession(id) ?? emptySession();
  }, []);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState(loadWorkspaceId);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [collectionId, setCollectionId] = useState(bootSession.collectionId);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>(
    () => bootSession.expandedFolders,
  );
  /** VS Code-style create target: folder → inside; request → sibling; collection → root. */
  const [treeAnchor, setTreeAnchor] = useState<
    | { kind: "folder" | "request" | "collection"; id: string }
    | null
  >(null);
  const [treeSearch, setTreeSearch] = useState("");
  const [newReqMenuOpen, setNewReqMenuOpen] = useState(false);
  const newReqMenuRef = useRef<HTMLDivElement>(null);
  const [treeMenu, setTreeMenu] = useState<{
    target: "folder" | "request" | "collection" | "environment";
    id: string;
    kind: "add" | "more";
    top: number;
    left: number;
  } | null>(null);
  const [envSync, setEnvSync] = useState<{
    sourceId: string;
    targetId: string;
    selected: string[];
  } | null>(null);
  const [renaming, setRenaming] = useState<{
    kind: "folder" | "request" | "collection";
    id: string;
  } | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);
  const [requests, setRequests] = useState<HttpRequest[]>([]);
  const [envs, setEnvs] = useState<Environment[]>([]);
  const [draft, setDraft] = useState<HttpRequest | null>(null);
  const [headers, setHeaders] = useState<Pair[]>([
    { key: "", value: "", enabled: true },
  ]);
  const [query, setQuery] = useState<Pair[]>([
    { key: "", value: "", enabled: true },
  ]);
  const [bodyPairs, setBodyPairs] = useState<Pair[]>([
    { key: "", value: "", enabled: true },
  ]);
  const [pathPairs, setPathPairs] = useState<Pair[]>([]);
  const [urlBase, setUrlBase] = useState("");
  const [result, setResult] = useState<SendResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [reqTab, setReqTab] = useState<ReqTab>("params");
  const [resTab, setResTab] = useState<ResTab>("body");
  const [bodyView, setBodyView] = useState<"pretty" | "raw">("pretty");
  const [envDrafts, setEnvDrafts] = useState<Record<string, Pair[]>>({});
  /** Dedicated environment editor (not under request Env tab). */
  const [envViewId, setEnvViewId] = useState<string | null>(
    () => bootSession.envViewId,
  );
  const [envVarFilter, setEnvVarFilter] = useState("");
  const [rail, setRail] = useState<Rail>(() => bootSession.rail);
  const [search, setSearch] = useState("");
  const [searchIndex, setSearchIndex] = useState<IndexItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [requestHistory, setRequestHistory] = useState<HistoryEntry[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [viewingHistoryId, setViewingHistoryId] = useState<string | null>(null);
  const historyPopRef = useRef<HTMLDivElement>(null);
  const [layoutDock, setLayoutDock] = useState<LayoutDock>(
    () => bootSession.layoutDock,
  );
  const [responseHidden, setResponseHidden] = useState(
    () => bootSession.responseHidden,
  );
  const [sidebarWidth, setSidebarWidth] = useState(
    () => bootSession.sidebarWidth,
  );
  const [splitRatio, setSplitRatio] = useState(() => bootSession.splitRatio);
  const shellRef = useRef<HTMLDivElement>(null);
  const splitRef = useRef<HTMLDivElement>(null);
  const tabStripRef = useRef<HTMLDivElement>(null);
  const tabSearchRef = useRef<HTMLDivElement>(null);
  const tabSearchInputRef = useRef<HTMLInputElement>(null);
  const [tabSearchOpen, setTabSearchOpen] = useState(false);
  const [tabSearchQuery, setTabSearchQuery] = useState("");
  const [tabSearchIndex, setTabSearchIndex] = useState(0);
  const sidebarWidthRef = useRef(sidebarWidth);
  const splitRatioRef = useRef(splitRatio);
  sidebarWidthRef.current = sidebarWidth;
  splitRatioRef.current = splitRatio;
  const [devMode, setDevMode] = useState(loadDevMode);
  const [narrowSplit, setNarrowSplit] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(max-width: 1100px)").matches
      : false,
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1100px)");
    const onChange = () => setNarrowSplit(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  const editorSplitAxis: "x" | "y" =
    layoutDock === "bottom" || narrowSplit ? "y" : "x";
  const editorSplitAxisRef = useRef(editorSplitAxis);
  editorSplitAxisRef.current = editorSplitAxis;
  const [openTabs, setOpenTabs] = useState<string[]>(() => bootSession.openTabs);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>(() =>
    asSettingsSection(bootSession.settingsSection),
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    () => bootSession.selectedId,
  );

  // Keep the active tab visible when switching or opening beyond the edge.
  useEffect(() => {
    tabStripRef.current
      ?.querySelector(".opentab.active")
      ?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [selectedId, openTabs]);
  const [mcpStatus, setMcpStatus] = useState<McpStatus | null>(null);
  const [mcpLogsOpen, setMcpLogsOpen] = useState(false);
  const [mcpLogs, setMcpLogs] = useState<McpLogEntry[]>([]);
  const mcpLogPopRef = useRef<HTMLDivElement>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importMode, setImportMode] = useState<"file" | "paste">("file");
  const [importText, setImportText] = useState("");
  const [importFileName, setImportFileName] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importDragOver, setImportDragOver] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);
  const [exportToast, setExportToast] = useState<{
    path: string;
    revealError?: string;
  } | null>(null);

  // Auto-dismiss the export toast; a manual Dismiss button also clears it.
  useEffect(() => {
    if (!exportToast) return;
    const t = window.setTimeout(() => setExportToast(null), 8000);
    return () => window.clearTimeout(t);
  }, [exportToast]);
  const globalSearchRef = useRef<HTMLInputElement>(null);
  const [tabCache, setTabCache] = useState<
    Record<
      string,
      {
        draft: HttpRequest;
        headers: Pair[];
        query: Pair[];
        bodyPairs: Pair[];
        pathPairs: Pair[];
        urlBase: string;
        result: SendResult | null;
        error: string | null;
      }
    >
  >({});
  const [savedById, setSavedById] = useState<Record<string, SavedSnap>>({});
  const [crumbEditing, setCrumbEditing] = useState(false);
  const [crumbDraft, setCrumbDraft] = useState("");
  const urlRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef({
    draft,
    headers,
    query,
    bodyPairs,
    pathPairs,
    urlBase,
    result,
    error,
  });
  editorRef.current = {
    draft,
    headers,
    query,
    bodyPairs,
    pathPairs,
    urlBase,
    result,
    error,
  };

  const sessionRef = useRef<WorkspaceSession>(bootSession);
  sessionRef.current = {
    openTabs,
    selectedId,
    collectionId,
    layoutDock,
    responseHidden,
    rail,
    expandedFolders,
    settingsSection,
    envViewId,
    sidebarWidth,
    splitRatio,
  };
  const skipSessionPersist = useRef(true);

  function applyWorkspaceSession(session: WorkspaceSession) {
    skipSessionPersist.current = true;
    setOpenTabs(session.openTabs);
    setSelectedId(session.selectedId);
    setCollectionId(session.collectionId);
    setLayoutDock(session.layoutDock);
    setResponseHidden(session.responseHidden);
    setRail(session.rail);
    setExpandedFolders(session.expandedFolders);
    setSettingsSection(asSettingsSection(session.settingsSection));
    setEnvViewId(session.envViewId);
    setSidebarWidth(session.sidebarWidth);
    setSplitRatio(session.splitRatio);
    setDraft(null);
    setHeaders([{ key: "", value: "", enabled: true }]);
    setQuery([{ key: "", value: "", enabled: true }]);
    setBodyPairs([{ key: "", value: "", enabled: true }]);
    setPathPairs([]);
    setUrlBase("");
    setResult(null);
    setError(null);
    setTabCache({});
    setSavedById({});
    setHistoryOpen(false);
    setViewingHistoryId(null);
    setCrumbEditing(false);
  }

  useEffect(() => {
    if (skipSessionPersist.current) {
      skipSessionPersist.current = false;
      return;
    }
    if (!workspaceId) return;
    saveWorkspaceSession(workspaceId, sessionRef.current);
  }, [
    workspaceId,
    openTabs,
    selectedId,
    collectionId,
    layoutDock,
    responseHidden,
    rail,
    expandedFolders,
    settingsSection,
    envViewId,
    sidebarWidth,
    splitRatio,
  ]);

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      try {
        const s = await invoke<McpStatus>("mcp_status");
        if (!cancelled) setMcpStatus(s);
      } catch {
        if (!cancelled) setMcpStatus(null);
      }
    }
    void tick();
    const id = window.setInterval(() => void tick(), 3000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  async function refreshMcpLogs() {
    try {
      const list = await invoke<McpLogEntry[]>("mcp_logs");
      setMcpLogs([...list].reverse());
    } catch {
      setMcpLogs([]);
    }
  }

  function openMcpLogs() {
    setMcpLogsOpen(true);
    void refreshMcpLogs();
  }

  useEffect(() => {
    if (!mcpLogsOpen) return;
    void refreshMcpLogs();
    const id = window.setInterval(() => void refreshMcpLogs(), 1500);
    function onDoc(e: MouseEvent) {
      if (
        mcpLogPopRef.current &&
        !mcpLogPopRef.current.contains(e.target as Node)
      ) {
        setMcpLogsOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("mousedown", onDoc);
    };
  }, [mcpLogsOpen]);

  const refreshEnvs = useCallback(async () => {
    const list = await invoke<Environment[]>("list_environments");
    setEnvs(list);
    const drafts: Record<string, Pair[]> = {};
    for (const e of list) drafts[e.id] = parseVars(e.varsJson);
    setEnvDrafts(drafts);
  }, []);

  const refreshWorkspaces = useCallback(async () => {
    const list = await invoke<Workspace[]>("list_workspaces");
    setWorkspaces(list);
    setWorkspaceId((cur) => {
      const next =
        list.find((w) => w.id === cur)?.id || list[0]?.id || "";
      if (next) saveWorkspaceId(next);
      return next;
    });
  }, []);

  const refreshCollections = useCallback(async () => {
    if (!workspaceId) {
      setCollections([]);
      setCollectionId("");
      return;
    }
    const cols = await invoke<Collection[]>("list_collections", {
      workspaceId,
    });
    setCollections(cols);
    setCollectionId((cur) =>
      cols.find((c) => c.id === cur)?.id || cols[0]?.id || "",
    );
  }, [workspaceId]);

  function markSaved(r: HttpRequest) {
    setSavedById((s) => ({ ...s, [r.id]: snapOf(r) }));
  }

  function applyRequest(r: HttpRequest, cached?: {
    draft: HttpRequest;
    headers: Pair[];
    query: Pair[];
    bodyPairs: Pair[];
    pathPairs: Pair[];
    urlBase: string;
    result: SendResult | null;
    error: string | null;
  }) {
    setCrumbEditing(false);
    if (cached) {
      setDraft(cached.draft);
      setHeaders(cached.headers);
      setQuery(cached.query);
      setBodyPairs(cached.bodyPairs);
      setPathPairs(cached.pathPairs);
      setUrlBase(cached.urlBase);
      setResult(cached.result);
      setError(cached.error);
    } else {
      const n = normalizeRequest(r);
      setDraft(n);
      setHeaders(parsePairs(n.headersJson));
      setBodyPairs(parsePairs(n.bodyPairsJson!));
      const { base, query: q } = splitUrl(n.url);
      setUrlBase(base);
      setQuery(q);
      setPathPairs(mergePathPairs(base, parsePairs(n.pathVarsJson!)));
      setResult(null);
      setError(null);
      markSaved(n);
    }
    setSelectedId(r.id);
  }

  function curSnap(d: HttpRequest, h: Pair[], q: Pair[], bp: Pair[], pp: Pair[], base: string): SavedSnap {
    return {
      name: d.name,
      description: d.description ?? "",
      method: d.method,
      url: joinUrl(base, q),
      headersJson: pairsToJson(h),
      body: d.body,
      bodyType: d.bodyType ?? "none",
      bodyPairsJson: bodyPairsToJson(bp),
      authType: d.authType ?? "none",
      authJson: d.authJson ?? "{}",
      pathVarsJson: pairsToJson(pp),
    };
  }

  function tabDirty(id: string): boolean {
    const saved = savedById[id];
    if (!saved) return false;
    if (id === selectedId && draft && selectedId !== SETTINGS_ID) {
      return snapDirty(
        saved,
        curSnap(draft, headers, query, bodyPairs, pathPairs, urlBase),
      );
    }
    const cached = tabCache[id];
    if (cached) {
      return snapDirty(
        saved,
        curSnap(
          cached.draft,
          cached.headers,
          cached.query,
          cached.bodyPairs,
          cached.pathPairs,
          cached.urlBase,
        ),
      );
    }
    return false;
  }

  function snapshotActive() {
    const cur = editorRef.current;
    if (!cur.draft) return;
    const id = cur.draft.id;
    setTabCache((c) => ({
      ...c,
      [id]: {
        draft: cur.draft!,
        headers: cur.headers,
        query: cur.query,
        bodyPairs: cur.bodyPairs,
        pathPairs: cur.pathPairs,
        urlBase: cur.urlBase,
        result: cur.result,
        error: cur.error,
      },
    }));
  }

  function openRequest(r: HttpRequest) {
    snapshotActive();
    setEnvViewId(null);
    setOpenTabs((tabs) => (tabs.includes(r.id) ? tabs : [...tabs, r.id]));
    applyRequest(r, tabCache[r.id]);
    setRail("collections");
  }

  function openSettings() {
    snapshotActive();
    setEnvViewId(null);
    setOpenTabs((tabs) =>
      tabs.includes(SETTINGS_ID) ? tabs : [...tabs, SETTINGS_ID],
    );
    setSelectedId(SETTINGS_ID);
  }

  function openWorkspaceSettings(id: string) {
    openSettings();
    setSettingsSection(wsSettingsId(id));
  }

  function openCollectionDocs(collectionId: string) {
    snapshotActive();
    setEnvViewId(null);
    const tid = coldocTabId(collectionId);
    setOpenTabs((tabs) => (tabs.includes(tid) ? tabs : [...tabs, tid]));
    setSelectedId(tid);
  }

  function switchTab(id: string) {
    setEnvViewId(null);
    if (id === selectedId) return;
    snapshotActive();
    if (id === SETTINGS_ID || id.startsWith(COLDOC_PREFIX)) {
      setSelectedId(id);
      return;
    }
    const fromList = requests.find((r) => r.id === id);
    if (!fromList) return;
    applyRequest(fromList, tabCache[id]);
  }

  function openEnvView(id: string) {
    setEnvViewId(id);
    setEnvVarFilter("");
    setRail("environments");
  }

  function closeTab(id: string) {
    setOpenTabs((tabs) => {
      const next = tabs.filter((t) => t !== id);
      if (id === selectedId) {
        const fallback = next[next.length - 1];
        if (fallback === SETTINGS_ID || fallback?.startsWith(COLDOC_PREFIX)) {
          setSelectedId(fallback);
        } else if (fallback) {
          const r = requests.find((x) => x.id === fallback);
          if (r) applyRequest(r, tabCache[fallback]);
          else {
            setSelectedId(null);
            setDraft(null);
            setResult(null);
            setError(null);
          }
        } else {
          setSelectedId(null);
          setDraft(null);
          setResult(null);
          setError(null);
        }
      }
      return next;
    });
    if (id !== SETTINGS_ID) {
      setTabCache((c) => {
        const { [id]: _, ...rest } = c;
        return rest;
      });
      setSavedById((s) => {
        const { [id]: _, ...rest } = s;
        return rest;
      });
    }
  }

  function openTabSearch() {
    setTabSearchOpen((was) => {
      if (was) {
        setTabSearchQuery("");
        setTabSearchIndex(0);
        return false;
      }
      setTabSearchQuery("");
      setTabSearchIndex(0);
      queueMicrotask(() => tabSearchInputRef.current?.focus());
      return true;
    });
  }

  function pickTabSearch(id: string) {
    setTabSearchOpen(false);
    setTabSearchQuery("");
    setTabSearchIndex(0);
    if (id.startsWith("env:")) {
      openEnvView(id.slice(4));
      return;
    }
    switchTab(id);
  }

  useEffect(() => {
    if (!tabSearchOpen) return;
    function onDoc(e: MouseEvent) {
      if (tabSearchRef.current && !tabSearchRef.current.contains(e.target as Node)) {
        setTabSearchOpen(false);
        setTabSearchQuery("");
        setTabSearchIndex(0);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setTabSearchOpen(false);
        setTabSearchQuery("");
        setTabSearchIndex(0);
      }
    }
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [tabSearchOpen]);

  useEffect(() => {
    if (!tabSearchOpen) return;
    tabSearchRef.current
      ?.querySelector(".tab-search-item.kbd")
      ?.scrollIntoView({ block: "nearest" });
  }, [tabSearchOpen, tabSearchIndex, tabSearchQuery]);

  const refreshTree = useCallback(async (cid: string) => {
    if (!cid) return [] as HttpRequest[];
    const [list, folderList] = await Promise.all([
      invoke<HttpRequest[]>("list_requests", { collectionId: cid }),
      invoke<Folder[]>("list_folders", { collectionId: cid }),
    ]);
    setRequests(list);
    setFolders(folderList);
    setExpandedFolders((prev) => {
      const next = { ...prev };
      for (const f of folderList) {
        if (next[f.id] === undefined) next[f.id] = true;
      }
      return next;
    });
    return list;
  }, []);

  const refreshRequests = useCallback(
    async (cid: string, preferId?: string | null) => {
      if (!cid) return;
      const list = await refreshTree(cid);
      const pick =
        list.find((r) => r.id === preferId) ??
        list.find((r) => r.id === selectedId) ??
        list[0] ??
        null;
      if (pick) {
        setOpenTabs((tabs) =>
          tabs.includes(pick.id) ? tabs : [...tabs, pick.id],
        );
        applyRequest(pick);
      } else {
        setSelectedId(null);
        setDraft(null);
        setOpenTabs([]);
      }
    },
    [selectedId, refreshTree],
  );

  useEffect(() => {
    refreshWorkspaces().catch((e) => setError(String(e)));
    refreshEnvs().catch((e) => setError(String(e)));
  }, [refreshWorkspaces, refreshEnvs]);

  useEffect(() => {
    refreshCollections().catch((e) => setError(String(e)));
  }, [refreshCollections]);

  useEffect(() => {
    if (collectionId) {
      refreshTree(collectionId).catch((e) => setError(String(e)));
    } else {
      setRequests([]);
      setFolders([]);
    }
    // intentionally only when collection changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionId]);

  // Restore editor for the selected request after the collection tree loads.
  useEffect(() => {
    if (!selectedId || selectedId === SETTINGS_ID || envViewId) return;
    if (draft?.id === selectedId) return;
    const r = requests.find((x) => x.id === selectedId);
    if (r) applyRequest(r);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requests, selectedId, envViewId]);

  // First visit to a collection with no tabs: open the first request (old UX).
  useEffect(() => {
    if (!collectionId || requests.length === 0) return;
    if (selectedId === SETTINGS_ID || envViewId) return;
    if (selectedId && requests.some((r) => r.id === selectedId)) return;
    if (openTabs.some((t) => t !== SETTINGS_ID)) return;
    if (selectedId != null) return;
    const pick = requests[0];
    setOpenTabs((tabs) => (tabs.includes(pick.id) ? tabs : [...tabs, pick.id]));
    applyRequest(pick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requests, collectionId]);

  const composedUrl = useMemo(() => joinUrl(urlBase, query), [urlBase, query]);
  const headerCount = headers.filter(
    (h) => h.enabled !== false && h.key.trim(),
  ).length;
  const bodyType = asBodyType(draft?.bodyType);
  const bodyHasContent =
    bodyType === "urlencoded" || bodyType === "multipart"
      ? bodyPairs.some((p) => p.enabled !== false && p.key.trim())
      : bodyType !== "none" && Boolean(draft?.body?.trim());
  const authType = asAuthType(draft?.authType);
  const authFields = parseAuthJson(draft?.authJson ?? "{}");

  function setBodyType(next: BodyType) {
    if (!draft) return;
    setDraft({ ...draft, bodyType: next });
    setHeaders((h) => syncContentType(h, next));
  }

  function setAuthType(next: AuthType) {
    if (!draft) return;
    setDraft({
      ...draft,
      authType: next,
      authJson: next === "none" ? "{}" : draft.authJson || "{}",
    });
  }

  function patchAuth(patch: Record<string, string>) {
    if (!draft) return;
    setDraft({
      ...draft,
      authJson: JSON.stringify({ ...authFields, ...patch }),
    });
  }

  function onUrlChange(next: string) {
    const { base, query: q } = splitUrl(next);
    setUrlBase(base);
    setQuery(
      q.length && (q[q.length - 1].key || q[q.length - 1].value)
        ? [...q, { key: "", value: "", enabled: true }]
        : q,
    );
    setPathPairs((prev) => mergePathPairs(base, prev));
  }
  const activeEnvs = envs.filter((e) => !e.isGlobal);
  const activeEnv = activeEnvs.find((e) => e.isActive);
  const globalEnv = envs.find((e) => e.isGlobal) ?? null;
  const activeVarMap = useMemo(
    () =>
      pairsToMap(
        activeEnv
          ? (envDrafts[activeEnv.id] ?? parseVars(activeEnv.varsJson))
          : [],
      ),
    [activeEnv, envDrafts],
  );
  const globalVarMap = useMemo(
    () =>
      pairsToMap(
        globalEnv
          ? (envDrafts[globalEnv.id] ?? parseVars(globalEnv.varsJson))
          : [],
      ),
    [globalEnv, envDrafts],
  );
  const resolvedUrl = useMemo(
    () =>
      resolveRequestUrl(composedUrl, pathPairs, activeVarMap, globalVarMap),
    [composedUrl, pathPairs, activeVarMap, globalVarMap],
  );
  const requestTitles = useMemo(() => {
    const m = new Map<string, string>();
    for (const item of searchIndex) {
      if (item.kind === "request" && item.title.trim()) {
        m.set(item.id, item.title);
      }
    }
    for (const r of requests) {
      if (r.name.trim()) m.set(r.id, r.name);
    }
    return m;
  }, [searchIndex, requests]);

  const treeVis = useMemo(
    () => computeTreeVisibility(treeSearch, folders, requests),
    [treeSearch, folders, requests],
  );
  const treeSearchQ = treeSearch.trim().toLowerCase();
  const anyFolderExpanded = folders.some(
    (f) => expandedFolders[f.id] !== false,
  );
  const viewingEnv = envViewId
    ? envs.find((e) => e.id === envViewId) ?? null
    : null;

  function buildTabSearchItems() {
    const items: {
      id: string;
      name: string;
      kind: "settings" | "request" | "env" | "docs";
      method?: string;
      dirty: boolean;
      active: boolean;
      haystack: string;
    }[] = [];
    for (const id of openTabs) {
      if (id === SETTINGS_ID) {
        items.push({
          id,
          name: "Settings",
          kind: "settings",
          dirty: false,
          active: !envViewId && selectedId === SETTINGS_ID,
          haystack: "settings",
        });
        continue;
      }
      const docColId = parseColdocTab(id);
      if (docColId) {
        const name =
          collections.find((c) => c.id === docColId)?.name ?? "Docs";
        items.push({
          id,
          name,
          kind: "docs",
          dirty: false,
          active: !envViewId && selectedId === id,
          haystack: `${name} docs documentation`.toLowerCase(),
        });
        continue;
      }
      const cached = tabCache[id]?.draft;
      const fromList = requests.find((r) => r.id === id);
      const r =
        selectedId === id && draft ? draft : cached ?? fromList;
      if (!r) continue;
      const name = r.name || "Untitled";
      items.push({
        id,
        name,
        kind: "request",
        method: r.method,
        dirty: tabDirty(id),
        active: !envViewId && id === selectedId,
        haystack: `${r.method} ${name}`.toLowerCase(),
      });
    }
    if (viewingEnv) {
      items.push({
        id: `env:${viewingEnv.id}`,
        name: viewingEnv.name,
        kind: "env",
        dirty: false,
        active: !!envViewId,
        haystack: viewingEnv.name.toLowerCase(),
      });
    }
    return items;
  }

  const collection = collections.find((c) => c.id === collectionId);

  const refreshSearchIndex = useCallback(async () => {
    if (!workspaces.length) {
      setSearchIndex([]);
      return;
    }
    setSearchLoading(true);
    try {
      const all: IndexItem[] = [];
      for (const ws of workspaces) {
        const cols = await invoke<Collection[]>("list_collections", {
          workspaceId: ws.id,
        });
        for (const col of cols) {
          all.push({
            kind: "collection",
            id: col.id,
            title: col.name,
            path: [],
            collectionId: col.id,
            collectionName: col.name,
            workspaceId: ws.id,
            workspaceName: ws.name,
          });
          const [folderList, reqList] = await Promise.all([
            invoke<Folder[]>("list_folders", { collectionId: col.id }),
            invoke<HttpRequest[]>("list_requests", { collectionId: col.id }),
          ]);
          for (const f of folderList) {
            all.push({
              kind: "folder",
              id: f.id,
              title: f.name,
              path: folderPath(f.parentId, folderList),
              collectionId: col.id,
              collectionName: col.name,
              workspaceId: ws.id,
              workspaceName: ws.name,
              folderId: f.id,
            });
          }
          for (const r of reqList) {
            all.push({
              kind: "request",
              id: r.id,
              title: r.name,
              method: r.method,
              url: r.url,
              path: folderPath(r.folderId, folderList),
              collectionId: col.id,
              collectionName: col.name,
              workspaceId: ws.id,
              workspaceName: ws.name,
              folderId: r.folderId,
            });
          }
        }
      }
      setSearchIndex(all);
    } catch (e) {
      setError(String(e));
    } finally {
      setSearchLoading(false);
    }
  }, [workspaces]);

  async function onSearchOpen(item: IndexItem) {
    if (item.workspaceId !== workspaceId) {
      if (workspaceId) {
        saveWorkspaceSession(workspaceId, sessionRef.current);
      }
      setWorkspaceId(item.workspaceId);
      saveWorkspaceId(item.workspaceId);
      applyWorkspaceSession(
        loadWorkspaceSession(item.workspaceId) ?? emptySession(layoutDock),
      );
    }
    const cols = await invoke<Collection[]>("list_collections", {
      workspaceId: item.workspaceId,
    });
    setCollections(cols);
    setCollectionId(item.collectionId);
    setRail("collections");
    const [folderList, reqList] = await Promise.all([
      invoke<Folder[]>("list_folders", { collectionId: item.collectionId }),
      invoke<HttpRequest[]>("list_requests", { collectionId: item.collectionId }),
    ]);
    setFolders(folderList);
    setRequests(reqList);
    setExpandedFolders((prev) => {
      const next = { ...prev };
      for (const f of folderList) {
        if (next[f.id] === undefined) next[f.id] = true;
      }
      if (item.folderId) next[item.folderId] = true;
      if (item.kind === "folder") next[item.id] = true;
      return next;
    });
    if (item.kind === "request") {
      const r = reqList.find((x) => x.id === item.id);
      if (r) openRequest(r);
    }
  }

  useEffect(() => {
    if (workspaces.length) void refreshSearchIndex();
  }, [workspaces, refreshSearchIndex]);

  useEffect(() => {
    refreshWorkspaceHistory().catch((e) => setError(String(e)));
  }, [workspaceId]);

  useEffect(() => {
    refreshRequestHistory(selectedId).catch((e) => setError(String(e)));
    setHistoryOpen(false);
    setViewingHistoryId(null);
  }, [selectedId]);

  useEffect(() => {
    if (!historyOpen) return;
    function onDoc(e: MouseEvent) {
      if (
        historyPopRef.current &&
        !historyPopRef.current.contains(e.target as Node)
      ) {
        setHistoryOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [historyOpen]);

  async function save() {
    if (!draft) return null;
    const request: HttpRequest = {
      ...normalizeRequest(draft),
      url: composedUrl,
      headersJson: pairsToJson(headers),
      bodyPairsJson: bodyPairsToJson(bodyPairs),
      pathVarsJson: pairsToJson(pathPairs),
    };
    const saved = await invoke<HttpRequest>("upsert_request", { request });
    const n = normalizeRequest(saved);
    setDraft(n);
    markSaved(n);
    setTabCache((c) => {
      const { [saved.id]: _, ...rest } = c;
      return rest;
    });
    await refreshRequests(saved.collectionId, saved.id);
    return n;
  }

  async function refreshWorkspaceHistory() {
    if (!workspaceId) {
      setHistory([]);
      return;
    }
    const list = await invoke<HistoryEntry[]>("list_workspace_history", {
      workspaceId,
      limit: 100,
    });
    setHistory(list);
  }

  async function refreshRequestHistory(requestId: string | null) {
    if (!requestId) {
      setRequestHistory([]);
      return;
    }
    const list = await invoke<HistoryEntry[]>("list_request_history", {
      requestId,
      limit: 50,
    });
    setRequestHistory(list);
  }

  async function recordHistory(partial: {
    requestId: string;
    method: string;
    url: string;
    status?: number;
    statusText?: string;
    elapsedMs?: number;
    sizeBytes?: number;
    error?: string;
    body?: string;
    bodyPretty?: string | null;
    headers?: [string, string][];
  }) {
    if (!workspaceId) return;
    const entry = await invoke<HistoryEntry>("insert_history", {
      entry: {
        id: crypto.randomUUID(),
        workspaceId,
        requestId: partial.requestId,
        method: partial.method,
        url: partial.url,
        status: partial.status ?? null,
        statusText: partial.statusText ?? null,
        elapsedMs: partial.elapsedMs ?? null,
        sizeBytes: partial.sizeBytes ?? null,
        error: partial.error ?? null,
        body: partial.body ?? null,
        bodyPretty: partial.bodyPretty ?? null,
        headersJson: partial.headers
          ? JSON.stringify(partial.headers)
          : null,
        createdAt: Date.now(),
      },
    });
    setHistory((h) => [entry, ...h].slice(0, 100));
    if (partial.requestId === selectedId || partial.requestId === draft?.id) {
      setRequestHistory((h) => [entry, ...h].slice(0, 50));
    }
    setViewingHistoryId(entry.id);
  }

  function applyHistoryEntry(h: HistoryEntry) {
    setViewingHistoryId(h.id);
    if (h.error) {
      setError(h.error);
      setResult(null);
      return;
    }
    setError(null);
    setResult({
      status: h.status ?? 0,
      statusText: h.statusText ?? "",
      headers: parseHistoryHeaders(h.headersJson),
      body: h.body ?? "",
      bodyPretty: h.bodyPretty ?? null,
      elapsedMs: h.elapsedMs ?? 0,
      resolvedUrl: h.url,
    });
    setResTab("body");
    setBodyView(h.bodyPretty ? "pretty" : "raw");
  }

  async function send() {
    if (!draft) return;
    if (draft.method.toUpperCase() === "WS") {
      setError("WebSocket send isn’t wired yet — HTTP only for now.");
      return;
    }
    setSending(true);
    setError(null);
    setViewingHistoryId(null);
    try {
      const saved = await save();
      if (!saved) return;
      const [activeVars, globalVars] = await invoke<
        [Record<string, string>, Record<string, string>]
      >("resolve_env_maps");
      const res = await invoke<SendResult>("send_http_request", {
        input: {
          method: saved.method,
          url: saved.url,
          headers: JSON.parse(saved.headersJson || "[]"),
          body: saved.body || null,
          bodyType: saved.bodyType ?? "none",
          bodyPairs: bodyPairsForSend(parsePairs(saved.bodyPairsJson || "[]")),
          authType: saved.authType ?? "none",
          authJson: saved.authJson ?? "{}",
          pathVars: JSON.parse(saved.pathVarsJson || "[]"),
          activeVars,
          globalVars,
        },
      });
      setResult(res);
      setResTab("body");
      setBodyView(res.bodyPretty ? "pretty" : "raw");
      await recordHistory({
        requestId: saved.id,
        method: saved.method,
        url: saved.url,
        status: res.status,
        statusText: res.statusText,
        elapsedMs: res.elapsedMs,
        sizeBytes: new TextEncoder().encode(res.body).length,
        body: res.body,
        bodyPretty: res.bodyPretty,
        headers: res.headers,
      });
    } catch (e) {
      const msg = String(e);
      setError(msg);
      setResult(null);
      await recordHistory({
        requestId: draft.id,
        method: draft.method,
        url: composedUrl,
        error: msg,
        elapsedMs: 0,
        sizeBytes: 0,
      });
    } finally {
      setSending(false);
    }
  }

  function createParentFolderId(): string | null {
    if (treeAnchor?.kind === "folder") return treeAnchor.id;
    if (treeAnchor?.kind === "request") {
      return requests.find((r) => r.id === treeAnchor.id)?.folderId ?? null;
    }
    if (treeAnchor?.kind === "collection") return null;
    if (selectedId) {
      return requests.find((r) => r.id === selectedId)?.folderId ?? null;
    }
    return null;
  }

  async function newRequest(opts?: {
    folderId?: string | null;
    kind?: "http" | "websocket";
    collectionId?: string;
  }) {
    const cid = opts?.collectionId ?? collectionId;
    if (!cid) return;
    const folderId =
      opts?.folderId !== undefined ? opts.folderId : createParentFolderId();
    const kind = opts?.kind ?? "http";
    const req: HttpRequest = {
      id: crypto.randomUUID(),
      collectionId: cid,
      folderId,
      name: kind === "websocket" ? "New WebSocket" : "Untitled",
      method: kind === "websocket" ? "WS" : "GET",
      url: kind === "websocket" ? "ws://localhost/" : "{{baseUrl}}/",
      headersJson: "[]",
      body: "",
      bodyType: "none",
      bodyPairsJson: "[]",
      authType: "none",
      authJson: "{}",
      pathVarsJson: "[]",
      sortOrder: 0,
    };
    const saved = await invoke<HttpRequest>("upsert_request", { request: req });
    if (cid !== collectionId) setCollectionId(cid);
    if (folderId) {
      setExpandedFolders((e) => ({ ...e, [folderId]: true }));
    }
    await refreshRequests(cid, saved.id);
    setTreeAnchor({ kind: "request", id: saved.id });
    setRail("collections");
    setNewReqMenuOpen(false);
  }

  async function newFolder(
    parentId?: string | null,
    targetCollectionId?: string,
  ) {
    const cid = targetCollectionId ?? collectionId;
    if (!cid) return;
    const target =
      parentId !== undefined ? parentId : createParentFolderId();
    const name = await dialogs.prompt({
      title: "New folder",
      label: "Folder name",
      defaultValue: "New Folder",
      confirmLabel: "Create",
    });
    if (!name) return;
    if (cid !== collectionId) setCollectionId(cid);
    const folder = await invoke<Folder>("create_folder", {
      collectionId: cid,
      parentId: target,
      name,
    });
    if (target) {
      setExpandedFolders((e) => ({ ...e, [target]: true }));
    }
    setExpandedFolders((e) => ({ ...e, [folder.id]: true }));
    setTreeAnchor({ kind: "folder", id: folder.id });
    await refreshTree(cid);
  }

  async function refreshExplorer() {
    if (!workspaceId) return;
    const cols = await invoke<Collection[]>("list_collections", { workspaceId });
    setCollections(cols);
    if (collectionId) await refreshTree(collectionId);
  }

  function collapseAllFolders() {
    const next: Record<string, boolean> = {};
    for (const f of folders) next[f.id] = false;
    setExpandedFolders(next);
  }

  function expandAllFolders() {
    const next: Record<string, boolean> = {};
    for (const f of folders) next[f.id] = true;
    setExpandedFolders(next);
  }

  async function removeFolder(id: string) {
    const ok = await dialogs.confirm({
      title: "Delete folder?",
      message: "Contents move up one level. This cannot be undone.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    await invoke("delete_folder", { id });
    setTreeMenu(null);
    if (treeAnchor?.kind === "folder" && treeAnchor.id === id) {
      setTreeAnchor(null);
    }
    await refreshTree(collectionId);
  }

  function startRename(
    kind: "folder" | "request" | "collection",
    id: string,
    name: string,
  ) {
    setTreeMenu(null);
    setRenaming({ kind, id });
    setRenameDraft(name);
  }

  async function commitRename() {
    if (!renaming) {
      setRenaming(null);
      return;
    }
    const name = renameDraft.trim();
    const { kind, id } = renaming;
    setRenaming(null);
    if (!name) return;
    try {
      if (kind === "collection") {
        const c = collections.find((x) => x.id === id);
        if (!c || c.name === name) return;
        await invoke<Collection>("rename_collection", { id, name });
        await refreshCollections();
        return;
      }
      if (!collectionId) return;
      if (kind === "folder") {
        const f = folders.find((x) => x.id === id);
        if (!f || f.name === name) return;
        await invoke<Folder>("rename_folder", { id, name });
      } else {
        const r = requests.find((x) => x.id === id);
        if (!r || r.name === name) return;
        const saved = await invoke<HttpRequest>("upsert_request", {
          request: { ...r, name },
        });
        if (draft?.id === id) setDraft({ ...draft, name: saved.name });
        setTabCache((c) => {
          const cur = c[id];
          if (!cur) return c;
          return { ...c, [id]: { ...cur, draft: { ...cur.draft, name: saved.name } } };
        });
        setSavedById((s) => {
          const prev = s[id];
          if (!prev) return s;
          return { ...s, [id]: { ...prev, name: saved.name } };
        });
      }
      await refreshTree(collectionId);
    } catch (e) {
      setError(String(e));
    }
  }

  async function removeCollection(id: string) {
    const c = collections.find((x) => x.id === id);
    const ok = await dialogs.confirm({
      title: "Delete collection?",
      message: `Delete “${c?.name || "Collection"}” and all of its folders and requests? This cannot be undone.`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    await invoke("delete_collection", { id });
    setTreeMenu(null);
    if (treeAnchor?.kind === "collection" && treeAnchor.id === id) {
      setTreeAnchor(null);
    }
    if (collectionId === id) {
      setCollectionId("");
      setRequests([]);
      setFolders([]);
      setDraft(null);
      setSelectedId(null);
      setOpenTabs((tabs) => tabs.filter((t) => t === SETTINGS_ID));
    }
    await refreshCollections();
  }

  async function removeRequest(id: string) {
    const r = requests.find((x) => x.id === id);
    const ok = await dialogs.confirm({
      title: "Delete request?",
      message: `Delete “${r?.name || "Untitled"}”? This cannot be undone.`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    await invoke("delete_request", { id });
    setTreeMenu(null);
    closeTab(id);
    await refreshTree(collectionId);
  }

  async function duplicateRequest(r: HttpRequest) {
    setTreeMenu(null);
    const saved = await invoke<HttpRequest>("upsert_request", {
      request: {
        ...r,
        id: crypto.randomUUID(),
        name: `${r.name || "Untitled"} Copy`,
        sortOrder: 0,
      },
    });
    await refreshRequests(collectionId, saved.id);
  }

  async function dropOnTree(
    drag: { kind: TreeKind; id: string },
    target: { kind: TreeKind; id: string; parentId: string | null },
    intoFolder: boolean,
  ) {
    if (!collectionId || drag.id === target.id) return;
    let newParent: string | null;
    let ordered: { kind: TreeKind; id: string }[];
    if (intoFolder && target.kind === "folder") {
      newParent = target.id;
      ordered = siblingsOf(newParent, folders, requests)
        .filter((s) => s.id !== drag.id)
        .map((s) => ({ kind: s.kind, id: s.id }));
      ordered.push({ kind: drag.kind, id: drag.id });
      setExpandedFolders((e) => ({ ...e, [target.id]: true }));
    } else {
      newParent = target.parentId;
      ordered = siblingsOf(newParent, folders, requests)
        .filter((s) => s.id !== drag.id)
        .map((s) => ({ kind: s.kind, id: s.id }));
      const idx = ordered.findIndex((s) => s.id === target.id);
      ordered.splice(idx >= 0 ? idx : ordered.length, 0, {
        kind: drag.kind,
        id: drag.id,
      });
    }
    try {
      await invoke("reorder_siblings", {
        collectionId,
        parentId: newParent,
        ordered,
      });
      const list = await refreshTree(collectionId);
      if (drag.kind === "request" && drag.id === selectedId) {
        const r = list.find((x) => x.id === drag.id);
        if (r) setDraft((d) => (d && d.id === r.id ? { ...d, folderId: r.folderId } : d));
      }
    } catch (e) {
      setError(String(e));
    }
  }

  async function dropOnRoot(drag: { kind: TreeKind; id: string }) {
    if (!collectionId) return;
    const ordered = siblingsOf(null, folders, requests)
      .filter((s) => s.id !== drag.id)
      .map((s) => ({ kind: s.kind, id: s.id }));
    ordered.push({ kind: drag.kind, id: drag.id });
    try {
      await invoke("reorder_siblings", {
        collectionId,
        parentId: null,
        ordered,
      });
      const list = await refreshTree(collectionId);
      if (drag.kind === "request" && drag.id === selectedId) {
        const r = list.find((x) => x.id === drag.id);
        if (r) setDraft((d) => (d && d.id === r.id ? { ...d, folderId: r.folderId } : d));
      }
    } catch (e) {
      setError(String(e));
    }
  }

  async function newCollection() {
    if (!workspaceId) return;
    const name = await dialogs.prompt({
      title: "New collection",
      label: "Collection name",
      defaultValue: "Collection",
      confirmLabel: "Create",
    });
    if (!name) return;
    const col = await invoke<Collection>("create_collection", {
      name,
      workspaceId,
    });
    await refreshCollections();
    setCollectionId(col.id);
  }

  async function newWorkspace() {
    const name = await dialogs.prompt({
      title: "New workspace",
      label: "Workspace name",
      defaultValue: "Workspace",
      confirmLabel: "Create",
    });
    if (!name) return;
    if (workspaceId) {
      saveWorkspaceSession(workspaceId, sessionRef.current);
    }
    const ws = await invoke<Workspace>("create_workspace", {
      name,
    });
    await refreshWorkspaces();
    setWorkspaceId(ws.id);
    saveWorkspaceId(ws.id);
    applyWorkspaceSession(emptySession(layoutDock));
  }

  function selectWorkspace(id: string) {
    if (id === workspaceId) return;
    if (workspaceId) {
      saveWorkspaceSession(workspaceId, sessionRef.current);
    }
    setWorkspaceId(id);
    saveWorkspaceId(id);
    applyWorkspaceSession(loadWorkspaceSession(id) ?? emptySession(layoutDock));
  }

  async function renameWorkspace(ws: Workspace) {
    const name = await dialogs.prompt({
      title: "Rename workspace",
      label: "Workspace name",
      defaultValue: ws.name,
      confirmLabel: "Rename",
    });
    if (!name || name.trim() === ws.name) return;
    try {
      await invoke<Workspace>("rename_workspace", {
        id: ws.id,
        name: name.trim(),
      });
      await refreshWorkspaces();
    } catch (e) {
      setError(String(e));
    }
  }

  function switchWorkspaceFromSettings(id: string) {
    if (id === workspaceId) return;
    if (workspaceId) {
      saveWorkspaceSession(workspaceId, sessionRef.current);
    }
    setWorkspaceId(id);
    saveWorkspaceId(id);
    const saved = loadWorkspaceSession(id) ?? emptySession(layoutDock);
    const tabs = saved.openTabs.includes(SETTINGS_ID)
      ? saved.openTabs
      : [...saved.openTabs, SETTINGS_ID];
    applyWorkspaceSession({
      ...saved,
      openTabs: tabs,
      selectedId: SETTINGS_ID,
      settingsSection: wsSettingsId(id),
      envViewId: null,
    });
  }

  function openImportModal() {
    setImportOpen(true);
    setImportMode("file");
    setImportText("");
    setImportFileName(null);
    setImportError(null);
    setImportBusy(false);
    setImportDragOver(false);
  }

  function closeImportModal() {
    if (importBusy) return;
    setImportOpen(false);
    setImportError(null);
    setImportDragOver(false);
  }

  async function takeImportFile(file: File) {
    const max = 100 * 1024 * 1024;
    if (file.size > max) {
      setImportError("File is larger than 100 MB.");
      return;
    }
    const name = file.name.toLowerCase();
    if (!/\.(json|ya?ml)$/.test(name) && file.type && !/json|ya?ml|text/.test(file.type)) {
      setImportError("Use a .json, .yaml, or .yml OpenAPI file.");
      return;
    }
    try {
      const text = await file.text();
      setImportText(text);
      setImportFileName(file.name);
      setImportMode("file");
      setImportError(null);
    } catch (e) {
      setImportError(String(e));
    }
  }

  async function importOpenApiSpec() {
    if (!workspaceId) return;
    const spec = importText.trim();
    if (!spec) {
      setImportError("Drop a file, browse, or paste an OpenAPI spec.");
      return;
    }
    setImportBusy(true);
    setImportError(null);
    setError(null);
    try {
      const result = await invoke<{
        collection: Collection;
        requestCount: number;
        baseUrl: string | null;
      }>("import_openapi", { spec, workspaceId });
      await refreshCollections();
      await refreshEnvs();
      setCollectionId(result.collection.id);
      setRail("collections");
      setImportOpen(false);
    } catch (e) {
      setImportError(String(e));
    } finally {
      setImportBusy(false);
    }
  }

  async function exportOpenApi(targetId?: string) {
    const cid = targetId ?? collectionId;
    if (!cid) return;
    setError(null);
    try {
      const name =
        collections.find((c) => c.id === cid)?.name ||
        collection?.name ||
        "collection";
      const path = await invoke<string>("export_openapi", {
        collectionId: cid,
        fileName: name,
      });
      setExportToast({ path });
    } catch (e) {
      setError(String(e));
    }
  }

  async function onEnvChange(id: string) {
    await invoke("set_active_environment", { id });
    await refreshEnvs();
  }

  function applyDock(next: LayoutDock) {
    setLayoutDock(next);
    setResponseHidden(false);
    saveLayoutDock(next);
  }

  function applyDevMode(on: boolean) {
    setDevMode(on);
    saveDevMode(on);
  }

  async function saveEnvVar(name: string, value: string) {
    if (!activeEnv) return;
    const pairs = [
      ...(envDrafts[activeEnv.id] ?? parseVars(activeEnv.varsJson)),
    ];
    const i = pairs.findIndex((p) => p.key.trim() === name);
    if (i >= 0) pairs[i] = { ...pairs[i], key: name, value, enabled: true };
    else {
      // Replace trailing empty row if present
      const last = pairs[pairs.length - 1];
      if (last && !last.key.trim()) {
        pairs[pairs.length - 1] = { key: name, value, enabled: true };
      } else {
        pairs.push({ key: name, value, enabled: true });
      }
    }
    setEnvDrafts((d) => ({ ...d, [activeEnv.id]: pairs }));
    await invoke("upsert_environment", {
      environment: { ...activeEnv, varsJson: varsToJson(pairs) },
    });
    await refreshEnvs();
  }

  const envHover: EnvVarHoverProps = {
    env: activeEnv ? { id: activeEnv.id, name: activeEnv.name } : null,
    envPairs: activeEnv
      ? (envDrafts[activeEnv.id] ?? parseVars(activeEnv.varsJson))
      : [],
    globalPairs: globalEnv
      ? (envDrafts[globalEnv.id] ?? parseVars(globalEnv.varsJson))
      : [],
    onSaveVar: saveEnvVar,
    onOpenEnv: openEnvView,
  };

  async function saveEnv(env: Environment) {
    const pairs = envDrafts[env.id] ?? parseVars(env.varsJson);
    await invoke("upsert_environment", {
      environment: { ...env, varsJson: varsToJson(pairs) },
    });
    await refreshEnvs();
  }

  async function renameEnv(env: Environment) {
    const name = await dialogs.prompt({
      title: "Rename environment",
      label: "Name",
      defaultValue: env.name,
      confirmLabel: "Rename",
    });
    if (!name || name === env.name) return;
    await invoke("upsert_environment", {
      environment: { ...env, name },
    });
    setTreeMenu(null);
    await refreshEnvs();
  }

  async function duplicateEnv(env: Environment) {
    setTreeMenu(null);
    const name = uniqueEnvName(
      `${env.name} Copy`,
      envs.map((e) => e.name),
    );
    const pairs = envDrafts[env.id] ?? parseVars(env.varsJson);
    const copy: Environment = {
      id: crypto.randomUUID(),
      name,
      isGlobal: false,
      isActive: false,
      varsJson: varsToJson(pairs),
    };
    await invoke("upsert_environment", { environment: copy });
    await refreshEnvs();
    openEnvView(copy.id);
  }

  async function deleteEnv(env: Environment) {
    if (env.isGlobal) return;
    const ok = await dialogs.confirm({
      title: "Delete environment?",
      message: `Delete “${env.name}” and all of its variables? This cannot be undone.`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    setTreeMenu(null);
    await invoke("delete_environment", { id: env.id });
    setEnvDrafts((d) => {
      const { [env.id]: _, ...rest } = d;
      return rest;
    });
    if (envViewId === env.id) setEnvViewId(null);
    await refreshEnvs();
  }

  function openEnvSync(targetId: string, sourceId?: string) {
    setTreeMenu(null);
    const others = envs.filter((e) => e.id !== targetId);
    const src =
      (sourceId && others.find((e) => e.id === sourceId)?.id) ||
      others[0]?.id ||
      "";
    if (!src) {
      setError("Need another environment to sync from.");
      return;
    }
    const source = envs.find((e) => e.id === src)!;
    const target = envs.find((e) => e.id === targetId)!;
    const srcPairs = envDrafts[source.id] ?? parseVars(source.varsJson);
    const tgtPairs = envDrafts[target.id] ?? parseVars(target.varsJson);
    const tgtKeys = new Set(
      tgtPairs.map((p) => p.key.trim()).filter(Boolean),
    );
    const keys = sourceKeys(srcPairs);
    // Default: pick keys missing on the target (the usual “Local has it, Prod doesn’t” case).
    const selected = keys.filter((k) => !tgtKeys.has(k));
    setEnvSync({
      sourceId: src,
      targetId,
      selected: selected.length > 0 ? selected : [...keys],
    });
  }

  async function applyEnvSync() {
    if (!envSync || envSync.selected.length === 0) return;
    const source = envs.find((e) => e.id === envSync.sourceId);
    const target = envs.find((e) => e.id === envSync.targetId);
    if (!source || !target) return;
    const srcPairs = envDrafts[source.id] ?? parseVars(source.varsJson);
    const tgtPairs = envDrafts[target.id] ?? parseVars(target.varsJson);
    const next = syncSelectedVars(tgtPairs, srcPairs, envSync.selected);
    setEnvDrafts((d) => ({ ...d, [target.id]: next }));
    await invoke("upsert_environment", {
      environment: { ...target, varsJson: varsToJson(next) },
    });
    setEnvSync(null);
    await refreshEnvs();
    openEnvView(target.id);
  }

  async function clearEnvVars(env: Environment) {
    const ok = await dialogs.confirm({
      title: "Delete all variables?",
      message: `Remove every variable in “${env.name}”?`,
      confirmLabel: "Delete all",
      danger: true,
    });
    if (!ok) return;
    setEnvDrafts((d) => ({
      ...d,
      [env.id]: [{ key: "", value: "", enabled: true }],
    }));
    await invoke("upsert_environment", {
      environment: { ...env, varsJson: "{}" },
    });
    await refreshEnvs();
  }

  async function newEnvironment() {
    const name = await dialogs.prompt({
      title: "New environment",
      label: "Environment name",
      defaultValue: "Staging",
      confirmLabel: "Create",
    });
    if (!name) return;
    const env: Environment = {
      id: crypto.randomUUID(),
      name,
      isGlobal: false,
      isActive: true,
      varsJson: "{}",
    };
    await invoke("upsert_environment", { environment: env });
    await refreshEnvs();
    openEnvView(env.id);
  }

  const shortcutHandlerRef = useRef<(e: KeyboardEvent) => void>(() => {});
  shortcutHandlerRef.current = (e: KeyboardEvent) => {
    const action = matchShortcut(e);
    if (!action) return;
    // Tab moves focus unless we cancel in capture before the browser acts.
    e.preventDefault();
    e.stopPropagation();
    switch (action) {
      case "send":
        void send();
        break;
      case "save":
        void save();
        break;
      case "focusUrl":
        urlRef.current?.focus();
        urlRef.current?.select();
        break;
      case "newRequest":
        void newRequest();
        break;
      case "search":
        setRail("collections");
        globalSearchRef.current?.focus();
        globalSearchRef.current?.select();
        break;
      case "searchTabs":
        openTabSearch();
        break;
      case "toggleResponse":
        setResponseHidden((h) => !h);
        break;
      case "dockBottom":
        applyDock("bottom");
        break;
      case "dockRight":
        applyDock("right");
        break;
      case "cycleEnv": {
        const next = nextInCycle(
          activeEnvs.map((env) => env.id),
          activeEnv?.id,
        );
        if (next && next !== activeEnv?.id) void onEnvChange(next);
        break;
      }
      case "cycleTab":
      case "cycleTabPrev": {
        const next = nextInCycle(
          openTabs,
          selectedId,
          action === "cycleTabPrev" ? -1 : 1,
        );
        if (next) switchTab(next);
        break;
      }
    }
  };

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      shortcutHandlerRef.current(e);
    }
    // Capture + stable listener (not re-bound every render) so Tab chords aren't missed.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  // ponytail: webview-level guard only — blocks the right-click menu and inspector
  // keys. Upgrade = build release without Tauri's `devtools` feature so the
  // inspector isn't compiled in at all.
  useEffect(() => {
    if (devMode) return;
    function onContextMenu(e: MouseEvent) {
      e.preventDefault();
    }
    function onKey(e: KeyboardEvent) {
      if (!isInspectKey(e)) return;
      e.preventDefault();
      e.stopPropagation();
    }
    window.addEventListener("contextmenu", onContextMenu, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("contextmenu", onContextMenu, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [devMode]);

  useEffect(() => {
    if (!newReqMenuOpen) return;
    function onDoc(e: MouseEvent) {
      if (
        newReqMenuRef.current &&
        !newReqMenuRef.current.contains(e.target as Node)
      ) {
        setNewReqMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [newReqMenuOpen]);

  useEffect(() => {
    if (!treeMenu) return;
    function onDoc(e: MouseEvent) {
      const el = e.target as HTMLElement | null;
      if (el?.closest?.(".tree-item-actions")) return;
      if (el?.closest?.(".tree-row-menu-fixed")) return;
      setTreeMenu(null);
    }
    function onScroll() {
      setTreeMenu(null);
    }
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [treeMenu]);

  useEffect(() => {
    if (!renaming) return;
    const t = window.setTimeout(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(t);
  }, [renaming]);

  const responseSize = result
    ? formatBytes(new TextEncoder().encode(result.body).length)
    : null;

  function openTreeMenu(
    target: "folder" | "request" | "collection",
    id: string,
    kind: "add" | "more",
    btn: HTMLElement,
  ) {
    setTreeAnchor({ kind: target, id });
    setTreeMenu((m) => {
      if (m?.target === target && m?.id === id && m.kind === kind) return null;
      const r = btn.getBoundingClientRect();
      const width = 188;
      const height =
        kind === "add" ? 128 : target === "collection" ? 200 : 120;
      const gap = 4;
      let left = r.right + gap;
      if (left + width > window.innerWidth - 8) {
        left = Math.max(8, r.left - width - gap);
      }
      let top = r.top;
      if (top + height > window.innerHeight - 8) {
        top = Math.max(8, window.innerHeight - height - 8);
      }
      return { target, id, kind, top, left };
    });
  }

  function renderTreeLevel(parentId: string | null): ReactNode {
    const items = siblingsOf(parentId, folders, requests).filter((item) => {
      if (!treeVis) return true;
      return item.kind === "folder"
        ? treeVis.folders.has(item.id)
        : treeVis.requests.has(item.id);
    });
    return items.map((item) => {
      if (item.kind === "folder") {
        const open = treeVis ? true : expandedFolders[item.id] !== false;
        const anchored =
          treeAnchor?.kind === "folder" && treeAnchor.id === item.id;
        return (
          <li key={`f-${item.id}`}>
            <div
              className={`tree-row folder-row ${anchored ? "anchored" : ""} ${
                treeMenu?.target === "folder" && treeMenu.id === item.id
                  ? "menu-open"
                  : ""
              } ${
                renaming?.kind === "folder" && renaming.id === item.id
                  ? "renaming"
                  : ""
              }`}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(
                  "application/inpost-tree",
                  JSON.stringify({ kind: "folder", id: item.id }),
                );
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                try {
                  const drag = JSON.parse(
                    e.dataTransfer.getData("application/inpost-tree"),
                  ) as { kind: TreeKind; id: string };
                  const into = !e.shiftKey;
                  void dropOnTree(
                    drag,
                    { kind: "folder", id: item.id, parentId },
                    into,
                  );
                } catch {
                  /* ignore */
                }
              }}
            >
              <button
                type="button"
                className="tree-twist"
                onClick={() =>
                  setExpandedFolders((prev) => ({
                    ...prev,
                    [item.id]: !open,
                  }))
                }
                aria-label={open ? "Collapse" : "Expand"}
              >
                {open ? <ChevronDown {...Ism} /> : <ChevronRight {...Ism} />}
              </button>
              <span className="tree-folder-icon" aria-hidden>
                <Folder {...Ifill} />
              </span>
              {renaming?.kind === "folder" && renaming.id === item.id ? (
                <input
                  ref={renameInputRef}
                  className="tree-rename-input"
                  value={renameDraft}
                  onChange={(e) => setRenameDraft(e.target.value)}
                  onBlur={() => void commitRename()}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void commitRename();
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      setRenaming(null);
                    }
                  }}
                />
              ) : (
                <button
                  type="button"
                  className="tree-folder-btn"
                  onClick={() => {
                    setTreeAnchor({ kind: "folder", id: item.id });
                    setExpandedFolders((prev) => ({
                      ...prev,
                      [item.id]: true,
                    }));
                  }}
                >
                  <span className="tree-name folder-name">{item.name}</span>
                </button>
              )}
              <div
                className={`tree-item-actions ${
                  treeMenu?.target === "folder" && treeMenu.id === item.id
                    ? "open"
                    : ""
                }`}
              >
                <button
                  type="button"
                  className="tree-action"
                  data-tip="Add"
                  onClick={(e) => {
                    e.stopPropagation();
                    openTreeMenu("folder", item.id, "add", e.currentTarget);
                  }}
                >
                  <Plus {...Ism} />
                </button>
                <button
                  type="button"
                  className="tree-action"
                  data-tip="More actions"
                  onClick={(e) => {
                    e.stopPropagation();
                    openTreeMenu("folder", item.id, "more", e.currentTarget);
                  }}
                >
                  <MoreHorizontal {...Ism} />
                </button>
              </div>
            </div>
            {open && (
              <ul className="tree nested">{renderTreeLevel(item.id)}</ul>
            )}
          </li>
        );
      }
      const req = requests.find((r) => r.id === item.id);
      if (!req) return null;
      const reqMenuOpen =
        treeMenu?.target === "request" && treeMenu.id === req.id;
      const reqRenaming =
        renaming?.kind === "request" && renaming.id === req.id;
      return (
        <li key={`r-${item.id}`}>
          <div
            className={`tree-row request-row ${
              req.id === selectedId ? "active" : ""
            } ${reqMenuOpen ? "menu-open" : ""} ${
              reqRenaming ? "renaming" : ""
            }`}
            draggable={!reqRenaming}
            onDragStart={(e) => {
              e.dataTransfer.setData(
                "application/inpost-tree",
                JSON.stringify({ kind: "request", id: item.id }),
              );
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              try {
                const drag = JSON.parse(
                  e.dataTransfer.getData("application/inpost-tree"),
                ) as { kind: TreeKind; id: string };
                void dropOnTree(
                  drag,
                  { kind: "request", id: item.id, parentId },
                  false,
                );
              } catch {
                /* ignore */
              }
            }}
          >
            <span className={methodClass(req.method)}>
              {methodLabel(req.method)}
            </span>
            {reqRenaming ? (
              <input
                ref={renameInputRef}
                className="tree-rename-input"
                value={renameDraft}
                onChange={(e) => setRenameDraft(e.target.value)}
                onBlur={() => void commitRename()}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void commitRename();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    setRenaming(null);
                  }
                }}
              />
            ) : (
              <button
                type="button"
                className="tree-req-main"
                onClick={() => {
                  setTreeAnchor({ kind: "request", id: req.id });
                  openRequest(req);
                }}
              >
                <span className="tree-name">{req.name}</span>
              </button>
            )}
            <div
              className={`tree-item-actions ${reqMenuOpen ? "open" : ""}`}
            >
              <button
                type="button"
                className="tree-action"
                data-tip="More actions"
                onClick={(e) => {
                  e.stopPropagation();
                  openTreeMenu("request", req.id, "more", e.currentTarget);
                }}
              >
                <MoreHorizontal {...Ism} />
              </button>
            </div>
          </div>
        </li>
      );
    });
  }

  const crumbPath =
    draft != null
      ? [collection?.name, ...folderPath(draft.folderId, folders)].filter(
          (p): p is string => Boolean(p),
        )
      : [];

  function startCrumbEdit() {
    if (!draft) return;
    setCrumbDraft(draft.name);
    setCrumbEditing(true);
  }

  function commitCrumbEdit() {
    if (!draft) return;
    const name = crumbDraft.trim() || "Untitled";
    if (name !== draft.name) setDraft({ ...draft, name });
    setCrumbEditing(false);
  }

  return (
    <div className="app">
      <TitleBar
        workspaces={workspaces}
        workspaceId={workspaceId}
        onSelect={selectWorkspace}
        onCreate={() => void newWorkspace()}
        search={search}
        onSearch={setSearch}
        searchInputRef={globalSearchRef}
        searchIndex={searchIndex}
        searchLoading={searchLoading}
        onSearchOpen={(item) => void onSearchOpen(item)}
        onFocusSearch={() => void refreshSearchIndex()}
        onOpenSettings={openSettings}
        onOpenWorkspaceSettings={openWorkspaceSettings}
      />
      <div
        className="shell"
        ref={shellRef}
        style={
          {
            "--sidebar-w": `${sidebarWidth}px`,
          } as CSSProperties
        }
      >
        <nav className="rail" aria-label="Primary">
          <button
            type="button"
            className={rail === "collections" ? "active" : ""}
            data-tip="Collections"
            data-tip-side="right"
            aria-label="Collections"
            onClick={() => setRail("collections")}
          >
            <span className="rail-icon">
              <Library {...Imd} />
            </span>
          </button>
          <button
            type="button"
            className={rail === "environments" ? "active" : ""}
            data-tip="Environments"
            data-tip-side="right"
            aria-label="Environments"
            onClick={() => setRail("environments")}
          >
            <span className="rail-icon">
              <Braces {...Imd} />
            </span>
          </button>
          <button
            type="button"
            className={rail === "history" ? "active" : ""}
            data-tip="History"
            data-tip-side="right"
            aria-label="History"
            onClick={() => {
              setRail("history");
              void refreshWorkspaceHistory();
              void refreshSearchIndex();
            }}
          >
            <span className="rail-icon">
              <History {...Imd} />
            </span>
          </button>
        </nav>

        <aside className="sidebar">
          {rail === "collections" && (
            <>
              <div className="sidebar-toolbar">
                <div className="sidebar-toolbar-main">
                  <div className="explorer-new-wrap" ref={newReqMenuRef}>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setNewReqMenuOpen((o) => !o)}
                    >
                      <Plus {...Ism} /> New
                    </Button>
                    {newReqMenuOpen && (
                      <div className="explorer-menu explorer-menu-wide" role="menu">
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => void newRequest({ kind: "http" })}
                          disabled={!collectionId}
                        >
                          <span className="explorer-menu-badge http">HTTP</span>
                          HTTP request
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => void newRequest({ kind: "websocket" })}
                          disabled={!collectionId}
                        >
                          <span className="explorer-menu-badge ws">WS</span>
                          WebSocket
                        </button>
                        <div className="explorer-menu-sep" />
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setNewReqMenuOpen(false);
                            void newCollection();
                          }}
                        >
                          <span className="explorer-menu-ico" aria-hidden>
                            <Layers {...Ifill} />
                          </span>
                          Collection
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setNewReqMenuOpen(false);
                            void newEnvironment();
                          }}
                        >
                          <span className="explorer-menu-ico" aria-hidden>
                            <Braces {...I} />
                          </span>
                          Environment
                        </button>
                        <div className="explorer-menu-sep" />
                        <button
                          type="button"
                          role="menuitem"
                          disabled={!collectionId}
                          onClick={() => {
                            setNewReqMenuOpen(false);
                            void exportOpenApi();
                          }}
                        >
                          <span className="explorer-menu-ico" aria-hidden>
                            <FileUp {...I} />
                          </span>
                          Export OpenAPI
                        </button>
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    className="ui-btn ui-btn-secondary ui-btn-sm"
                    data-tip="Import OpenAPI"
                    disabled={!workspaceId}
                    onClick={openImportModal}
                  >
                    Import
                  </button>
                </div>
                <div className="explorer-actions">
                  <button
                    type="button"
                    className="explorer-icon-btn"
                    data-tip="New Folder…"
                    disabled={!collectionId}
                    onClick={() => void newFolder()}
                  >
                    <FolderPlus {...Imd} />
                  </button>
                  <button
                    type="button"
                    className="explorer-icon-btn"
                    data-tip="Refresh Explorer"
                    disabled={!workspaceId}
                    onClick={() => void refreshExplorer()}
                  >
                    <RefreshCw {...Imd} />
                  </button>
                </div>
              </div>
              <div className="sidebar-search-row">
                <div className="sidebar-search-wrap">
                  <Search className="sidebar-search-ico" {...I} aria-hidden />
                  <input
                    className="sidebar-search"
                    type="search"
                    placeholder="Search"
                    value={treeSearch}
                    onChange={(e) => setTreeSearch(e.target.value)}
                    aria-label="Search collections"
                  />
                  {treeSearch && (
                    <button
                      type="button"
                      className="sidebar-search-clear"
                      data-tip="Clear search"
                      onClick={() => setTreeSearch("")}
                    >
                      <X {...Ism} />
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  className="explorer-icon-btn tree-toggle-btn"
                  data-tip={anyFolderExpanded ? "Collapse all" : "Expand all"}
                  aria-label={anyFolderExpanded ? "Collapse all" : "Expand all"}
                  disabled={!collectionId || folders.length === 0}
                  onClick={() =>
                    anyFolderExpanded ? collapseAllFolders() : expandAllFolders()
                  }
                >
                  {anyFolderExpanded ? (
                    <ChevronUp {...Imd} />
                  ) : (
                    <ChevronDown {...Imd} />
                  )}
                </button>
              </div>
              {collections.length === 0 ? (
                <div className="empty-side">
                  No collections yet.{" "}
                  <button
                    type="button"
                    className="text-action"
                    onClick={() => void newCollection()}
                  >
                    Create one
                  </button>
                </div>
              ) : (
                <>
                  {treeSearchQ &&
                    collections.every((col) => {
                      if (col.name.toLowerCase().includes(treeSearchQ))
                        return false;
                      if (
                        col.id === collectionId &&
                        treeVis &&
                        (treeVis.folders.size > 0 || treeVis.requests.size > 0)
                      ) {
                        return false;
                      }
                      return true;
                    }) && (
                      <div className="empty-side">No matches</div>
                    )}
                <ul className="tree collection-forest">
                  {collections
                    .filter((col) => {
                      if (!treeSearchQ) return true;
                      if (col.name.toLowerCase().includes(treeSearchQ))
                        return true;
                      if (
                        col.id === collectionId &&
                        treeVis &&
                        (treeVis.folders.size > 0 || treeVis.requests.size > 0)
                      ) {
                        return true;
                      }
                      return false;
                    })
                    .map((col) => {
                    const active = col.id === collectionId;
                    const colMenuOpen =
                      treeMenu?.target === "collection" &&
                      treeMenu.id === col.id;
                    const colRenaming =
                      renaming?.kind === "collection" &&
                      renaming.id === col.id;
                    return (
                      <li key={col.id}>
                        <div
                          className={`tree-row collection-row ${
                            active ? "active" : ""
                          } ${colMenuOpen ? "menu-open" : ""} ${
                            colRenaming ? "renaming" : ""
                          }`}
                          onClick={() => {
                            if (colRenaming) return;
                            if (!active) setCollectionId(col.id);
                            setTreeAnchor({ kind: "collection", id: col.id });
                          }}
                          onDragOver={(e) => {
                            if (!active) return;
                            e.preventDefault();
                            e.dataTransfer.dropEffect = "move";
                          }}
                          onDrop={(e) => {
                            if (!active) return;
                            e.preventDefault();
                            try {
                              const drag = JSON.parse(
                                e.dataTransfer.getData("application/inpost-tree"),
                              ) as { kind: TreeKind; id: string };
                              void dropOnRoot(drag);
                            } catch {
                              /* ignore */
                            }
                          }}
                          data-tip={
                            active
                              ? "Drop here to move to collection root"
                              : "Switch to this collection"
                          }
                        >
                          <span className="tree-twist root-twist">
                            {active ? (
                              <ChevronDown {...Ism} />
                            ) : (
                              <ChevronRight {...Ism} />
                            )}
                          </span>
                          <span className="tree-folder-icon col-icon" aria-hidden>
                            <Layers {...Ifill} />
                          </span>
                          {colRenaming ? (
                            <input
                              ref={renameInputRef}
                              className="tree-rename-input"
                              value={renameDraft}
                              onChange={(e) => setRenameDraft(e.target.value)}
                              onBlur={() => void commitRename()}
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  void commitRename();
                                } else if (e.key === "Escape") {
                                  e.preventDefault();
                                  setRenaming(null);
                                }
                              }}
                            />
                          ) : (
                            <span className="tree-name folder-name collection-name">
                              {col.name}
                            </span>
                          )}
                          <div
                            className={`tree-item-actions ${
                              colMenuOpen ? "open" : ""
                            }`}
                          >
                            <button
                              type="button"
                              className="tree-action"
                              data-tip="Add"
                              onClick={(e) => {
                                e.stopPropagation();
                                openTreeMenu(
                                  "collection",
                                  col.id,
                                  "add",
                                  e.currentTarget,
                                );
                              }}
                            >
                              <Plus {...Ism} />
                            </button>
                            <button
                              type="button"
                              className="tree-action"
                              data-tip="More actions"
                              onClick={(e) => {
                                e.stopPropagation();
                                openTreeMenu(
                                  "collection",
                                  col.id,
                                  "more",
                                  e.currentTarget,
                                );
                              }}
                            >
                              <MoreHorizontal {...Ism} />
                            </button>
                          </div>
                        </div>
                        {active && (
                          <ul className="tree nested">
                            {requests.length === 0 && folders.length === 0 ? (
                              <li className="empty-side nested-empty">
                                Empty — use + on the collection or New
                              </li>
                            ) : (
                              renderTreeLevel(null)
                            )}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
                </>
              )}
            </>
          )}

          {rail === "environments" && (
            <>
              <div className="sidebar-head">
                <span className="sidebar-head-title">Environments</span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void newEnvironment()}
                >
                  <Plus {...Ism} /> New
                </Button>
              </div>
              <div className="sidebar-banner">
                Secrets stay on this device. Only keys sync later.
              </div>
              <ul className="tree">
                {envs.map((e) => {
                  const n = countEnvVars(e, envDrafts);
                  const dirty = envIsDirty(e, envDrafts);
                  const active = !e.isGlobal && e.isActive;
                  return (
                  <li key={e.id}>
                    <button
                      type="button"
                      className={`tree-req env-row ${
                        envViewId === e.id ? "active" : ""
                      }`}
                      onClick={() => openEnvView(e.id)}
                      onContextMenu={(ev) => {
                        ev.preventDefault();
                        setTreeMenu({
                          target: "environment",
                          id: e.id,
                          kind: "more",
                          top: ev.clientY,
                          left: ev.clientX,
                        });
                      }}
                    >
                      <span
                        className={`env-active-slot${active ? " on" : ""}`}
                        aria-hidden={!active}
                        data-tip={active ? "Active" : undefined}
                      />
                      <span className="tree-name">
                        {e.name}
                        {e.isGlobal ? " · global" : ""}
                      </span>
                      <span className="env-row-trail">
                        <span
                          className={`env-dirty-slot${dirty ? " on" : ""}`}
                          data-tip={dirty ? "Unsaved changes" : undefined}
                          aria-label={dirty ? "Unsaved changes" : undefined}
                          aria-hidden={!dirty}
                        />
                        <span
                          className="env-var-count"
                          data-tip={`${n} variable${n === 1 ? "" : "s"}`}
                        >
                          {n}
                        </span>
                      </span>
                    </button>
                  </li>
                  );
                })}
              </ul>
            </>
          )}

          {rail === "history" && (
            <>
              <div className="sidebar-head">
                <span className="sidebar-head-title">History</span>
              </div>
              <div className="sidebar-banner info">
                Workspace history stays on this device.
              </div>
              <ul className="tree history-list">
                {history.length === 0 && (
                  <li className="empty-side">No history yet — send a request</li>
                )}
                {groupHistory(history).map(([label, rows]) => (
                  <li key={label} className="history-group">
                    <div className="history-group-label">{label}</div>
                    <ul className="tree">
                      {rows.map((h) => (
                        <li key={h.id}>
                          <button
                            type="button"
                            className={`history-entry ${
                              viewingHistoryId === h.id ? "active" : ""
                            }`}
                            onClick={() => {
                              void (async () => {
                                if (h.requestId) {
                                  const cols = await invoke<Collection[]>(
                                    "list_collections",
                                    { workspaceId },
                                  );
                                  for (const c of cols) {
                                    const list = await invoke<HttpRequest[]>(
                                      "list_requests",
                                      { collectionId: c.id },
                                    );
                                    const r = list.find(
                                      (x) => x.id === h.requestId,
                                    );
                                    if (r) {
                                      setCollections(cols);
                                      setCollectionId(c.id);
                                      setRequests(list);
                                      openRequest(r);
                                      applyHistoryEntry(h);
                                      setRail("collections");
                                      return;
                                    }
                                  }
                                }
                                const { base, query: q } = splitUrl(h.url);
                                setUrlBase(base);
                                setQuery(q);
                                setPathPairs((prev) => mergePathPairs(base, prev));
                                if (draft)
                                  setDraft({
                                    ...draft,
                                    method: h.method,
                                    url: h.url,
                                  });
                                applyHistoryEntry(h);
                              })();
                            }}
                          >
                            <span className={methodClass(h.method)}>
                              {methodLabel(h.method)}
                            </span>
                            <span className="history-entry-main">
                              <span className="history-entry-title">
                                {historyTitle(h, requestTitles)}
                              </span>
                              <span className="history-entry-meta">
                                <span className="history-entry-url truncate">
                                  {h.url}
                                </span>
                                <span className="history-entry-time">
                                  {formatHistoryTime(h.createdAt, label)}
                                </span>
                              </span>
                            </span>
                            <span
                              className={`hist-status ${h.error ? "bad" : "ok"}`}
                            >
                              {h.error ? "ERR" : h.status}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </>
          )}
        </aside>

        <Sash
          axis="x"
          label="Resize sidebar"
          onDrag={(clientX) => {
            const shell = shellRef.current;
            if (!shell) return;
            const left = shell.getBoundingClientRect().left + 48;
            const w = clampSidebar(clientX - left);
            sidebarWidthRef.current = w;
            shell.style.setProperty("--sidebar-w", `${w}px`);
          }}
          onDragEnd={() => setSidebarWidth(sidebarWidthRef.current)}
        />

        <section className="workspace">
          <div className="opentabs">
            <div
              className="opentabs-scroll"
              ref={tabStripRef}
              onWheel={(e) => {
                // Plain vertical wheel scrolls the strip horizontally (browser tab bar UX).
                if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
                  e.currentTarget.scrollLeft += e.deltaY;
                }
              }}
            >
              {openTabs.map((id) => {
                if (id === SETTINGS_ID) {
                  return (
                    <div
                      key={id}
                      className={`opentab env-tab ${
                        !envViewId && selectedId === SETTINGS_ID ? "active" : ""
                      }`}
                      onClick={() => switchTab(SETTINGS_ID)}
                      onMouseDown={(e) => {
                        if (e.button === 1) {
                          e.preventDefault();
                          closeTab(SETTINGS_ID);
                        }
                      }}
                    >
                      <span className="settings-tab-mark" aria-hidden>
                        <Settings {...Ism} />
                      </span>
                      <span className="opentab-name">Settings</span>
                      <button
                        type="button"
                        className="opentab-close"
                        aria-label="Close settings"
                        onClick={(e) => {
                          e.stopPropagation();
                          closeTab(SETTINGS_ID);
                        }}
                      >
                        <X {...Ism} />
                      </button>
                    </div>
                  );
                }
                const docColId = parseColdocTab(id);
                if (docColId) {
                  const col = collections.find((c) => c.id === docColId);
                  return (
                    <div
                      key={id}
                      className={`opentab env-tab ${
                        !envViewId && selectedId === id ? "active" : ""
                      }`}
                      onClick={() => switchTab(id)}
                      onMouseDown={(e) => {
                        if (e.button === 1) {
                          e.preventDefault();
                          closeTab(id);
                        }
                      }}
                    >
                      <span className="settings-tab-mark" aria-hidden>
                        <BookOpen {...Ism} />
                      </span>
                      <span className="opentab-name">
                        {col?.name ?? "Docs"}
                      </span>
                      <button
                        type="button"
                        className="opentab-close"
                        aria-label="Close documentation"
                        onClick={(e) => {
                          e.stopPropagation();
                          closeTab(id);
                        }}
                      >
                        <X {...Ism} />
                      </button>
                    </div>
                  );
                }
                const cached = tabCache[id]?.draft;
                const fromList = requests.find((r) => r.id === id);
                const r =
                  selectedId === id && draft ? draft : cached ?? fromList;
                if (!r) return null;
                return (
                  <div
                    key={id}
                    className={`opentab ${
                      !envViewId && id === selectedId ? "active" : ""
                    }`}
                    onClick={() => switchTab(id)}
                    onMouseDown={(e) => {
                      if (e.button === 1) {
                        e.preventDefault();
                        closeTab(id);
                      }
                    }}
                  >
                    <span className={methodClass(r.method)}>{r.method}</span>
                    <span className="opentab-name">{r.name || "Untitled"}</span>
                    {tabDirty(id) && (
                      <span
                        className="opentab-dirty"
                        data-tip="Unsaved changes"
                        aria-label="Unsaved changes"
                      />
                    )}
                    <button
                      type="button"
                      className="opentab-close"
                      aria-label="Close tab"
                      onClick={(e) => {
                        e.stopPropagation();
                        closeTab(id);
                      }}
                    >
                      <X {...Ism} />
                    </button>
                  </div>
                );
              })}
              {viewingEnv && (
                <div
                  className={`opentab env-tab ${envViewId ? "active" : ""}`}
                  onClick={() => openEnvView(viewingEnv.id)}
                >
                  <span className="env-tab-mark" aria-hidden>
                    <Braces {...Ism} />
                  </span>
                  <span className="opentab-name">{viewingEnv.name}</span>
                  <button
                    type="button"
                    className="opentab-close"
                    aria-label="Close environment"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEnvViewId(null);
                    }}
                  >
                    <X {...Ism} />
                  </button>
                </div>
              )}
              <button
                type="button"
                className="opentab-add"
                data-tip="New request"
                onClick={() => void newRequest()}
              >
                <Plus {...Imd} />
              </button>
            </div>
            <div className="opentabs-tools">
              <div className="tab-search" ref={tabSearchRef}>
                <button
                  type="button"
                  className={`tab-search-btn ${tabSearchOpen ? "open" : ""}`}
                  data-tip="Search tabs"
                  aria-label="Search tabs"
                  aria-expanded={tabSearchOpen}
                  onClick={() => openTabSearch()}
                >
                  <ChevronDown {...Ism} />
                </button>
                {tabSearchOpen && (
                  <div className="tab-search-pop" role="dialog" aria-label="Search tabs">
                    <div className="tab-search-head">
                      <span>Search tabs</span>
                      <span className="tab-search-keys">Ctrl+Shift+A</span>
                    </div>
                    <input
                      ref={tabSearchInputRef}
                      className="tab-search-input"
                      placeholder="Search tabs"
                      value={tabSearchQuery}
                      onChange={(e) => {
                        setTabSearchQuery(e.target.value);
                        setTabSearchIndex(0);
                      }}
                      onKeyDown={(e) => {
                        const q = tabSearchQuery.trim().toLowerCase();
                        const shown = buildTabSearchItems().filter(
                          (t) => !q || t.haystack.includes(q),
                        );
                        if (e.key === "ArrowDown") {
                          e.preventDefault();
                          if (shown.length === 0) return;
                          setTabSearchIndex((i) => (i + 1) % shown.length);
                          return;
                        }
                        if (e.key === "ArrowUp") {
                          e.preventDefault();
                          if (shown.length === 0) return;
                          setTabSearchIndex(
                            (i) => (i - 1 + shown.length) % shown.length,
                          );
                          return;
                        }
                        if (e.key === "Enter") {
                          const pick =
                            shown[
                              Math.min(
                                Math.max(tabSearchIndex, 0),
                                Math.max(shown.length - 1, 0),
                              )
                            ];
                          if (pick) {
                            e.preventDefault();
                            pickTabSearch(pick.id);
                          }
                        }
                      }}
                    />
                    <div className="tab-search-list">
                      {(() => {
                        const q = tabSearchQuery.trim().toLowerCase();
                        const shown = buildTabSearchItems().filter(
                          (t) => !q || t.haystack.includes(q),
                        );
                        if (shown.length === 0) {
                          return (
                            <div className="tab-search-empty">No matching tabs</div>
                          );
                        }
                        const kbd = Math.min(
                          Math.max(tabSearchIndex, 0),
                          shown.length - 1,
                        );
                        return shown.map((t, i) => (
                          <button
                            key={t.id}
                            type="button"
                            className={`tab-search-item ${
                              t.active ? "active" : ""
                            } ${i === kbd ? "kbd" : ""}`}
                            onMouseEnter={() => setTabSearchIndex(i)}
                            onClick={() => pickTabSearch(t.id)}
                          >
                            {t.kind === "settings" ? (
                              <span className="settings-tab-mark" aria-hidden>
                                <Settings {...Ism} />
                              </span>
                            ) : t.kind === "docs" ? (
                              <span className="settings-tab-mark" aria-hidden>
                                <BookOpen {...Ism} />
                              </span>
                            ) : t.kind === "env" ? (
                              <span className="env-tab-mark" aria-hidden>
                                <Braces {...Ism} />
                              </span>
                            ) : (
                              <span className={methodClass(t.method!)}>
                                {t.method}
                              </span>
                            )}
                            <span className="opentab-name">{t.name}</span>
                            {t.dirty && (
                              <span
                                className="opentab-dirty"
                                data-tip="Unsaved changes"
                                aria-label="Unsaved changes"
                              />
                            )}
                          </button>
                        ));
                      })()}
                    </div>
                  </div>
                )}
              </div>
              <Select
                className="opentabs-env env-picker"
                tip="Environment"
                value={activeEnv?.id ?? ""}
                options={activeEnvs.map((e) => ({ id: e.id, label: e.name }))}
                onChange={(id) => void onEnvChange(id)}
                placeholder="No environment"
              />
            </div>
          </div>

          {viewingEnv ? (
            <div className="env-view">
              <div className="env-view-head">
                <div className="env-view-title">
                  <button
                    type="button"
                    className="env-view-name"
                    data-tip="Rename"
                    onClick={() => void renameEnv(viewingEnv)}
                  >
                    {viewingEnv.name}
                    <span className="env-view-edit" aria-hidden>
                      <Pencil {...Ism} />
                    </span>
                  </button>
                  {viewingEnv.isGlobal && (
                    <span className="env-view-badge">Global</span>
                  )}
                  {!viewingEnv.isGlobal && viewingEnv.isActive && (
                    <span className="env-view-badge active">Active</span>
                  )}
                </div>
                <div className="env-view-actions">
                  {!viewingEnv.isGlobal && !viewingEnv.isActive && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => void onEnvChange(viewingEnv.id)}
                    >
                      Use
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => openEnvSync(viewingEnv.id)}
                    disabled={envs.length < 2}
                    data-tip="Copy selected variables from another environment"
                  >
                    Sync vars
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => void clearEnvVars(viewingEnv)}
                  >
                    Delete all
                  </Button>
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => void saveEnv(viewingEnv)}
                  >
                    Save
                  </Button>
                </div>
              </div>
              <p className="env-view-hint">
                Secrets stay on this device. Use {"{{var}}"} in URLs, params, headers,
                body, and auth — hover a token to view or edit.
              </p>
              <div className="env-view-tools">
                <input
                  className="ui-input env-var-search"
                  placeholder="Search variables"
                  value={envVarFilter}
                  onChange={(e) => setEnvVarFilter(e.target.value)}
                />
              </div>
              <div className="env-view-table">
                <PairTable
                  pairs={envDrafts[viewingEnv.id] ?? parseVars(viewingEnv.varsJson)}
                  filter={envVarFilter}
                  onChange={(next) =>
                    setEnvDrafts((d) => ({
                      ...d,
                      [viewingEnv.id]: next,
                    }))
                  }
                  keyLabel="Name"
                />
              </div>
            </div>
          ) : selectedId === SETTINGS_ID ? (
            <SettingsView
              section={settingsSection}
              onSection={setSettingsSection}
              layoutDock={layoutDock}
              onLayoutDock={applyDock}
              devMode={devMode}
              onDevMode={applyDevMode}
              mcpStatus={mcpStatus}
              onOpenMcpLogs={openMcpLogs}
              workspaces={workspaces}
              workspaceId={workspaceId}
              onRenameWorkspace={(ws) => void renameWorkspace(ws)}
              onSwitchWorkspace={switchWorkspaceFromSettings}
            />
          ) : parseColdocTab(selectedId) ? (
            <CollectionDocView
              key={selectedId}
              collection={collections.find(
                (c) => c.id === parseColdocTab(selectedId),
              )}
              onSaved={(col) =>
                setCollections((cs) =>
                  cs.map((c) => (c.id === col.id ? col : c)),
                )
              }
            />
          ) : !draft ? (
            <div className="empty-main">
              <h2>No request open</h2>
              <p>Create a request or open an environment from the sidebar.</p>
              <Button variant="primary" onClick={() => void newRequest()}>
                <Plus {...Ism} /> New request
              </Button>
            </div>
          ) : (
            <>
              {(crumbPath.length > 0 || draft) && (
                <div className="req-crumb">
                  {crumbPath.map((part, i) => (
                    <span key={`${i}-${part}`} className="req-crumb-seg">
                      {i > 0 && (
                        <span className="req-crumb-sep" aria-hidden>
                          ›
                        </span>
                      )}
                      <span className="req-crumb-part">{part}</span>
                    </span>
                  ))}
                  {crumbPath.length > 0 && (
                    <span className="req-crumb-sep" aria-hidden>
                      ›
                    </span>
                  )}
                  {crumbEditing ? (
                    <input
                      className="req-crumb-title-input"
                      value={crumbDraft}
                      autoFocus
                      onChange={(e) => setCrumbDraft(e.target.value)}
                      onBlur={() => commitCrumbEdit()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          commitCrumbEdit();
                        } else if (e.key === "Escape") {
                          e.preventDefault();
                          setCrumbEditing(false);
                        }
                      }}
                      aria-label="Request name"
                    />
                  ) : (
                    <button
                      type="button"
                      className="req-crumb-title"
                      onClick={startCrumbEdit}
                      data-tip="Rename request"
                    >
                      <span>{draft.name || "Untitled"}</span>
                      <span className="req-crumb-pencil" aria-hidden>
                        <Pencil {...Ism} />
                      </span>
                    </button>
                  )}
                  {resolvedUrl.trim() && (
                    <span
                      className="req-crumb-url"
                      title={resolvedUrl}
                      data-tip={resolvedUrl}
                    >
                      {resolvedUrl}
                    </span>
                  )}
                </div>
              )}
              <div className="url-bar">
                <Select
                  className="method-picker"
                  value={draft.method}
                  options={(draft.method.toUpperCase() === "WS"
                    ? ["WS", ...METHODS]
                    : METHODS
                  ).map((m) => ({ id: m, label: m }))}
                  onChange={(method) => setDraft({ ...draft, method })}
                  tip="Method"
                />
                <UrlField
                  inputRef={urlRef}
                  className="url-input"
                  value={composedUrl}
                  onChange={onUrlChange}
                  historyKey={selectedId ?? ""}
                  placeholder="{{baseUrl}}/path"
                  env={activeEnv ?? null}
                  envPairs={
                    activeEnv
                      ? (envDrafts[activeEnv.id] ??
                        parseVars(activeEnv.varsJson))
                      : []
                  }
                  globalPairs={
                    globalEnv
                      ? (envDrafts[globalEnv.id] ??
                        parseVars(globalEnv.varsJson))
                      : []
                  }
                  onSaveVar={saveEnvVar}
                  onOpenEnv={(id) => openEnvView(id)}
                />
                <Button
                  variant="primary"
                  className="send"
                  onClick={() => void send()}
                  disabled={sending}
                >
                  {sending ? "…" : "Send"}
                </Button>
                <Button variant="secondary" onClick={() => void save()}>
                  Save
                </Button>
              </div>

              <div
                ref={splitRef}
                className={`editor-split dock-${layoutDock} ${
                  responseHidden ? "response-hidden" : ""
                }${editorSplitAxis === "y" && layoutDock === "right" ? " stack-y" : ""}`}
                style={
                  responseHidden
                    ? undefined
                    : editorSplitAxis === "x"
                      ? {
                          gridTemplateColumns: `minmax(140px, ${splitRatio}fr) 0px minmax(140px, ${1 - splitRatio}fr)`,
                          gridTemplateRows: "1fr",
                        }
                      : {
                          gridTemplateColumns: "1fr",
                          gridTemplateRows: `minmax(100px, ${splitRatio}fr) 0px minmax(100px, ${1 - splitRatio}fr)`,
                        }
                }
              >
                <div className="request-pane">
                  <div className="section-tabs">
                    {(
                      [
                        ["overview", "Overview"],
                        ["params", "Params"],
                        ["headers", `Headers${headerCount ? ` (${headerCount})` : ""}`],
                        ["body", "Body"],
                        ["auth", "Auth"],
                      ] as [ReqTab, string][]
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        className={reqTab === id ? "active" : ""}
                        onClick={() => setReqTab(id)}
                      >
                        {label}
                        {id === "overview" && (draft.description ?? "").trim() ? (
                          <span className="dot" />
                        ) : null}
                        {id === "body" && bodyHasContent ? (
                          <span className="dot" />
                        ) : null}
                        {id === "auth" && authType !== "none" ? (
                          <span className="dot" />
                        ) : null}
                      </button>
                    ))}
                  </div>

                  <div className="section-body">
                    {reqTab === "overview" && (
                      <DocArticle
                        key={draft.id}
                        title={draft.name || "Untitled"}
                        meta={
                          <div className="doc-url">
                            <span className={methodClass(draft.method)}>
                              {draft.method}
                            </span>
                            <span className="doc-url-text">
                              {resolvedUrl || composedUrl}
                            </span>
                          </div>
                        }
                        value={draft.description ?? ""}
                        onChange={(description) =>
                          setDraft({ ...draft, description })
                        }
                        placeholder="Document this request — Markdown supported. Exports as the OpenAPI operation description."
                        emptyHint="Document this request…"
                      />
                    )}
                    {reqTab === "params" && (
                      <div className="params-stack">
                        <div className="params-block">
                          <PairTable
                            pairs={query}
                            onChange={setQuery}
                            keyLabel="Param"
                            tools
                            envHover={envHover}
                          />
                        </div>
                        {pathPairs.length > 0 && (
                          <div className="params-block">
                            <div className="params-label">Path variables</div>
                            <PairTable
                              pairs={pathPairs}
                              onChange={setPathPairs}
                              keyLabel="Variable"
                              lockKeys
                              tools
                              envHover={envHover}
                            />
                          </div>
                        )}
                      </div>
                    )}
                    {reqTab === "headers" && (
                      <PairTable
                        pairs={headers}
                        onChange={setHeaders}
                        keyLabel="Header"
                        keySuggestions={COMMON_HEADERS}
                        envHover={envHover}
                      />
                    )}
                    {reqTab === "body" && (
                      <div className="body-pane">
                        <div className="body-type-bar" role="radiogroup" aria-label="Body type">
                          {BODY_TYPE_OPTIONS.map((opt) => (
                            <label key={opt.id} className="body-type-opt">
                              <input
                                type="radio"
                                name="body-type"
                                checked={bodyType === opt.id}
                                onChange={() => setBodyType(opt.id)}
                              />
                              {opt.label}
                            </label>
                          ))}
                        </div>
                        {bodyType === "none" && (
                          <div className="body-empty muted">
                            This request does not have a body
                          </div>
                        )}
                        {(bodyType === "json" || bodyType === "text") && (
                          <div className="editor-fill">
                            <CodeEditor
                              value={draft.body}
                              language={bodyType === "json" ? "json" : "text"}
                              placeholder={bodyType === "json" ? "{ }" : ""}
                              onChange={(body) => setDraft({ ...draft, body })}
                              envHover={envHover}
                            />
                          </div>
                        )}
                        {bodyType === "urlencoded" && (
                          <PairTable
                            pairs={bodyPairs}
                            onChange={setBodyPairs}
                            keyLabel="Key"
                            envHover={envHover}
                          />
                        )}
                        {bodyType === "multipart" && (
                          <MultipartTable
                            pairs={bodyPairs}
                            onChange={setBodyPairs}
                            envHover={envHover}
                          />
                        )}
                      </div>
                    )}
                    {reqTab === "auth" && (
                      <div className="auth-pane">
                        <div className="auth-row">
                          <label className="auth-label">Authorization type</label>
                          <Select
                            className="auth-type-select"
                            value={authType}
                            options={AUTH_TYPE_OPTIONS.map((o) => ({
                              id: o.id,
                              label: o.label,
                            }))}
                            onChange={(id) => setAuthType(asAuthType(id))}
                          />
                        </div>
                        {authType === "none" && (
                          <div className="auth-empty">
                            <p>No authorization type selected for this request</p>
                            <p className="muted">
                              Select an authorization type above
                            </p>
                          </div>
                        )}
                        {authType === "bearer" && (
                          <div className="auth-fields">
                            <label>
                              Token
                              <VarField
                                className="ui-input"
                                value={authFields.token ?? ""}
                                onChange={(token) => patchAuth({ token })}
                                placeholder="{{token}}"
                                {...envHover}
                              />
                            </label>
                          </div>
                        )}
                        {authType === "basic" && (
                          <div className="auth-fields">
                            <label>
                              Username
                              <VarField
                                className="ui-input"
                                value={authFields.username ?? ""}
                                onChange={(username) =>
                                  patchAuth({ username })
                                }
                                {...envHover}
                              />
                            </label>
                            <label>
                              Password
                              <VarField
                                className="ui-input"
                                type="password"
                                value={authFields.password ?? ""}
                                onChange={(password) =>
                                  patchAuth({ password })
                                }
                                {...envHover}
                              />
                            </label>
                          </div>
                        )}
                        {authType === "apikey" && (
                          <div className="auth-fields">
                            <label>
                              Key
                              <VarField
                                className="ui-input"
                                value={authFields.key ?? ""}
                                onChange={(key) => patchAuth({ key })}
                                placeholder="X-Api-Key"
                                {...envHover}
                              />
                            </label>
                            <label>
                              Value
                              <VarField
                                className="ui-input"
                                value={authFields.value ?? ""}
                                onChange={(value) => patchAuth({ value })}
                                placeholder="{{apiKey}}"
                                {...envHover}
                              />
                            </label>
                            <label>
                              Add to
                              <select
                                className="ui-input"
                                value={authFields.in ?? "header"}
                                onChange={(e) =>
                                  patchAuth({ in: e.target.value })
                                }
                              >
                                <option value="header">Header</option>
                                <option value="query">Query param</option>
                              </select>
                            </label>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {!responseHidden && (
                  <Sash
                    axis={editorSplitAxis}
                    label="Resize request and response"
                    onDrag={(clientX, clientY) => {
                      const pane = splitRef.current;
                      if (!pane) return;
                      const r = pane.getBoundingClientRect();
                      const axis = editorSplitAxisRef.current;
                      const ratio = clampSplit(
                        axis === "y"
                          ? (clientY - r.top) / r.height
                          : (clientX - r.left) / r.width,
                      );
                      splitRatioRef.current = ratio;
                      applyEditorSplitStyle(pane, axis, ratio);
                    }}
                    onDragEnd={() => setSplitRatio(splitRatioRef.current)}
                  />
                )}

                <div className="response-pane">
                  <div className="response-top">
                    <div className="section-tabs">
                      <button
                        type="button"
                        className={resTab === "body" ? "active" : ""}
                        onClick={() => setResTab("body")}
                      >
                        Body
                      </button>
                      <button
                        type="button"
                        className={resTab === "headers" ? "active" : ""}
                        onClick={() => setResTab("headers")}
                      >
                        Headers
                        {result ? ` (${result.headers.length})` : ""}
                      </button>
                      <button
                        type="button"
                        className={resTab === "history" ? "active" : ""}
                        onClick={() => {
                          setResTab("history");
                          if (selectedId) void refreshRequestHistory(selectedId);
                        }}
                      >
                        History
                        {requestHistory.length
                          ? ` (${requestHistory.length})`
                          : ""}
                      </button>
                    </div>
                    <div className="response-actions">
                      {result && (
                        <div className="meta">
                          <span
                            className={`status ${result.status < 400 ? "ok" : "bad"}`}
                          >
                            {result.status} {result.statusText}
                          </span>
                          <span>{result.elapsedMs} ms</span>
                          <span>{responseSize}</span>
                        </div>
                      )}
                      <div className="req-history-wrap" ref={historyPopRef}>
                        <button
                          type="button"
                          className={`hist-ico-btn ${historyOpen ? "active" : ""}`}
                          data-tip="Response history for this request"
                          disabled={!selectedId}
                          onClick={() => {
                            setHistoryOpen((v) => !v);
                            if (selectedId)
                              void refreshRequestHistory(selectedId);
                          }}
                        >
                          <History {...I} />
                        </button>
                        {historyOpen && (
                          <div className="req-history-pop">
                            <div className="req-history-pop-head">
                              <strong>History</strong>
                              <button
                                type="button"
                                className="ui-btn ui-btn-ghost ui-btn-sm"
                                disabled={!selectedId || requestHistory.length === 0}
                                onClick={() => {
                                  void (async () => {
                                    if (!selectedId) return;
                                    const ok = await dialogs.confirm({
                                      title: "Clear request history?",
                                      message:
                                        "Delete all saved responses for this request.",
                                      confirmLabel: "Delete all",
                                      danger: true,
                                    });
                                    if (!ok) return;
                                    await invoke("clear_request_history", {
                                      requestId: selectedId,
                                    });
                                    setRequestHistory([]);
                                    await refreshWorkspaceHistory();
                                  })();
                                }}
                              >
                                Delete all
                              </button>
                            </div>
                            {requestHistory.length === 0 ? (
                              <div className="req-history-empty">
                                No recent responses for this request
                              </div>
                            ) : (
                              <ul className="req-history-list">
                                {groupHistory(requestHistory).map(
                                  ([label, rows]) => (
                                    <li key={label}>
                                      <div className="history-group-label">
                                        {label}
                                      </div>
                                      {rows.map((h) => (
                                        <button
                                          key={h.id}
                                          type="button"
                                          className={`req-history-item ${
                                            viewingHistoryId === h.id
                                              ? "current"
                                              : ""
                                          }`}
                                          onClick={() => {
                                            applyHistoryEntry(h);
                                            setHistoryOpen(false);
                                          }}
                                        >
                                          <span
                                            className={
                                              h.error
                                                ? "bad"
                                                : (h.status ?? 0) < 400
                                                  ? "ok"
                                                  : "bad"
                                            }
                                          >
                                            {historyMeta(h)}
                                          </span>
                                          {viewingHistoryId === h.id && (
                                            <span className="req-history-check">
                                              ✓
                                            </span>
                                          )}
                                        </button>
                                      ))}
                                    </li>
                                  ),
                                )}
                              </ul>
                            )}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        className="dock-btn"
                        data-tip={
                          layoutDock === "right"
                            ? "Dock to bottom"
                            : "Dock to right"
                        }
                        aria-label={
                          layoutDock === "right"
                            ? "Dock to bottom"
                            : "Dock to right"
                        }
                        onClick={() =>
                          applyDock(layoutDock === "right" ? "bottom" : "right")
                        }
                      >
                        <span
                          className={`dock-ico ${
                            layoutDock === "right" ? "dock-bottom" : "dock-right"
                          }`}
                        />
                      </button>
                    </div>
                  </div>

                  {!result && !error && resTab !== "history" && (
                    <div className="empty-response">
                      <div className="empty-illustration">⇄</div>
                      <h3>No response yet</h3>
                      <ul className="shortcuts">
                        {SHORTCUTS.map((s) => (
                          <li key={s.action}>
                            {s.keys.map((k) => (
                              <kbd key={k}>{k}</kbd>
                            ))}{" "}
                            {s.label}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {error && resTab !== "history" && (
                    <div className="error-panel">
                      <h3>Request error — no response received</h3>
                      <pre>{error}</pre>
                    </div>
                  )}

                  {result && resTab === "body" && (
                    <>
                      <div className="body-toolbar">
                        <button
                          type="button"
                          className={bodyView === "pretty" ? "active" : ""}
                          onClick={() => setBodyView("pretty")}
                          disabled={!result.bodyPretty}
                        >
                          JSON
                        </button>
                        <button
                          type="button"
                          className={bodyView === "raw" ? "active" : ""}
                          onClick={() => setBodyView("raw")}
                        >
                          Raw
                        </button>
                      </div>
                      <div className="editor-fill">
                        <CodeEditor
                          value={
                            bodyView === "pretty" && result.bodyPretty
                              ? result.bodyPretty
                              : result.body
                          }
                          language={
                            bodyView === "pretty" && result.bodyPretty
                              ? "json"
                              : "text"
                          }
                          readOnly
                        />
                      </div>
                    </>
                  )}

                  {result && resTab === "headers" && (
                    <div className="kv-table read-only">
                      {result.headers.map(([k, v], i) => (
                        <div className="kv-row" key={i}>
                          <span />
                          <code>{k}</code>
                          <code>{v}</code>
                          <span />
                        </div>
                      ))}
                    </div>
                  )}

                  {resTab === "history" && (
                    <div className="res-history-tab">
                      <div className="res-history-head">
                        <span className="muted">Past responses for this request</span>
                        <button
                          type="button"
                          className="ui-btn ui-btn-ghost ui-btn-sm"
                          disabled={!selectedId || requestHistory.length === 0}
                          onClick={() => {
                            void (async () => {
                              if (!selectedId) return;
                              const ok = await dialogs.confirm({
                                title: "Clear request history?",
                                message:
                                  "Delete all saved responses for this request.",
                                confirmLabel: "Delete all",
                                danger: true,
                              });
                              if (!ok) return;
                              await invoke("clear_request_history", {
                                requestId: selectedId,
                              });
                              setRequestHistory([]);
                              await refreshWorkspaceHistory();
                            })();
                          }}
                        >
                          Delete all
                        </button>
                      </div>
                      {requestHistory.length === 0 ? (
                        <div className="req-history-empty">
                          No recent responses for this request
                        </div>
                      ) : (
                        <ul className="req-history-list res-history-list">
                          {groupHistory(requestHistory).map(([label, rows]) => (
                            <li key={label}>
                              <div className="history-group-label">{label}</div>
                              {rows.map((h) => (
                                <button
                                  key={h.id}
                                  type="button"
                                  className={`req-history-item ${
                                    viewingHistoryId === h.id ? "current" : ""
                                  }`}
                                  onClick={() => applyHistoryEntry(h)}
                                >
                                  <span
                                    className={
                                      h.error
                                        ? "bad"
                                        : (h.status ?? 0) < 400
                                          ? "ok"
                                          : "bad"
                                    }
                                  >
                                    {historyMeta(h)}
                                  </span>
                                  <span className="muted mono truncate">
                                    {h.url}
                                  </span>
                                  {viewingHistoryId === h.id && (
                                    <span className="req-history-check">✓</span>
                                  )}
                                </button>
                              ))}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </section>
      </div>


      {treeMenu &&
        createPortal(
          <div
            className="explorer-menu tree-row-menu-fixed"
            role="menu"
            style={{ top: treeMenu.top, left: treeMenu.left }}
          >
            {treeMenu.kind === "add" ? (
              <>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    const id = treeMenu.id;
                    const target = treeMenu.target;
                    setTreeMenu(null);
                    if (target === "collection") {
                      void newRequest({
                        folderId: null,
                        kind: "http",
                        collectionId: id,
                      });
                    } else {
                      void newRequest({ folderId: id, kind: "http" });
                    }
                  }}
                >
                  <span className="explorer-menu-badge http">HTTP</span>
                  HTTP request
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    const id = treeMenu.id;
                    const target = treeMenu.target;
                    setTreeMenu(null);
                    if (target === "collection") {
                      void newRequest({
                        folderId: null,
                        kind: "websocket",
                        collectionId: id,
                      });
                    } else {
                      void newRequest({ folderId: id, kind: "websocket" });
                    }
                  }}
                >
                  <span className="explorer-menu-badge ws">WS</span>
                  WebSocket
                </button>
                <div className="explorer-menu-sep" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    const id = treeMenu.id;
                    const target = treeMenu.target;
                    setTreeMenu(null);
                    if (target === "collection") {
                      void newFolder(null, id);
                    } else {
                      void newFolder(id);
                    }
                  }}
                >
                  <span className="explorer-menu-ico" aria-hidden>
                    <Folder {...Ifill} />
                  </span>
                  Folder
                </button>
              </>
            ) : treeMenu.target === "collection" ? (
              <>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    const c = collections.find((x) => x.id === treeMenu.id);
                    if (c) startRename("collection", c.id, c.name);
                    else setTreeMenu(null);
                  }}
                >
                  Rename
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    const id = treeMenu.id;
                    setTreeMenu(null);
                    openCollectionDocs(id);
                  }}
                >
                  <span className="explorer-menu-ico" aria-hidden>
                    <BookOpen {...I} />
                  </span>
                  Documentation
                </button>
                <div className="explorer-menu-sep" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    const id = treeMenu.id;
                    setTreeMenu(null);
                    void exportOpenApi(id);
                  }}
                >
                  <span className="explorer-menu-ico" aria-hidden>
                    <FileUp {...I} />
                  </span>
                  Export as OpenAPI 3.0
                </button>
                <div className="explorer-menu-sep" />
                <button
                  type="button"
                  role="menuitem"
                  className="danger"
                  onClick={() => void removeCollection(treeMenu.id)}
                >
                  Delete
                </button>
              </>
            ) : treeMenu.target === "folder" ? (
              <>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    const f = folders.find((x) => x.id === treeMenu.id);
                    if (f) startRename("folder", f.id, f.name);
                    else setTreeMenu(null);
                  }}
                >
                  Rename
                </button>
                <div className="explorer-menu-sep" />
                <button
                  type="button"
                  role="menuitem"
                  className="danger"
                  onClick={() => void removeFolder(treeMenu.id)}
                >
                  Delete
                </button>
              </>
            ) : treeMenu.target === "environment" ? (
              <>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    const env = envs.find((x) => x.id === treeMenu.id);
                    if (env) void renameEnv(env);
                    else setTreeMenu(null);
                  }}
                >
                  Rename
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    const env = envs.find((x) => x.id === treeMenu.id);
                    if (env) void duplicateEnv(env);
                    else setTreeMenu(null);
                  }}
                >
                  Duplicate
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => openEnvSync(treeMenu.id)}
                  disabled={envs.length < 2}
                >
                  Sync variables…
                </button>
                <div className="explorer-menu-sep" />
                <button
                  type="button"
                  role="menuitem"
                  className="danger"
                  disabled={
                    envs.find((x) => x.id === treeMenu.id)?.isGlobal === true
                  }
                  onClick={() => {
                    const env = envs.find((x) => x.id === treeMenu.id);
                    if (env) void deleteEnv(env);
                    else setTreeMenu(null);
                  }}
                >
                  Delete
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    const r = requests.find((x) => x.id === treeMenu.id);
                    if (r) startRename("request", r.id, r.name || "Untitled");
                    else setTreeMenu(null);
                  }}
                >
                  Rename
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    const r = requests.find((x) => x.id === treeMenu.id);
                    if (r) void duplicateRequest(r);
                    else setTreeMenu(null);
                  }}
                >
                  Duplicate
                </button>
                <div className="explorer-menu-sep" />
                <button
                  type="button"
                  role="menuitem"
                  className="danger"
                  onClick={() => void removeRequest(treeMenu.id)}
                >
                  Delete
                </button>
              </>
            )}
          </div>,
          document.body,
        )}

      {envSync && (() => {
        const source = envs.find((e) => e.id === envSync.sourceId);
        const target = envs.find((e) => e.id === envSync.targetId);
        const srcPairs = source
          ? (envDrafts[source.id] ?? parseVars(source.varsJson))
          : [];
        const tgtPairs = target
          ? (envDrafts[target.id] ?? parseVars(target.varsJson))
          : [];
        const tgtKeys = new Set(
          tgtPairs.map((p) => p.key.trim()).filter(Boolean),
        );
        const keys = sourceKeys(srcPairs);
        const selected = new Set(envSync.selected);

        const renderDiffSide = (
          d: ReturnType<typeof diffTokens>,
          side: "old" | "next",
        ): ReactNode =>
          (side === "old" ? d.old : d.next).map((seg, i) => {
            if (seg.kind === "equal") {
              return (
                <span key={i} className="env-diff-eq">
                  {seg.text}
                </span>
              );
            }
            if (seg.kind === "removed") {
              return (
                <span key={i} className="env-diff-del">
                  {seg.text}
                </span>
              );
            }
            return (
              <span key={i} className="env-diff-ins">
                {seg.text}
              </span>
            );
          });

        return (
          <Modal
            open
            title="Sync environment variables"
            className="env-sync-modal"
            onClose={() => setEnvSync(null)}
            footer={
              <>
                <Button variant="ghost" onClick={() => setEnvSync(null)}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  disabled={envSync.selected.length === 0}
                  onClick={() => void applyEnvSync()}
                >
                  Copy {envSync.selected.length || ""} selected
                </Button>
              </>
            }
          >
            <div className="env-sync">
              <p className="env-sync-desc">
                Copy selected variables from the source into the target.
                Selected keys are
                <strong className="env-sync-pill add">added</strong>
                if missing or
                <strong className="env-sync-pill replace">replaced</strong>
                if already present. Anything not selected is left untouched —
                nothing is removed.
              </p>
              <div className="env-sync-row">
                <label className="env-sync-label">From</label>
                <Select
                  value={envSync.sourceId}
                  options={envs
                    .filter((e) => e.id !== envSync.targetId)
                    .map((e) => ({
                      id: e.id,
                      label: e.isGlobal ? `${e.name} · global` : e.name,
                    }))}
                  onChange={(id) => {
                    const s = envs.find((e) => e.id === id);
                    if (!s || !target) return;
                    const sp = envDrafts[s.id] ?? parseVars(s.varsJson);
                    const tp =
                      envDrafts[target.id] ?? parseVars(target.varsJson);
                    const existing = new Set(
                      tp.map((p) => p.key.trim()).filter(Boolean),
                    );
                    const ks = sourceKeys(sp);
                    const pick = ks.filter((k) => !existing.has(k));
                    setEnvSync({
                      sourceId: id,
                      targetId: envSync.targetId,
                      selected: pick.length > 0 ? pick : [...ks],
                    });
                  }}
                />
              </div>
              <div className="env-sync-row">
                <label className="env-sync-label">To</label>
                <Select
                  value={envSync.targetId}
                  options={envs
                    .filter((e) => e.id !== envSync.sourceId)
                    .map((e) => ({
                      id: e.id,
                      label: e.isGlobal ? `${e.name} · global` : e.name,
                    }))}
                  onChange={(id) => {
                    const t = envs.find((e) => e.id === id);
                    if (!t || !source) return;
                    const sp =
                      envDrafts[source.id] ?? parseVars(source.varsJson);
                    const tp = envDrafts[t.id] ?? parseVars(t.varsJson);
                    const existing = new Set(
                      tp.map((p) => p.key.trim()).filter(Boolean),
                    );
                    const ks = sourceKeys(sp);
                    const pick = ks.filter((k) => !existing.has(k));
                    setEnvSync({
                      sourceId: envSync.sourceId,
                      targetId: id,
                      selected: pick.length > 0 ? pick : [...ks],
                    });
                  }}
                />
              </div>
              <div className="env-sync-actions">
                <button
                  type="button"
                  className="text-action"
                  onClick={() =>
                    setEnvSync({ ...envSync, selected: [...keys] })
                  }
                >
                  Select all
                </button>
                <button
                  type="button"
                  className="text-action"
                  onClick={() =>
                    setEnvSync({
                      ...envSync,
                      selected: keys.filter((k) => !tgtKeys.has(k)),
                    })
                  }
                >
                  Missing only
                </button>
                <button
                  type="button"
                  className="text-action"
                  onClick={() => setEnvSync({ ...envSync, selected: [] })}
                >
                  Clear
                </button>
              </div>
              <ul className="env-sync-list">
                {keys.length === 0 && (
                  <li className="env-sync-empty">
                    Source has no variables to copy.
                  </li>
                )}
                {keys.map((k) => {
                  const val =
                    srcPairs.find((p) => p.key.trim() === k)?.value ?? "";
                  const tgtVal = tgtPairs.find(
                    (p) => p.key.trim() === k,
                  )?.value;
                  const exists = tgtKeys.has(k);
                  const tagClass = exists ? "replace" : "add";
                  const diffClass = exists
                    ? val === tgtVal
                      ? "same"
                      : "changed"
                    : "added";
                  return (
                    <li key={k}>
                      <label
                        className={`env-sync-item diff-${diffClass}`}
                      >
                        <input
                          type="checkbox"
                          checked={selected.has(k)}
                          onChange={(e) => {
                            const next = new Set(selected);
                            if (e.target.checked) next.add(k);
                            else next.delete(k);
                            setEnvSync({
                              ...envSync,
                              selected: [...next],
                            });
                          }}
                        />
                        <span className="env-sync-key">{k}</span>
                        <span
                          className={`env-sync-tag ${tagClass}`}
                          data-tip={
                            exists
                              ? `Replace existing "${k}" in target with source value`
                              : `Add "${k}" to target as a new variable`
                          }
                        >
                          <span className="env-sync-tag-sign">
                            {exists ? "~" : "+"}
                          </span>
                          {exists ? "replace" : "add"}
                        </span>
                        <code
                          className="env-sync-val"
                          data-tip={
                            exists
                              ? val === tgtVal
                                ? "value is identical — no change"
                                : `old: ${tgtVal ?? ""}\nnew: ${val}`
                              : `new value: ${val}`
                          }
                        >
                          {exists ? (
                            val === tgtVal ? (
                              <span className="env-sync-d-same">
                                <span className="env-sync-d-sign">=</span>
                                <span className="env-sync-d-text">
                                  {val || "—"}
                                </span>
                              </span>
                            ) : (
                              <span className="env-sync-d-change">
                                <span className="env-sync-d-old">
                                  <span className="env-sync-d-sign">−</span>
                                  <span className="env-sync-d-text">
                                    {renderDiffSide(
                                      diffTokens(tgtVal ?? "", val),
                                      "old",
                                    )}
                                  </span>
                                </span>
                                <span className="env-sync-d-mid" aria-hidden>
                                  ·
                                </span>
                                <span className="env-sync-d-new">
                                  <span className="env-sync-d-sign">+</span>
                                  <span className="env-sync-d-text">
                                    {renderDiffSide(
                                      diffTokens(tgtVal ?? "", val),
                                      "next",
                                    )}
                                  </span>
                                </span>
                              </span>
                            )
                          ) : (
                            <span className="env-sync-d-add">
                              <span className="env-sync-d-sign">+</span>
                              <span className="env-sync-d-text">
                                {val || "—"}
                              </span>
                            </span>
                          )}
                        </code>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          </Modal>
        );
      })()}

      {importOpen && (
        <Modal
          open
          className="import-openapi-modal"
          title="Import OpenAPI"
          onClose={closeImportModal}
          footer={
            <>
              <Button
                variant="ghost"
                disabled={importBusy}
                onClick={closeImportModal}
              >
                Close
              </Button>
              <Button
                variant="primary"
                disabled={importBusy || !importText.trim()}
                onClick={() => void importOpenApiSpec()}
              >
                {importBusy ? "Importing…" : "Import"}
              </Button>
            </>
          }
        >
          <div className="import-openapi">
            <div className="import-mode-tabs" role="tablist" aria-label="Import method">
              <button
                type="button"
                role="tab"
                aria-selected={importMode === "file"}
                className={importMode === "file" ? "active" : undefined}
                onClick={() => setImportMode("file")}
              >
                File
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={importMode === "paste"}
                className={importMode === "paste" ? "active" : undefined}
                onClick={() => setImportMode("paste")}
              >
                Paste
              </button>
            </div>

            {importMode === "file" ? (
              <div
                className={`import-drop${importDragOver ? " over" : ""}${importFileName ? " has-file" : ""}`}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    importFileRef.current?.click();
                  }
                }}
                onClick={() => importFileRef.current?.click()}
                onDragEnter={(e) => {
                  e.preventDefault();
                  setImportDragOver(true);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setImportDragOver(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  if (e.currentTarget === e.target) setImportDragOver(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setImportDragOver(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) void takeImportFile(f);
                }}
              >
                <Upload className="import-drop-ico" size={28} strokeWidth={1.5} aria-hidden />
                {importFileName ? (
                  <>
                    <p className="import-drop-title">{importFileName}</p>
                    <p className="import-drop-hint">
                      {importText.length.toLocaleString()} characters · click or drop to replace
                    </p>
                  </>
                ) : (
                  <>
                    <p className="import-drop-title">
                      Drop file here or click to browse
                    </p>
                    <p className="import-drop-hint">
                      Supports JSON, YAML, YML · OpenAPI 3.x · Max 100 MB
                    </p>
                  </>
                )}
                <Button
                  variant="secondary"
                  size="sm"
                  className="import-browse-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    importFileRef.current?.click();
                  }}
                >
                  Browse files
                </Button>
                <input
                  ref={importFileRef}
                  type="file"
                  accept=".json,.yaml,.yml,application/json,text/yaml,text/x-yaml"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void takeImportFile(f);
                    e.target.value = "";
                  }}
                />
              </div>
            ) : (
              <label className="import-paste">
                <span className="import-paste-label">OpenAPI JSON or YAML</span>
                <textarea
                  className="import-paste-area"
                  spellCheck={false}
                  placeholder={'{\n  "openapi": "3.0.3",\n  "info": { "title": "…" },\n  "paths": { … }\n}'}
                  value={importText}
                  onChange={(e) => {
                    setImportText(e.target.value);
                    setImportFileName(null);
                    setImportError(null);
                  }}
                />
              </label>
            )}

            {importError && (
              <p className="import-error" role="alert">
                {importError}
              </p>
            )}
          </div>
        </Modal>
      )}

      {exportToast && (
        <div className="export-toast" role="status">
          <FileUp {...I} aria-hidden />
          <div className="export-toast-text">
            <span className="export-toast-title">Collection exported</span>
            <span className="export-toast-path mono" data-tip={exportToast.path}>
              {exportToast.path}
            </span>
            {exportToast.revealError && (
              <span className="export-toast-err" role="alert">
                {exportToast.revealError}
              </span>
            )}
          </div>
          <button
            type="button"
            className="text-action"
            onClick={() => {
              void invoke("reveal_path", { path: exportToast.path })
                .then(() =>
                  setExportToast({ path: exportToast.path }),
                )
                .catch((e) =>
                  setExportToast({
                    path: exportToast.path,
                    revealError: String(e),
                  }),
                );
            }}
          >
            Show in folder
          </button>
          <button
            type="button"
            className="export-toast-close"
            aria-label="Dismiss"
            onClick={() => setExportToast(null)}
          >
            <X {...Ism} />
          </button>
        </div>
      )}

      <footer className="statusbar">
        <div className="statusbar-left">
          <span>Local-first · no account</span>
          <div className="mcp-status-wrap" ref={mcpLogPopRef}>
            <button
              type="button"
              className="mcp-status-btn"
              data-tip="MCP bridge status — click for logs"
              onClick={() => {
                if (mcpLogsOpen) setMcpLogsOpen(false);
                else openMcpLogs();
              }}
            >
              <span
                className={`mcp-dot ${mcpStatus?.running ? "ok" : "bad"}`}
                aria-hidden
              />
              Inpost MCP{" "}
              {mcpStatus == null
                ? "…"
                : mcpStatus.running
                  ? `· :${mcpStatus.port}`
                  : "· down"}
            </button>
            {mcpLogsOpen && (
              <div className="mcp-log-pop" role="dialog" aria-label="MCP logs">
                <div className="mcp-log-head">
                  <strong>MCP bridge log</strong>
                  <span className="muted">
                    {mcpStatus?.running
                      ? `listening :${mcpStatus.port}`
                      : "not running"}
                  </span>
                </div>
                <ul className="mcp-log-list">
                  {mcpLogs.length === 0 && (
                    <li className="muted">No requests yet — waiting for agents.</li>
                  )}
                  {mcpLogs.map((e, i) => (
                    <li key={`${e.at}-${i}`}>
                      <span className="mcp-log-time">
                        {new Date(e.at).toLocaleTimeString()}
                      </span>
                      <span
                        className={`mcp-log-status ${
                          e.status >= 400 ? "bad" : "ok"
                        }`}
                      >
                        {e.status}
                      </span>
                      <span className="mcp-log-msg mono">
                        {e.method} {e.path}
                        {e.detail ? ` — ${e.detail}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
        <span
          className="muted mono truncate"
          data-tip={resolvedUrl.trim() || undefined}
        >
          {resolvedUrl.trim() || "—"}
        </span>
      </footer>
    </div>
  );
}

export default App;
