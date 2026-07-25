/** Keyboard shortcuts — one table drives the handler, Settings, and the empty response hint. */

export type ShortcutAction =
  | "send"
  | "save"
  | "focusUrl"
  | "newRequest"
  | "search"
  | "toggleResponse"
  | "dockBottom"
  | "dockRight"
  | "cycleEnv"
  | "cycleTab"
  | "cycleTabPrev";

export type Shortcut = {
  action: ShortcutAction;
  keys: string[];
  label: string;
  note?: string;
};

export const SHORTCUTS: Shortcut[] = [
  { action: "send", keys: ["Ctrl", "Enter"], label: "Send request" },
  { action: "save", keys: ["Ctrl", "S"], label: "Save request" },
  { action: "focusUrl", keys: ["Ctrl", "L"], label: "Focus URL" },
  { action: "newRequest", keys: ["Ctrl", "N"], label: "New request" },
  { action: "search", keys: ["Ctrl", "K"], label: "Search" },
  { action: "toggleResponse", keys: ["Ctrl", "J"], label: "Show / hide response" },
  {
    action: "dockBottom",
    keys: ["Ctrl", "Alt", "↓"],
    label: "Dock response below",
  },
  {
    action: "dockRight",
    keys: ["Ctrl", "Alt", "→"],
    label: "Dock response right",
  },
  {
    action: "cycleEnv",
    keys: ["Shift", "Tab"],
    label: "Next environment",
    note: "Always — takes over reverse-tab in fields.",
  },
  {
    action: "cycleTab",
    keys: ["Ctrl", "Tab"],
    label: "Next open tab",
    note: "Also Ctrl+PageDown.",
  },
  {
    action: "cycleTabPrev",
    keys: ["Ctrl", "Shift", "Tab"],
    label: "Previous open tab",
    note: "Also Ctrl+PageUp — use if Ctrl+Shift+Tab is eaten by the OS/webview.",
  },
];

export type KeyEventLike = {
  key: string;
  code?: string;
  keyCode?: number;
  which?: number;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  getModifierState?: (key: string) => boolean;
};

function isTabKey(e: KeyEventLike): boolean {
  return (
    e.code === "Tab" ||
    e.key === "Tab" ||
    e.keyCode === 9 ||
    e.which === 9
  );
}

function hasShift(e: KeyEventLike): boolean {
  return e.shiftKey || e.getModifierState?.("Shift") === true;
}

function normKey(e: KeyEventLike): string {
  if (isTabKey(e)) return "tab";
  return (e.key || "").toLowerCase();
}

export function matchShortcut(e: KeyEventLike): ShortcutAction | null {
  const mod = e.ctrlKey || e.metaKey;
  const key = normKey(e);
  const shift = hasShift(e);

  if (mod && e.altKey) {
    if (key === "arrowdown") return "dockBottom";
    if (key === "arrowright") return "dockRight";
    return null;
  }

  // PageUp/Down — WebKit/Chrome/WSLg often swallow Ctrl(+Shift)+Tab before JS sees it.
  if (mod && !e.altKey && (key === "pageup" || e.code === "PageUp")) {
    return "cycleTabPrev";
  }
  if (mod && !e.altKey && (key === "pagedown" || e.code === "PageDown")) {
    return "cycleTab";
  }

  if (mod && key === "tab") {
    return shift ? "cycleTabPrev" : "cycleTab";
  }
  if (mod) {
    if (key === "enter") return "send";
    if (key === "s") return "save";
    if (key === "l") return "focusUrl";
    if (key === "n") return "newRequest";
    if (key === "k") return "search";
    if (key === "j") return "toggleResponse";
    return null;
  }
  if (shift && !e.altKey && key === "tab") return "cycleEnv";
  return null;
}

/** Webview inspector / view-source keys: F12, Ctrl+Shift+I/J/C, Cmd+Alt+I, Ctrl+U. */
export function isInspectKey(e: KeyEventLike): boolean {
  const key = normKey(e);
  if (key === "f12" || e.code === "F12") return true;
  if (!(e.ctrlKey || e.metaKey)) return false;
  if ((hasShift(e) || e.altKey) && (key === "i" || key === "j" || key === "c")) {
    return true;
  }
  return !hasShift(e) && !e.altKey && key === "u";
}

/** Wraps around; unknown/missing active id starts at the first entry. */
export function nextInCycle(
  ids: string[],
  activeId: string | null | undefined,
  dir: 1 | -1 = 1,
): string | null {
  if (ids.length === 0) return null;
  const i = activeId ? ids.indexOf(activeId) : -1;
  if (i < 0) return ids[0];
  return ids[(i + dir + ids.length) % ids.length];
}

// Runnable self-check: `npx tsx src/shortcuts.ts`
declare const process: { argv: string[] } | undefined;
if (typeof process !== "undefined" && process.argv[1]?.includes("shortcuts")) {
  const key = (
    k: string,
    mods: Partial<KeyEventLike> = {},
  ): KeyEventLike => ({
    key: k,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...mods,
  });

  console.assert(
    matchShortcut(key("j", { ctrlKey: true })) === "toggleResponse",
    "ctrl+j toggles response",
  );
  console.assert(
    matchShortcut(key("Tab", { shiftKey: true })) === "cycleEnv",
    "shift+tab always cycles env",
  );
  console.assert(
    matchShortcut(key("Tab", { ctrlKey: true })) === "cycleTab",
    "ctrl+tab cycles tabs",
  );
  console.assert(
    matchShortcut(key("Tab", { ctrlKey: true, shiftKey: true })) ===
      "cycleTabPrev",
    "ctrl+shift+tab previous tab",
  );
  console.assert(
    matchShortcut(key("Tab", { code: "Tab", keyCode: 9, ctrlKey: true, shiftKey: true })) ===
      "cycleTabPrev",
    "ctrl+shift+tab via keyCode",
  );
  console.assert(
    matchShortcut(key("PageUp", { ctrlKey: true })) === "cycleTabPrev",
    "ctrl+pageup previous tab",
  );
  console.assert(
    matchShortcut(key("PageDown", { ctrlKey: true })) === "cycleTab",
    "ctrl+pagedown next tab",
  );
  console.assert(
    matchShortcut(key("PageUp", { ctrlKey: true, shiftKey: true })) ===
      "cycleTabPrev",
    "ctrl+shift+pageup still previous",
  );
  console.assert(matchShortcut(key("Tab")) === null, "plain tab tabs");

  console.assert(isInspectKey(key("F12")), "f12 inspects");
  console.assert(
    isInspectKey(key("I", { ctrlKey: true, shiftKey: true })),
    "ctrl+shift+i inspects",
  );
  console.assert(
    isInspectKey(key("i", { metaKey: true, altKey: true })),
    "cmd+alt+i inspects",
  );
  console.assert(isInspectKey(key("u", { ctrlKey: true })), "ctrl+u view-source");
  console.assert(!isInspectKey(key("i")), "plain i types");
  console.assert(!isInspectKey(key("s", { ctrlKey: true })), "ctrl+s saves");
  console.assert(
    !isInspectKey(key("ArrowDown", { ctrlKey: true, altKey: true })),
    "dock shortcut is not an inspect key",
  );

  console.assert(nextInCycle(["a", "b", "c"], "a", -1) === "c", "cycle prev wraps");
  console.assert(nextInCycle(["a", "b", "c"], "b", -1) === "a", "cycle prev");

  console.log("shortcuts self-check ok");
}
