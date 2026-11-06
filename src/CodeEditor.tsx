import { useEffect, useMemo, useRef } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";
import {
  SearchQuery,
  closeSearchPanel,
  findNext,
  findPrevious,
  getSearchQuery,
  openSearchPanel,
  search,
  searchKeymap,
  setSearchQuery,
} from "@codemirror/search";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  keymap,
  runScopeHandlers,
  type DecorationSet,
  type Panel,
  type ViewUpdate,
} from "@codemirror/view";
import { Prec, RangeSetBuilder, type Extension } from "@codemirror/state";
import { pairsToMap, resolveVar } from "./envVar";
import {
  EnvVarPop,
  useEnvVarHover,
  type EnvVarHoverProps,
} from "./EnvVarHover";

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | boolean | ((e: Event) => void)> = {},
  kids: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith("on") && typeof v === "function") {
      node.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    } else if (v === true) node.setAttribute(k, "");
    else if (v !== false) node.setAttribute(k, String(v));
  }
  for (const kid of kids) node.append(kid);
  return node;
}

/** VS Code–style find bar: input + Aa / ab / .* toggles, chevron next/prev. */
function createFindPanel(view: EditorView): Panel {
  let query = getSearchQuery(view.state);

  const input = el("input", {
    class: "cm-textfield",
    name: "search",
    form: "",
    placeholder: "Find",
    "aria-label": "Find",
    "main-field": "true",
  });
  input.value = query.search;

  function toggle(
    name: string,
    label: string,
    title: string,
    on: boolean,
    wordMark = false,
  ) {
    const btn = el("button", {
      type: "button",
      class: on ? "cm-search-toggle on" : "cm-search-toggle",
      name,
      title,
      "aria-label": title,
      "aria-pressed": on ? "true" : "false",
    });
    if (wordMark) {
      btn.append(el("span", { class: "cm-search-word" }, [label]));
    } else {
      btn.textContent = label;
    }
    btn.addEventListener("click", () => {
      const next = !btn.classList.contains("on");
      btn.classList.toggle("on", next);
      btn.setAttribute("aria-pressed", next ? "true" : "false");
      commit();
    });
    return btn;
  }

  const caseBtn = toggle("case", "Aa", "Match Case", query.caseSensitive);
  const wordBtn = toggle("word", "ab", "Match Whole Word", query.wholeWord, true);
  const reBtn = toggle("re", ".*", "Use Regular Expression", query.regexp);

  function commit() {
    const next = new SearchQuery({
      search: input.value,
      caseSensitive: caseBtn.classList.contains("on"),
      regexp: reBtn.classList.contains("on"),
      wholeWord: wordBtn.classList.contains("on"),
    });
    if (!next.eq(query)) {
      query = next;
      view.dispatch({ effects: setSearchQuery.of(next) });
    }
  }

  input.addEventListener("input", commit);
  input.addEventListener("change", commit);

  const field = el("div", { class: "cm-search-field" }, [
    input,
    caseBtn,
    wordBtn,
    reBtn,
  ]);

  const prev = el(
    "button",
    {
      type: "button",
      class: "cm-button",
      name: "prev",
      title: "Previous Match",
      "aria-label": "Previous Match",
      onclick: () => findPrevious(view),
    },
    ["previous"],
  );
  const nextBtn = el(
    "button",
    {
      type: "button",
      class: "cm-button",
      name: "next",
      title: "Next Match",
      "aria-label": "Next Match",
      onclick: () => findNext(view),
    },
    ["next"],
  );
  const close = el(
    "button",
    {
      type: "button",
      name: "close",
      title: "Close",
      "aria-label": "Close",
      onclick: () => closeSearchPanel(view),
    },
    ["×"],
  );

  const dom = el("div", { class: "cm-search" }, [
    field,
    prev,
    nextBtn,
    close,
  ]);

  dom.addEventListener("keydown", (e) => {
    if (runScopeHandlers(view, e, "search-panel")) {
      e.preventDefault();
    } else if (e.key === "Enter" && e.target === input) {
      e.preventDefault();
      (e.shiftKey ? findPrevious : findNext)(view);
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeSearchPanel(view);
    }
  });

  return {
    dom,
    top: true,
    mount() {
      input.select();
    },
    update(update) {
      for (const tr of update.transactions) {
        for (const effect of tr.effects) {
          if (effect.is(setSearchQuery) && !effect.value.eq(query)) {
            query = effect.value;
            input.value = query.search;
            caseBtn.classList.toggle("on", query.caseSensitive);
            caseBtn.setAttribute(
              "aria-pressed",
              query.caseSensitive ? "true" : "false",
            );
            wordBtn.classList.toggle("on", query.wholeWord);
            wordBtn.setAttribute(
              "aria-pressed",
              query.wholeWord ? "true" : "false",
            );
            reBtn.classList.toggle("on", query.regexp);
            reBtn.setAttribute(
              "aria-pressed",
              query.regexp ? "true" : "false",
            );
          }
        }
      }
    },
  };
}

