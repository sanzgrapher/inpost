import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { Search, X } from "lucide-react";
import {
  effectiveScope,
  filterIndex,
  parseSearchQuery,
  scopeChips,
  scopeSuggestions,
  serializeSearchQuery,
  trailingScope,
  uncommitLastChip,
  type IndexItem,
  type ScopeSuggestion,
  type SearchScope,
} from "./searchQuery";
import { methodClass, methodLabel } from "./methodStyle";

export type { IndexItem };

const I = { size: 14, strokeWidth: 1.75 } as const;
const Ism = { size: 12, strokeWidth: 1.75 } as const;
const HISTORY_CAP = 60;

type Props = {
  query: string;
  onQuery: (q: string) => void;
  inputRef: RefObject<HTMLInputElement | null>;
  index: IndexItem[];
  loading?: boolean;
  workspaceId?: string;
  onOpen: (item: IndexItem) => void;
  onFocusSearch?: () => void;
};

export function GlobalSearch({
  query,
  onQuery,
  inputRef,
  index,
  loading,
  workspaceId,
  onOpen,
  onFocusSearch,
}: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  // Controlled input + chips kill the browser undo stack — keep our own.
  const undoStack = useRef<string[]>([]);
  const redoStack = useRef<string[]>([]);
  const scope = useMemo(() => parseSearchQuery(query), [query]);
  const chips = useMemo(() => scopeChips(scope), [scope]);
  const filter = useMemo(() => effectiveScope(scope), [scope]);
  const hits = useMemo(() => {
    if (!query.trim() && chips.length === 0) return [];
    return filterIndex(index, scope, { workspaceId }).slice(0, 40);
  }, [index, query, scope, workspaceId, chips.length]);
  const trail = useMemo(() => trailingScope(scope.text), [scope.text]);
  const suggestions = useMemo(
    () =>
      trail ? scopeSuggestions(index, trail, scope, { workspaceId }) : [],
    [index, trail, scope, workspaceId],
  );
  // Suggestions come first, so the highlight runs across both lists.
  const total = suggestions.length + hits.length;

  useEffect(() => setActive(0), [hits, suggestions]);

  useEffect(() => {
    rootRef.current
      ?.querySelector(".search-hit.active")
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function commitQuery(next: string) {
    if (next === query) return;
    undoStack.current.push(query);
    if (undoStack.current.length > HISTORY_CAP) undoStack.current.shift();
    redoStack.current = [];
    onQuery(next);
  }

  function undoQuery() {
    const prev = undoStack.current.pop();
    if (prev === undefined) return;
    redoStack.current.push(query);
    onQuery(prev);
  }

  function redoQuery() {
    const next = redoStack.current.pop();
    if (next === undefined) return;
    undoStack.current.push(query);
    onQuery(next);
  }

  function setScope(next: SearchScope) {
    commitQuery(serializeSearchQuery(next));
  }

  function select(item: IndexItem) {
    onOpen(item);
    commitQuery("");
    setOpen(false);
  }

  /** Turn the half-typed `key:value` into a committed chip. */
  function applySuggestion(s: ScopeSuggestion) {
    if (!trail) return;
    setScope({
      ...scope,
      [s.key]: s.value,
      text: scope.text.slice(0, trail.start).trim(),
    });
    inputRef.current?.focus();
  }

  function commitActive() {
    if (active < suggestions.length) {
      applySuggestion(suggestions[active]);
      return;
    }
    const hit = hits[active - suggestions.length];
    if (hit) select(hit);
  }

  function removeChip(key: "from" | "in" | "folder") {
    setScope({ ...scope, [key]: undefined });
  }

  const showPalette = open && (query.trim().length > 0 || chips.length > 0);
  const elevated = open || chips.length > 0 || query.trim().length > 0;

  return (
    <div
      className={`global-search-wrap ${elevated ? "elevated" : ""} ${showPalette ? "open" : ""}`}
      ref={rootRef}
    >
      <div className={`global-search ${open ? "focused" : ""}`}>
        <Search className="global-search-icon" {...I} aria-hidden />
        <div className="global-search-chips">
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              className="search-chip"
              data-tip={`Remove ${c.key}:${c.value}`}
              onClick={() => removeChip(c.key as "from" | "in" | "folder")}
            >
              <em>{c.key}:</em>
              <span className="search-chip-val">{c.value}</span>
              <span className="search-chip-x" aria-hidden>
                <X {...Ism} />
              </span>
            </button>
          ))}
        </div>
        <input
          ref={inputRef}
          className="global-search-input"
          placeholder={
            chips.length
              ? "Filter requests…"
              : "Search requests…  in:  folder:  from:"
          }
          value={scope.text}
          onChange={(e) => {
            setScope({ ...scope, text: e.target.value });
            setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            onFocusSearch?.();
          }}
          onKeyDown={(e) => {
            const mod = e.ctrlKey || e.metaKey;
            if (mod && e.key.toLowerCase() === "z") {
              e.preventDefault();
              if (e.shiftKey) redoQuery();
              else undoQuery();
              return;
            }
            if (mod && e.key.toLowerCase() === "y") {
              e.preventDefault();
              redoQuery();
              return;
            }
            // Empty input + Backspace: expand the chip back to editable text
            // (don't wipe the filter in one shot).
            if (e.key === "Backspace" && !scope.text && chips.length) {
              e.preventDefault();
              const next = uncommitLastChip(scope);
              if (next) setScope(next);
              return;
            }
            if (e.key === "Escape") {
              if (query) commitQuery("");
              else setOpen(false);
              (e.target as HTMLInputElement).blur();
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => Math.min(i + 1, Math.max(total - 1, 0)));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (e.key === "Tab" && suggestions.length) {
              e.preventDefault();
              applySuggestion(suggestions[Math.min(active, suggestions.length - 1)]);
            } else if (e.key === "Enter" && total > 0) {
              e.preventDefault();
              commitActive();
            }
          }}
        />
        {(query.trim() || chips.length > 0) && (
          <button
            type="button"
            className="global-search-clear"
            aria-label="Clear search"
            onClick={() => commitQuery("")}
          >
            <X {...Ism} />
          </button>
        )}
      </div>

      {showPalette && (
        <div className="search-palette" role="listbox">
          {loading && <div className="search-palette-hint">Indexing…</div>}
          {!loading && total === 0 && (
            <div className="search-palette-hint">
              No matches. Try <code>in:Default</code> then space,{" "}
              <code>folder:Auth</code>, or <code>from:Personal</code>
            </div>
          )}
          {!loading && suggestions.length > 0 && (
            <div className="search-group">
              <div className="search-group-label">
                {trail?.key === "from"
                  ? "Workspaces"
                  : trail?.key === "folder"
                    ? "Folders"
                    : "Collections"}
              </div>
              {suggestions.map((s, i) => (
                <button
                  key={`${s.key}-${s.value}`}
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  className={`search-hit search-scope-hit ${i === active ? "active" : ""}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => applySuggestion(s)}
                >
                  <span className="search-kind scope">{s.key}:</span>
                  <span className="search-hit-main">
                    <span className="search-hit-title">
                      {highlightMatch(s.value, trail?.value ?? "")}
                    </span>
                    <span className="search-hit-path">
                      {s.key === trail?.key
                        ? "Enter or Tab to scope"
                        : `Not a ${trail?.key} — scope by ${s.key} instead`}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
          {!loading &&
            groupHits(hits).map(([label, rows]) => (
              <div key={label} className="search-group">
                <div className="search-group-label">{label}</div>
                {rows.map((item) => {
                  const idx = suggestions.length + hits.indexOf(item);
                  return (
                    <button
                      key={`${item.kind}-${item.id}`}
                      type="button"
                      role="option"
                      aria-selected={idx === active}
                      className={`search-hit ${idx === active ? "active" : ""}`}
                      onMouseEnter={() => setActive(idx)}
                      onClick={() => select(item)}
                    >
                      {item.kind === "request" ? (
                        <span className={methodClass(item.method || "GET")}>
                          {methodLabel(item.method || "GET")}
                        </span>
                      ) : (
                        <span className="search-kind">
                          {item.kind === "folder" ? "DIR" : "COL"}
                        </span>
                      )}
                      <span className="search-hit-main">
                        <span className="search-hit-title">
                          {highlightMatch(item.title, filter.text)}
                        </span>
                        <span className="search-hit-path">
                          {[item.workspaceName, item.collectionName, ...item.path]
                            .filter(Boolean)
                            .join(" › ")}
                          {item.url ? ` · ${item.url}` : ""}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          <div className="search-palette-foot">
            <span>
              <kbd>↑↓</kbd> navigate{" "}
              {suggestions.length > 0 && (
                <>
                  <kbd>tab</kbd> scope{" "}
                </>
              )}
              <kbd>↵</kbd> open <kbd>esc</kbd> close
            </span>
            <span className="search-palette-scopes">
              <code>in:</code> <code>folder:</code> <code>from:</code>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function highlightMatch(title: string, needle: string): ReactNode {
  const q = needle.trim();
  if (!q) return title;
  const lower = title.toLowerCase();
  const i = lower.indexOf(q.toLowerCase());
  if (i < 0) return title;
  return (
    <>
      {title.slice(0, i)}
      <mark className="search-mark">{title.slice(i, i + q.length)}</mark>
      {title.slice(i + q.length)}
    </>
  );
}

function groupHits(hits: IndexItem[]): [string, IndexItem[]][] {
  const order: IndexItem["kind"][] = ["request", "folder", "collection"];
  const labels: Record<IndexItem["kind"], string> = {
    request: "Requests",
    folder: "Folders",
    collection: "Collections",
  };
  const groups: [string, IndexItem[]][] = [];
  for (const kind of order) {
    const rows = hits.filter((h) => h.kind === kind);
    if (rows.length) groups.push([labels[kind], rows]);
  }
  return groups;
}
