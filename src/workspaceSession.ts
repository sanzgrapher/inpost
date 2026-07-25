/** Per-workspace UI session (tabs, dock, rail, …) in localStorage. */

export type LayoutDock = "right" | "bottom";
export type Rail = "collections" | "environments" | "history";

export type WorkspaceSession = {
  openTabs: string[];
  selectedId: string | null;
  collectionId: string;
  layoutDock: LayoutDock;
  responseHidden: boolean;
  rail: Rail;
  expandedFolders: Record<string, boolean>;
  settingsSection: string;
  envViewId: string | null;
  /** Sidebar width in px (collections/env/history tree). */
  sidebarWidth: number;
  /** Request pane share of the editor split (0.2–0.8). */
  splitRatio: number;
};

const SESSIONS_KEY = "inpost.wsSessions";
const LAYOUT_KEY = "inpost.layoutDock";

export function loadLayoutDock(): LayoutDock {
  try {
    return localStorage.getItem(LAYOUT_KEY) === "bottom" ? "bottom" : "right";
  } catch {
    return "right";
  }
}

export function saveLayoutDock(dock: LayoutDock) {
  try {
    localStorage.setItem(LAYOUT_KEY, dock);
  } catch {
    /* ignore */
  }
}

export const SIDEBAR_MIN = 180;
export const SIDEBAR_MAX = 480;
export const SIDEBAR_DEFAULT = 260;
export const SPLIT_MIN = 0.2;
export const SPLIT_MAX = 0.8;
export const SPLIT_DEFAULT = 0.5;

export function clampSidebar(w: number): number {
  return Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Math.round(w)));
}

export function clampSplit(r: number): number {
  return Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, r));
}

export function emptySession(
  layoutDock: LayoutDock = loadLayoutDock(),
): WorkspaceSession {
  return {
    openTabs: [],
    selectedId: null,
    collectionId: "",
    layoutDock,
    responseHidden: false,
    rail: "collections",
    expandedFolders: {},
    settingsSection: "mcp",
    envViewId: null,
    sidebarWidth: SIDEBAR_DEFAULT,
    splitRatio: SPLIT_DEFAULT,
  };
}

function isRail(v: unknown): v is Rail {
  return v === "collections" || v === "environments" || v === "history";
}

function isDock(v: unknown): v is LayoutDock {
  return v === "right" || v === "bottom";
}

function normalize(raw: unknown, fallbackDock: LayoutDock): WorkspaceSession {
  const base = emptySession(fallbackDock);
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  return {
    openTabs: Array.isArray(o.openTabs)
      ? o.openTabs.filter((t): t is string => typeof t === "string")
      : base.openTabs,
    selectedId: typeof o.selectedId === "string" ? o.selectedId : null,
    collectionId: typeof o.collectionId === "string" ? o.collectionId : "",
    layoutDock: isDock(o.layoutDock) ? o.layoutDock : fallbackDock,
    responseHidden: o.responseHidden === true,
    rail: isRail(o.rail) ? o.rail : base.rail,
    expandedFolders:
      o.expandedFolders && typeof o.expandedFolders === "object"
        ? Object.fromEntries(
            Object.entries(o.expandedFolders as Record<string, unknown>).filter(
              ([, v]) => typeof v === "boolean",
            ) as [string, boolean][],
          )
        : {},
    settingsSection:
      typeof o.settingsSection === "string" ? o.settingsSection : "mcp",
    envViewId: typeof o.envViewId === "string" ? o.envViewId : null,
    sidebarWidth:
      typeof o.sidebarWidth === "number" && Number.isFinite(o.sidebarWidth)
        ? clampSidebar(o.sidebarWidth)
        : SIDEBAR_DEFAULT,
    splitRatio:
      typeof o.splitRatio === "number" && Number.isFinite(o.splitRatio)
        ? clampSplit(o.splitRatio)
        : SPLIT_DEFAULT,
  };
}

function readAll(): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function writeAll(all: Record<string, WorkspaceSession>) {
  try {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

export function loadWorkspaceSession(id: string): WorkspaceSession | null {
  if (!id) return null;
  const raw = readAll()[id];
  if (raw == null) return null;
  return normalize(raw, loadLayoutDock());
}

export function saveWorkspaceSession(id: string, session: WorkspaceSession) {
  if (!id) return;
  const all = readAll();
  const next: Record<string, WorkspaceSession> = {};
  for (const [k, v] of Object.entries(all)) {
    next[k] = normalize(v, session.layoutDock);
  }
  next[id] = normalize(session, session.layoutDock);
  writeAll(next);
}

export function deleteWorkspaceSession(id: string) {
  if (!id) return;
  const all = readAll();
  if (!(id in all)) return;
  const next: Record<string, WorkspaceSession> = {};
  for (const [k, v] of Object.entries(all)) {
    if (k === id) continue;
    next[k] = normalize(v, loadLayoutDock());
  }
  writeAll(next);
}

// Runnable self-check: `npx tsx src/workspaceSession.ts`
declare const process: { argv: string[] } | undefined;
if (
  typeof process !== "undefined" &&
  process.argv[1]?.includes("workspaceSession")
) {
  const mem = new Map<string, string>();
  const store = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => {
      mem.set(k, v);
    },
  };
  (globalThis as { localStorage: typeof store }).localStorage = store;

  const s = emptySession("bottom");
  s.openTabs = ["a", "__settings__"];
  s.selectedId = "a";
  s.collectionId = "c1";
  s.responseHidden = true;
  s.rail = "history";
  s.expandedFolders = { f1: false };
  s.settingsSection = "ws:xyz";
  s.envViewId = "e1";
  s.sidebarWidth = 320;
  s.splitRatio = 0.35;
  saveWorkspaceSession("w1", s);
  const loaded = loadWorkspaceSession("w1");
  console.assert(loaded != null, "load");
  console.assert(loaded!.layoutDock === "bottom", "dock");
  console.assert(loaded!.openTabs.join(",") === "a,__settings__", "tabs");
  console.assert(loaded!.responseHidden === true, "hidden");
  console.assert(loaded!.rail === "history", "rail");
  console.assert(loaded!.settingsSection === "ws:xyz", "section");
  console.assert(loaded!.sidebarWidth === 320, "sidebar");
  console.assert(loaded!.splitRatio === 0.35, "split");
  console.assert(loadWorkspaceSession("missing") == null, "missing");
  console.assert(clampSidebar(10) === SIDEBAR_MIN, "sidebar min");
  console.assert(clampSplit(0.99) === SPLIT_MAX, "split max");

  mem.set(
    SESSIONS_KEY,
    JSON.stringify({
      w2: { openTabs: ["x", 1, null], layoutDock: "nope", rail: 3 },
    }),
  );
  const bad = loadWorkspaceSession("w2")!;
  console.assert(bad.layoutDock === "right", "bad dock falls back");
  console.assert(bad.rail === "collections", "bad rail fallback");
  console.assert(bad.openTabs.join(",") === "x", "strips non-strings");
  deleteWorkspaceSession("w2");
  console.assert(loadWorkspaceSession("w2") == null, "deleted");
  console.log("workspaceSession self-check ok");
}