/** Find panel + Ctrl/Cmd+F (stops webview page-find when focus is in CM). */
const findExt: Extension[] = [
  search({ top: true, createPanel: createFindPanel }),
  keymap.of(searchKeymap),
  Prec.highest(
    keymap.of([
      { key: "Mod-f", run: openSearchPanel, preventDefault: true },
      { key: "Mod-F", run: openSearchPanel, preventDefault: true },
    ]),
  ),
  // Read-only editors don't keep DOM focus after click unless tabindex is set.
  EditorView.contentAttributes.of({ tabindex: "0" }),
];

/** Last CodeMirror the user clicked — read-only response often loses activeElement. */
let lastFindView: EditorView | null = null;

function viewFromEl(el: Element | null): EditorView | null {
  if (!el) return null;
  const cm =
    el.closest(".cm-editor") ??
    el.closest(".response-pane, .body-pane, .editor-fill, .code-editor-wrap")?.querySelector(
      ".cm-editor",
    );
  return cm instanceof HTMLElement ? EditorView.findFromDOM(cm) : null;
}

function resolveFindView(e: KeyboardEvent): EditorView | null {
  const t = e.target as Element | null;
  // Don't steal Ctrl+F from real app inputs (URL, search, env fields, …).
  if (
    t instanceof HTMLInputElement ||
    t instanceof HTMLTextAreaElement ||
    (t instanceof HTMLElement && t.isContentEditable && !t.closest(".cm-editor"))
  ) {
    return null;
  }
  return (
    viewFromEl(t) ??
    viewFromEl(document.activeElement) ??
    (lastFindView?.dom.isConnected ? lastFindView : null)
  );
}

let findGuardRefs = 0;
function onFindGuardKey(e: KeyboardEvent) {
  if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
  if (e.key.toLowerCase() !== "f") return;
  const view = resolveFindView(e);
  if (!view) return;
  e.preventDefault();
  e.stopPropagation();
  lastFindView = view;
  view.focus();
  openSearchPanel(view);
}

function useFindGuard() {
  useEffect(() => {
    if (findGuardRefs++ === 0) {
      window.addEventListener("keydown", onFindGuardKey, true);
    }
    return () => {
      if (--findGuardRefs === 0) {
        window.removeEventListener("keydown", onFindGuardKey, true);
      }
    };
  }, []);
}

type Props = {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  language?: "json" | "text";
  placeholder?: string;
  className?: string;
  /** When set, highlight `{{vars}}` and allow hover-edit. */
  envHover?: EnvVarHoverProps;
};

const VAR_RE = /\{\{\s*([^{}]+?)\s*\}\}/g;

function buildEnvDecorations(
  view: EditorView,
  active: Record<string, string>,
  global: Record<string, string>,
): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.sliceDoc(from, to);
    const re = new RegExp(VAR_RE.source, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const name = m[1].trim();
      const miss = resolveVar(name, active, global).source === "missing";
      const start = from + m.index;
      const end = start + m[0].length;
      builder.add(
        start,
        end,
        Decoration.mark({
          class: miss ? "cm-env-var missing" : "cm-env-var",
          attributes: { "data-env-var": name },
        }),
      );
    }
  }
  return builder.finish();
}

