import { useMemo, useRef } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import { RangeSetBuilder, type Extension } from "@codemirror/state";
import { pairsToMap, resolveVar } from "./envVar";
import {
  EnvVarPop,
  useEnvVarHover,
  type EnvVarHoverProps,
} from "./EnvVarHover";

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
    <div ref={wrapRef} className="code-editor-wrap">
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
