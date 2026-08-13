/** Tab-strip close actions — enablement, which ids to drop, close/reopen stack. */

export type TabCloseAction =
  | "close"
  | "closeOthers"
  | "closeToRight"
  | "closeAll"
  | "closeSaved";

export type TabCloseEnabled = Record<TabCloseAction, boolean>;

export type ClosedTab = { id: string; index: number };

const CLOSED_CAP = 20;

export function tabCloseEnabled(
  tabs: string[],
  index: number,
  dirty: (id: string) => boolean,
): TabCloseEnabled {
  const n = tabs.length;
  const inRange = index >= 0 && index < n;
  return {
    close: inRange,
    closeOthers: n > 1 && inRange,
    closeToRight: inRange && index < n - 1,
    closeAll: n > 0,
    closeSaved: tabs.some((id) => !dirty(id)),
  };
}

export function idsToClose(
  action: TabCloseAction,
  tabs: string[],
  index: number,
  dirty: (id: string) => boolean,
): string[] {
  switch (action) {
    case "close":
      return index >= 0 && index < tabs.length ? [tabs[index]] : [];
    case "closeOthers":
      return index >= 0 && index < tabs.length
        ? tabs.filter((_, i) => i !== index)
        : [];
    case "closeToRight":
      return index >= 0 ? tabs.slice(index + 1) : [];
    case "closeAll":
      return [...tabs];
    case "closeSaved":
      return tabs.filter((id) => !dirty(id));
  }
}

/** Snapshot ids with their strip index; `preferLast` is popped first (focused tab). */
export function entriesToClose(
  tabs: string[],
  ids: string[],
  preferLast?: string,
): ClosedTab[] {
  const want = new Set(ids);
  const entries = tabs
    .map((id, index) => ({ id, index }))
    .filter((e) => want.has(e.id));
  if (!preferLast || !want.has(preferLast)) return entries;
  const last = entries.find((e) => e.id === preferLast);
  if (!last) return entries;
  return [...entries.filter((e) => e.id !== preferLast), last];
}

export function pushClosed(
  stack: ClosedTab[],
  entries: ClosedTab[],
): ClosedTab[] {
  let next = stack;
  for (const e of entries) {
    next = next.filter((x) => x.id !== e.id);
    next = [...next, e];
  }
  return next.length > CLOSED_CAP ? next.slice(next.length - CLOSED_CAP) : next;
}

export function popClosed(
  stack: ClosedTab[],
): { entry: ClosedTab; rest: ClosedTab[] } | null {
  if (stack.length === 0) return null;
  return { entry: stack[stack.length - 1], rest: stack.slice(0, -1) };
}

/** Put a tab back at its old index (clamped). No-op if already open. */
export function insertTab(tabs: string[], id: string, index: number): string[] {
  if (tabs.includes(id)) return tabs;
  const i = Math.max(0, Math.min(index, tabs.length));
  return [...tabs.slice(0, i), id, ...tabs.slice(i)];
}

// Runnable self-check: `npx tsx src/tabClose.ts`
declare const process: { argv: string[] } | undefined;
if (typeof process !== "undefined" && process.argv[1]?.includes("tabClose")) {
  const tabs = ["a", "b", "c"];
  const noneDirty = () => false;
  const bDirty = (id: string) => id === "b";

  const mid = tabCloseEnabled(tabs, 1, noneDirty);
  console.assert(mid.close && mid.closeOthers && mid.closeToRight && mid.closeAll && mid.closeSaved, "middle: all on");

  const last = tabCloseEnabled(tabs, 2, noneDirty);
  console.assert(last.close && last.closeOthers && !last.closeToRight, "rightmost: no close-to-right");

  const only = tabCloseEnabled(["a"], 0, noneDirty);
  console.assert(only.close && !only.closeOthers && !only.closeToRight && only.closeAll, "single: no others/right");

  const allDirty = tabCloseEnabled(["a"], 0, () => true);
  console.assert(!allDirty.closeSaved, "all dirty: no close-saved");

  console.assert(idsToClose("close", tabs, 1, noneDirty).join() === "b", "close one");
  console.assert(idsToClose("closeOthers", tabs, 1, noneDirty).join() === "a,c", "close others");
  console.assert(idsToClose("closeToRight", tabs, 0, noneDirty).join() === "b,c", "close right");
  console.assert(idsToClose("closeToRight", tabs, 2, noneDirty).join() === "", "close right empty");
  console.assert(idsToClose("closeAll", tabs, 0, noneDirty).join() === "a,b,c", "close all");
  console.assert(idsToClose("closeSaved", tabs, 0, bDirty).join() === "a,c", "close saved skips dirty");

  const stacked = pushClosed([], entriesToClose(tabs, ["a", "b", "c"], "b"));
  console.assert(stacked.map((e) => e.id).join() === "a,c,b", "preferLast is popped first");
  const popped = popClosed(stacked);
  console.assert(popped?.entry.id === "b" && popped.rest.map((e) => e.id).join() === "a,c", "pop last");
  console.assert(popClosed([]) === null, "pop empty");

  const capped = pushClosed(
    Array.from({ length: 20 }, (_, i) => ({ id: `x${i}`, index: i })),
    [{ id: "new", index: 0 }],
  );
  console.assert(capped.length === 20 && capped[19].id === "new" && capped[0].id === "x1", "cap 20");

  // Ctrl+W / Ctrl+Shift+T back and forth, then a 3-close / 3-reopen sequence.
  let strip = ["a", "b", "c"];
  let stack: ClosedTab[] = [];
  stack = pushClosed(stack, entriesToClose(strip, ["c"]));
  strip = strip.filter((t) => t !== "c");
  let step = popClosed(stack)!;
  stack = step.rest;
  strip = insertTab(strip, step.entry.id, step.entry.index);
  console.assert(strip.join() === "a,b,c", "reopen puts c back at 2");
  stack = pushClosed(stack, entriesToClose(strip, ["c"]));
  strip = strip.filter((t) => t !== "c");
  step = popClosed(stack)!;
  strip = insertTab(strip, step.entry.id, step.entry.index);
  console.assert(strip.join() === "a,b,c", "close/reopen back and forth");

  strip = ["a", "b", "c"];
  stack = [];
  for (const id of ["c", "b", "a"]) {
    stack = pushClosed(stack, entriesToClose(strip, [id]));
    strip = strip.filter((t) => t !== id);
  }
  let restored: string[] = [];
  while (stack.length) {
    step = popClosed(stack)!;
    stack = step.rest;
    restored = insertTab(restored, step.entry.id, step.entry.index);
  }
  console.assert(restored.join() === "a,b,c", "reopen sequence restores order");

  console.assert(insertTab(["a", "c"], "b", 1).join() === "a,b,c", "insert middle");
  console.assert(insertTab(["a"], "b", 9).join() === "a,b", "insert clamps high");
  console.assert(insertTab(["a", "b"], "a", 0).join() === "a,b", "insert skip dup");

  console.log("tabClose self-check ok");
}
