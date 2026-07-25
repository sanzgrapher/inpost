import {
  useEffect,
  useId,
  useRef,
  useState,
  type MutableRefObject,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { Braces, Pencil } from "lucide-react";
import { pairsToMap, resolveVar, tokenizeUrl } from "./envVar";
import { Button } from "./ui";

type EnvInfo = { id: string; name: string };
type Pair = { key: string; value: string; enabled?: boolean };

const Ism = { size: 12, strokeWidth: 1.75 } as const;

type Props = {
  value: string;
  onChange: (v: string) => void;
  inputRef?: RefObject<HTMLInputElement | null>;
  placeholder?: string;
  className?: string;
  env: EnvInfo | null;
  envPairs: Pair[];
  globalPairs?: Pair[];
  onSaveVar: (name: string, value: string) => void | Promise<void>;
  onOpenEnv?: (envId: string) => void;
};

type HoverState = {
  name: string;
  rect: DOMRect;
};

export function UrlField({
  value,
  onChange,
  inputRef,
  placeholder,
  className = "",
  env,
  envPairs,
  globalPairs = [],
  onSaveVar,
  onOpenEnv,
}: Props) {
  const uid = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const localRef = useRef<HTMLInputElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);
  const [hover, setHover] = useState<HoverState | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftValue, setDraftValue] = useState("");
  const [saving, setSaving] = useState(false);
  const leaveTimer = useRef<number | null>(null);
  const editingRef = useRef(false);
  editingRef.current = editing;

  const activeMap = pairsToMap(envPairs);
  const globalMap = pairsToMap(globalPairs);
  const tokens = tokenizeUrl(value);

  function setInputRef(el: HTMLInputElement | null) {
    localRef.current = el;
    if (inputRef) {
      (inputRef as MutableRefObject<HTMLInputElement | null>).current = el;
    }
  }

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
      if (h?.name === name && !editing) return { name, rect };
      setEditing(false);
      return { name, rect };
    });
  }

  useEffect(() => {
    if (!hover) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (popRef.current?.contains(t)) return;
      if (wrapRef.current?.contains(t)) return;
      setEditing(false);
      setHover(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setEditing(false);
        setHover(null);
      }
    }
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [hover]);

  useEffect(() => () => clearLeave(), []);

  const resolved = hover
    ? resolveVar(hover.name, activeMap, globalMap)
    : null;

  async function commitSave() {
    if (!hover) return;
    setSaving(true);
    try {
      await onSaveVar(hover.name, draftValue);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  function startEdit() {
    if (!hover) return;
    setDraftValue(resolved?.value ?? "");
    setEditing(true);
  }

  const popStyle =
    hover != null
      ? {
          top: hover.rect.bottom + 6,
          left: Math.min(hover.rect.left, window.innerWidth - 320 - 8),
        }
      : undefined;

  function renderTokens(interactive: boolean) {
    if (tokens.length === 0) {
      return <span className="url-field-ph">{placeholder || ""}</span>;
    }
    return tokens.map((tok, i) => {
      if (tok.kind === "text") {
        return (
          <span key={i} className="url-field-text">
            {tok.text}
          </span>
        );
      }
      const miss =
        resolveVar(tok.name, activeMap, globalMap).source === "missing";
      if (!interactive) {
        return (
          <span key={i} className={`url-var ${miss ? "missing" : ""}`}>
            {tok.text}
          </span>
        );
      }
      return (
        <span
          key={i}
          className={`url-var ${miss ? "missing" : ""}`}
          onMouseEnter={(e) => openHover(tok.name, e.currentTarget)}
          onMouseLeave={scheduleClose}
        >
          {tok.text}
        </span>
      );
    });
  }

  return (
    <div
      ref={wrapRef}
      className={`url-field ${focused ? "focused" : ""} ${className}`}
      onClick={(e) => {
        if (wrapRef.current?.contains(e.target as Node)) {
          localRef.current?.focus();
        }
      }}
    >
      <div className="url-field-mirror" aria-hidden>
        {renderTokens(false)}
      </div>
      <input
        ref={setInputRef}
        className="url-field-input"
        value={value}
        placeholder={placeholder}
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {!focused && <div className="url-field-hit">{renderTokens(true)}</div>}

      {hover &&
        resolved &&
        createPortal(
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
                      className={
                        resolved.source === "missing" ? "missing" : ""
                      }
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
                  <Button
                    size="sm"
                    onClick={() => setEditing(false)}
                    disabled={saving}
                  >
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
        )}
    </div>
  );
}
