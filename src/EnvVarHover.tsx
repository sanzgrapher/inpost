/** Shared `{{var}}` hover popover + single-line field (Params/Headers/Auth/…). */

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
  type MutableRefObject,
} from "react";
import { createPortal } from "react-dom";
import { Braces, Pencil } from "lucide-react";
import { pairsToMap, resolveVar, tokenizeUrl } from "./envVar";
import { Button } from "./ui";

export type EnvInfo = { id: string; name: string };
export type EnvPair = { key: string; value: string; enabled?: boolean };

export type EnvVarHoverProps = {
  env: EnvInfo | null;
  envPairs: EnvPair[];
  globalPairs?: EnvPair[];
  onSaveVar: (name: string, value: string) => void | Promise<void>;
  onOpenEnv?: (envId: string) => void;
};

type HoverState = { name: string; rect: DOMRect };

const Ism = { size: 12, strokeWidth: 1.75 } as const;

export function useEnvVarHover() {
  const [hover, setHover] = useState<HoverState | null>(null);
  const [editing, setEditing] = useState(false);
  const editingRef = useRef(false);
  editingRef.current = editing;
  const leaveTimer = useRef<number | null>(null);

  function clearLeave() {
    if (leaveTimer.current != null) {
      window.clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
  }

  function scheduleClose() {
    clearLeave();
    leaveTimer.current = window.setTimeout(() => {
      if (editingRef.current) return;
      setHover(null);
    }, 180);
  }

  function openHover(name: string, el: HTMLElement) {
    clearLeave();
    const rect = el.getBoundingClientRect();
    setHover((h) => {
      if (h?.name === name) return { name, rect };
      setEditing(false);
      return { name, rect };
    });
  }

  function openHoverAt(name: string, rect: DOMRect) {
    clearLeave();
    setHover((h) => {
      if (h?.name === name) return { name, rect };
      setEditing(false);
      return { name, rect };
    });
  }

  useEffect(() => () => clearLeave(), []);

  return {
    hover,
    editing,
    setEditing,
    setHover,
    clearLeave,
    scheduleClose,
    openHover,
    openHoverAt,
  };
}

export function EnvVarPop({
  hover,
  editing,
  setEditing,
  clearLeave,
  scheduleClose,
  env,
  envPairs,
  globalPairs = [],
  onSaveVar,
  onOpenEnv,
  anchorContains,
  onDismiss,
}: EnvVarHoverProps & {
  hover: HoverState;
  editing: boolean;
  setEditing: (v: boolean) => void;
  clearLeave: () => void;
  scheduleClose: () => void;
  onDismiss: () => void;
  /** Extra nodes that should not dismiss the popover (field wrap). */
  anchorContains?: (node: Node) => boolean;
}) {
  const uid = useId();
  const popRef = useRef<HTMLDivElement>(null);
  const [draftValue, setDraftValue] = useState("");
  const [saving, setSaving] = useState(false);
  const activeMap = pairsToMap(envPairs);
  const globalMap = pairsToMap(globalPairs);
  const resolved = resolveVar(hover.name, activeMap, globalMap);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (popRef.current?.contains(t)) return;
      if (anchorContains?.(t)) return;
      onDismiss();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onDismiss();
    }
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [anchorContains, onDismiss]);

  async function commitSave() {
    setSaving(true);
    try {
      await onSaveVar(hover.name, draftValue);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  function startEdit() {
    setDraftValue(resolved.value ?? "");
    setEditing(true);
  }

  const popStyle = {
    top: hover.rect.bottom + 6,
    left: Math.min(hover.rect.left, window.innerWidth - 320 - 8),
  };

  return createPortal(
    <div
      ref={popRef}
      className="env-var-pop"
      role="dialog"
      aria-labelledby={`${uid}-title`}
      style={popStyle}
      onMouseEnter={clearLeave}
      onMouseLeave={scheduleClose}
    >
      {!editing ? (
        <>
          <div className="env-var-pop-head">
            <div className="env-var-pop-env" id={`${uid}-title`}>
              <span className="env-var-pop-ico" aria-hidden>
                <Braces {...Ism} />
              </span>
              <span>{env?.name || "No environment"}</span>
            </div>
            <button
              type="button"
              className="env-var-pop-edit"
              onClick={startEdit}
              disabled={!env}
              data-tip="Edit variable"
            >
              <Pencil {...Ism} /> Edit
            </button>
          </div>
          <dl className="env-var-pop-rows">
            <div>
              <dt>Name</dt>
              <dd>{hover.name}</dd>
            </div>
            <div>
              <dt>Type</dt>
              <dd>String</dd>
            </div>
            <div>
              <dt>Current value</dt>
              <dd
                className={resolved.source === "missing" ? "missing" : ""}
                data-tip={
                  resolved.source === "missing" ? undefined : resolved.value
                }
              >
                {resolved.source === "missing"
                  ? "Not defined"
                  : resolved.value || "—"}
              </dd>
            </div>
          </dl>
          {env && onOpenEnv && (
            <button
              type="button"
              className="env-var-pop-link"
              onClick={() => onOpenEnv(env.id)}
            >
              Open environment
            </button>
          )}
        </>
      ) : (
        <>
          <div className="env-var-pop-head">
            <div className="env-var-pop-env" id={`${uid}-title`}>
              <span className="env-var-pop-ico" aria-hidden>
                <Braces {...Ism} />
              </span>
              <span>Environment</span>
            </div>
          </div>
          <div className="env-var-pop-form">
            <label>
              <span>Name</span>
              <input className="ui-input" value={hover.name} readOnly />
            </label>
            <label>
              <span>Current value</span>
              <input
                className="ui-input"
                value={draftValue}
                autoFocus
                placeholder="Enter value"
                onChange={(e) => setDraftValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void commitSave();
                  }
                }}
              />
            </label>
            <label>
              <span>Type</span>
              <input className="ui-input" value="String" readOnly />
            </label>
          </div>
          <div className="env-var-pop-actions">
            <Button size="sm" onClick={() => setEditing(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={() => void commitSave()}
              disabled={saving || !env}
            >
              Save
            </Button>
          </div>
        </>
      )}
    </div>,
    document.body,
  );
}

/** Single-line input with `{{var}}` highlight + hover-edit (Params / Headers / Auth).

   Same layering as the URL bar: a "mirror" below paints colored tokens and the
   plain text in `var(--text)`; the input on top is text-transparent so its
   caret shows through and edits route through `onChange`. Hover targets live
   on a third hit layer (only the var spans get pointer events). */
export function VarField({
  value,
  onChange,
  placeholder,
  className = "",
  inputRef,
  type = "text",
  env,
  envPairs,
  globalPairs = [],
  onSaveVar,
  onOpenEnv,
}: EnvVarHoverProps & {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  inputRef?: RefObject<HTMLInputElement | null>;
  type?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const localRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const {
    hover,
    editing,
    setEditing,
    setHover,
    clearLeave,
    scheduleClose,
    openHover,
  } = useEnvVarHover();

  const activeMap = pairsToMap(envPairs);
  const globalMap = pairsToMap(globalPairs);
  const tokens = tokenizeUrl(value);
  const hasVars = tokens.some((t) => t.kind === "var");
  // Password fields: neither the mirror nor the highlight overlay should be in
  // text — keep them masked. We fall back to a plain password input.
  const masked = type === "password";

  function setRef(el: HTMLInputElement | null) {
    localRef.current = el;
    if (inputRef) {
      (inputRef as MutableRefObject<HTMLInputElement | null>).current = el;
    }
  }

  function renderMirror(): ReactNode {
    if (tokens.length === 0) {
      return <span className="vf-ph">{placeholder || ""}</span>;
    }
    return tokens.map((tok, i) => {
      if (tok.kind === "text") {
        return (
          <span key={i} className="vf-text">
            {tok.text}
          </span>
        );
      }
      const miss =
        resolveVar(tok.name, activeMap, globalMap).source === "missing";
      return (
        <span key={i} className={`vf-var ${miss ? "missing" : ""}`}>
          {tok.text}
        </span>
      );
    });
  }

  function renderHit(): ReactNode {
    return tokens.map((tok, i) => {
      if (tok.kind === "text") return <span key={i} />;
      const miss =
        resolveVar(tok.name, activeMap, globalMap).source === "missing";
      return (
        <span
          key={i}
          className={`vf-var ${miss ? "missing" : ""}`}
          onMouseEnter={(e) => openHover(tok.name, e.currentTarget)}
          onMouseLeave={scheduleClose}
        >
          {tok.text}
        </span>
      );
    });
  }

  // Masked (password) field: keep the OS-masked dots — no overlay, no mirror.
  if (masked) {
    return (
      <input
        ref={setRef}
        className={`vf-input-plain ${className}`}
        type="password"
        value={value}
        placeholder={placeholder}
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
    );
  }

  return (
    <div
      ref={wrapRef}
      className={`var-field ${focused ? "focused" : ""} ${className}`}
      onClick={(e) => {
        if (wrapRef.current?.contains(e.target as Node)) {
          localRef.current?.focus();
        }
      }}
    >
      <div className="vf-mirror" aria-hidden>
        {renderMirror()}
      </div>
      <input
        ref={setRef}
        className="vf-input"
        value={value}
        placeholder={placeholder}
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {hasVars && <div className="vf-hit" aria-hidden>{renderHit()}</div>}
      {hover && (
        <EnvVarPop
          hover={hover}
          editing={editing}
          setEditing={setEditing}
          clearLeave={clearLeave}
          scheduleClose={scheduleClose}
          env={env}
          envPairs={envPairs}
          globalPairs={globalPairs}
          onSaveVar={onSaveVar}
          onOpenEnv={onOpenEnv}
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
