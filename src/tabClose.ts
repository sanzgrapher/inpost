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

/** Drag-reorder: move `fromId` before/after `toId`. Returns same array if no change. */
export function reorderTab(
  tabs: string[],
  fromId: string,
  toId: string,
  place: "before" | "after",
): string[] {
  if (fromId === toId) return tabs;
  const from = tabs.indexOf(fromId);
  const to = tabs.indexOf(toId);
  if (from < 0 || to < 0) return tabs;
  const next = tabs.slice();
  const [item] = next.splice(from, 1);
  const to2 = next.indexOf(toId);
  if (to2 < 0) return tabs;
  const insertAt = place === "before" ? to2 : to2 + 1;
  next.splice(insertAt, 0, item);
  for (let i = 0; i < tabs.length; i++) {
    if (next[i] !== tabs[i]) return next;
  }
  return tabs;
}

/**
 * Move item at `from` into post-removal slot `insertAt` (0..n-1 = index among
 * the other tabs after removal, i.e. final index in the new array).
 */
export function moveTabIndex(
  tabs: string[],
  from: number,
  insertAt: number,
): string[] {
  if (from < 0 || from >= tabs.length) return tabs;
  const next = tabs.slice();
  const [item] = next.splice(from, 1);
  const at = Math.max(0, Math.min(insertAt, next.length));
  next.splice(at, 0, item);
  for (let i = 0; i < tabs.length; i++) {
    if (next[i] !== tabs[i]) return next;
  }
  return tabs;
}

/**
 * While dragging from `from` toward post-removal slot `insertAt`, sibling at
 * original index `i` slides by ±`width`. The dragged tab follows the pointer.
 */
export function tabSiblingShift(
  i: number,
  from: number,
  insertAt: number,
  width: number,
): number {
  if (i === from) return 0;
  // insertAt is the index in the array AFTER removing `from`.
  // Map to “which original indices slide”:
  // moving right (from < visual destination): tabs that currently sit in the
  // gap shift left. Destination final index = insertAt when from > insertAt,
  // or insertAt+1 conceptually when from < insertAt…
  //
  // moveTabIndex(from, insertAt): remove then splice(insertAt).
  // from=0, insertAt=2 → [B,C,A,D]: originals 1,2 (B,C) shift left.
  //   condition: i > from && i <= insertAt  (1,2) ✓  — but insertAt=2 and from=0,
  //   after remove insert at 2 means final index 2; originals that move are 1..2.
  // from=3, insertAt=1 → [A,D,B,C]: originals 1,2 shift right.
  //   condition: i >= insertAt && i < from ✓
  // from=2, insertAt=2 → [A,B,C,D] no-op: remove C, splice(2) into [A,B,D] → [A,B,C,D].
  //   from < insertAt is false, from > insertAt is false ✓
  // from=1, insertAt=0 → [B,A,C,D]: original 0 shifts right.
  //   i >= 0 && i < 1 → i=0 ✓
  if (from < insertAt) {
    if (i > from && i <= insertAt) return -width;
  } else if (from > insertAt) {
    if (i >= insertAt && i < from) return width;
  }
  return 0;
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

  console.assert(
    reorderTab(["a", "b", "c"], "a", "c", "before").join() === "b,a,c",
    "reorder a before c",
  );
  console.assert(
    reorderTab(["a", "b", "c"], "c", "a", "after").join() === "a,c,b",
    "reorder c after a",
  );
  const same = ["a", "b", "c"];
  console.assert(reorderTab(same, "b", "b", "before") === same, "same id no-op");
  console.assert(reorderTab(same, "a", "b", "before") === same, "already before no-op");

  console.assert(moveTabIndex(["a", "b", "c", "d"], 0, 2).join() === "b,c,a,d", "move 0→2");
  console.assert(moveTabIndex(["a", "b", "c", "d"], 3, 1).join() === "a,d,b,c", "move 3→1");
  console.assert(moveTabIndex(["a", "b", "c", "d"], 2, 2).join() === "a,b,c,d", "move no-op");
  console.assert(tabSiblingShift(1, 0, 2, 100) === -100, "shift left");
  console.assert(tabSiblingShift(1, 3, 1, 100) === 100, "shift right");
  console.assert(tabSiblingShift(0, 0, 2, 100) === 0, "dragged no sibling shift");

  console.log("tabClose self-check ok");
}