function envVarExtension(
  active: Record<string, string>,
  global: Record<string, string>,
  api: {
    openHoverAt: (name: string, rect: DOMRect) => void;
    scheduleClose: () => void;
  },
): Extension[] {
  const marks = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildEnvDecorations(view, active, global);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = buildEnvDecorations(update.view, active, global);
        }
      }
    },
    { decorations: (v) => v.decorations },
  );

  const handlers = EditorView.domEventHandlers({
    mouseover(event) {
      const t = event.target as HTMLElement | null;
      const el = t?.closest?.(".cm-env-var") as HTMLElement | null;
      if (!el) return;
      const name = el.getAttribute("data-env-var");
      if (name) api.openHoverAt(name, el.getBoundingClientRect());
    },
    mouseout(event) {
      const related = event.relatedTarget as Node | null;
      const t = event.target as HTMLElement | null;
      const el = t?.closest?.(".cm-env-var");
      if (!el) return;
      if (related && el.contains(related)) return;
      api.scheduleClose();
    },
  });

  return [marks, handlers];
}

/** Thin CodeMirror 6 wrapper — same stack Yaak uses for bodies/responses. */
export function CodeEditor({
  value,
  onChange,
  readOnly = false,
  language = "json",
  placeholder,
  className,
  envHover,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  useFindGuard();
  const {
    hover,
    editing,
    setEditing,
    setHover,
    clearLeave,
    scheduleClose,
    openHoverAt,
  } = useEnvVarHover();

  const apiRef = useRef({ openHoverAt, scheduleClose });
  apiRef.current = { openHoverAt, scheduleClose };

  const mapKey = envHover
    ? JSON.stringify([
        pairsToMap(envHover.envPairs),
        pairsToMap(envHover.globalPairs ?? []),
      ])
    : "";

  const extensions = useMemo(() => {
    const exts: Extension[] = [
      ...findExt,
      ...(language === "json" ? [json()] : []),
      EditorView.lineWrapping,
      ...(readOnly ? [EditorView.editable.of(false)] : []),
    ];
    if (!envHover || readOnly) return exts;
    const [active, global] = JSON.parse(mapKey) as [
      Record<string, string>,
      Record<string, string>,
    ];
    exts.push(
      ...envVarExtension(active, global, {
        openHoverAt: (n, r) => apiRef.current.openHoverAt(n, r),
        scheduleClose: () => apiRef.current.scheduleClose(),
      }),
    );
    return exts;
  }, [language, readOnly, envHover, mapKey]);

  return (
    <div
      ref={wrapRef}
      className="code-editor-wrap"
      onMouseDown={(e) => {
        // Clicking chrome/empty area still focuses so Ctrl+F hits this editor.
        if ((e.target as HTMLElement).closest(".cm-search, .cm-panel")) return;
        const v = viewRef.current;
        if (!v) return;
        lastFindView = v;
        v.focus();
      }}
    >
      <CodeMirror
        className={`code-editor ${className ?? ""}`}
        value={value}
        height="100%"
        theme="light"
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          highlightActiveLine: !readOnly,
          highlightSelectionMatches: true,
        }}
        extensions={extensions}
        editable={!readOnly}
        readOnly={readOnly}
        placeholder={placeholder}
        onCreateEditor={(view) => {
          viewRef.current = view;
        }}
        onChange={onChange}
      />
      {envHover && hover && (
        <EnvVarPop
          hover={hover}
          editing={editing}
          setEditing={setEditing}
          clearLeave={clearLeave}
          scheduleClose={scheduleClose}
          env={envHover.env}
          envPairs={envHover.envPairs}
          globalPairs={envHover.globalPairs}
          onSaveVar={envHover.onSaveVar}
          onOpenEnv={envHover.onOpenEnv}
          onDismiss={() => {
            setEditing(false);
            setHover(null);
          }}
          anchorContains={(n) => !!wrapRef.current?.contains(n)}
        />
      )}
    </div>
  );
}
