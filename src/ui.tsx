import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { ChevronDown, X } from "lucide-react";
import "./ui.css";

const Ism = { size: 12, strokeWidth: 1.75 } as const;

type BtnVariant = "primary" | "secondary" | "danger" | "ghost";

export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  type = "button",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: BtnVariant;
  size?: "md" | "sm";
}) {
  return (
    <button
      type={type}
      className={`ui-btn ui-btn-${variant} ${size === "sm" ? "ui-btn-sm" : ""} ${className}`.trim()}
      {...props}
    />
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  autoFocus,
  onSubmit,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  onSubmit?: () => void;
}) {
  const id = useId();
  return (
    <div className="ui-field">
      {label && (
        <label className="ui-label" htmlFor={id}>
          {label}
        </label>
      )}
      <input
        id={id}
        className="ui-input"
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onSubmit?.();
          }
        }}
      />
    </div>
  );
}

export function Select({
  value,
  options,
  onChange,
  placeholder = "Select…",
  className = "",
  tip,
  disabled = false,
}: {
  value: string;
  options: { id: string; label: string }[];
  onChange: (id: string) => void;
  placeholder?: string;
  className?: string;
  tip?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.id === value);

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

  return (
    <div
      className={`ui-select ${disabled ? "disabled" : ""} ${className}`.trim()}
      ref={rootRef}
      data-tip={tip}
    >
      <button
        type="button"
        className={`ui-select-trigger ${open ? "open" : ""}`}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen((v) => !v);
        }}
      >
        <span className="ui-select-value">
          {current?.label ?? placeholder}
        </span>
        <span className="ui-select-chevron">
          <ChevronDown {...Ism} />
        </span>
      </button>
      {open && !disabled && (
        <div className="ui-select-menu">
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              className={`ui-select-option ${o.id === value ? "active" : ""}`}
              onClick={() => {
                onChange(o.id);
                setOpen(false);
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Free-text input with a filtered suggestion menu (replaces native datalist). */
export function SuggestInput({
  value,
  onChange,
  suggestions,
  placeholder,
  readOnly,
  className = "",
  invalid,
}: {
  value: string;
  onChange: (v: string) => void;
  suggestions: string[];
  placeholder?: string;
  readOnly?: boolean;
  className?: string;
  /** Error message: red border + tooltip. */
  invalid?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [menuPos, setMenuPos] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase();
    const list = !q
      ? suggestions
      : suggestions.filter((s) => s.toLowerCase().includes(q));
    return [...list]
      .sort((a, b) => {
        if (!q) return a.localeCompare(b);
        return (
          Number(!a.toLowerCase().startsWith(q)) -
            Number(!b.toLowerCase().startsWith(q)) || a.localeCompare(b)
        );
      })
      .slice(0, 14);
  }, [value, suggestions]);

  const show = open && !readOnly && filtered.length > 0;

  function placeMenu() {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setMenuPos({ top: r.bottom + 4, left: r.left, width: r.width });
  }

  useLayoutEffect(() => {
    if (!show) {
      setMenuPos(null);
      return;
    }
    placeMenu();
    window.addEventListener("resize", placeMenu);
    // Capture scroll from any ancestor (headers pane, etc.)
    window.addEventListener("scroll", placeMenu, true);
    return () => {
      window.removeEventListener("resize", placeMenu);
      window.removeEventListener("scroll", placeMenu, true);
    };
  }, [show, value]);

  useEffect(() => setActive(0), [filtered, open]);

  useEffect(() => {
    if (!show) return;
    listRef.current
      ?.querySelector(".ui-suggest-option.active")
      ?.scrollIntoView({ block: "nearest" });
  }, [active, show]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (rootRef.current?.contains(t)) return;
      if (listRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function pick(s: string) {
    onChange(s);
    setOpen(false);
    inputRef.current?.focus();
  }

  return (
    <div
      className={`ui-suggest ${invalid ? "invalid" : ""} ${className}`.trim()}
      ref={rootRef}
      data-tip={invalid || undefined}
    >
      <input
        ref={inputRef}
        type="text"
        aria-invalid={!!invalid || undefined}
        value={value}
        placeholder={placeholder}
        readOnly={readOnly}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          if (!readOnly) setOpen(true);
        }}
        onKeyDown={(e) => {
          if (!show) {
            if (e.key === "ArrowDown" && filtered.length) {
              e.preventDefault();
              setOpen(true);
            }
            return;
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, filtered.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter" && filtered[active]) {
            e.preventDefault();
            pick(filtered[active]);
          } else if (e.key === "Escape") {
            e.preventDefault();
            setOpen(false);
          } else if (e.key === "Tab" && filtered[active]) {
            pick(filtered[active]);
          }
        }}
      />
      {show &&
        menuPos &&
        createPortal(
          <div
            className="ui-suggest-menu"
            ref={listRef}
            role="listbox"
            style={{
              top: menuPos.top,
              left: menuPos.left,
              width: Math.max(menuPos.width, 180),
            }}
          >
            {filtered.map((s, i) => (
              <button
                key={s}
                type="button"
                role="option"
                aria-selected={i === active}
                className={`ui-suggest-option ${i === active ? "active" : ""}`}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(s);
                }}
              >
                {highlightSuggest(s, value)}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}

function highlightSuggest(label: string, needle: string): ReactNode {
  const q = needle.trim();
  if (!q) return label;
  const i = label.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return label;
  return (
    <>
      {label.slice(0, i)}
      <mark>{label.slice(i, i + q.length)}</mark>
      {label.slice(i + q.length)}
    </>
  );
}

export function Modal({
  open,
  title,
  children,
  onClose,
  footer,
  className = "",
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  className?: string;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="ui-overlay"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`ui-modal ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="ui-modal-head">
          <h2 className="ui-modal-title">{title}</h2>
          <button
            type="button"
            className="ui-modal-close"
            aria-label="Close"
            onClick={onClose}
          >
            <X {...Ism} />
          </button>
        </div>
        <div className="ui-modal-body">{children}</div>
        {footer && <div className="ui-modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

type PromptOpts = {
  title: string;
  label?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
};

type ConfirmOpts = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

type UnsavedOpts = {
  title?: string;
  message: string;
};

export type UnsavedChoice = "save" | "discard" | "cancel";

type DialogApi = {
  prompt: (opts: PromptOpts) => Promise<string | null>;
  confirm: (opts: ConfirmOpts) => Promise<boolean>;
  unsaved: (opts: UnsavedOpts) => Promise<UnsavedChoice>;
};

const DialogContext = createContext<DialogApi | null>(null);

type DialogState =
  | {
      kind: "prompt";
      opts: PromptOpts;
      value: string;
      resolve: (v: string | null) => void;
    }
  | {
      kind: "confirm";
      opts: ConfirmOpts;
      resolve: (v: boolean) => void;
    }
  | {
      kind: "unsaved";
      opts: UnsavedOpts;
      resolve: (v: UnsavedChoice) => void;
    }
  | null;

export function DialogProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<DialogState>(null);

  const prompt = useCallback((opts: PromptOpts) => {
    return new Promise<string | null>((resolve) => {
      setDialog({
        kind: "prompt",
        opts,
        value: opts.defaultValue ?? "",
        resolve,
      });
    });
  }, []);

  const confirm = useCallback((opts: ConfirmOpts) => {
    return new Promise<boolean>((resolve) => {
      setDialog({ kind: "confirm", opts, resolve });
    });
  }, []);

  const unsaved = useCallback((opts: UnsavedOpts) => {
    return new Promise<UnsavedChoice>((resolve) => {
      setDialog({ kind: "unsaved", opts, resolve });
    });
  }, []);

  const api = useMemo(
    () => ({ prompt, confirm, unsaved }),
    [prompt, confirm, unsaved],
  );

  function closePrompt(result: string | null) {
    if (dialog?.kind !== "prompt") return;
    dialog.resolve(result);
    setDialog(null);
  }

  function closeConfirm(result: boolean) {
    if (dialog?.kind !== "confirm") return;
    dialog.resolve(result);
    setDialog(null);
  }

  function closeUnsaved(result: UnsavedChoice) {
    if (dialog?.kind !== "unsaved") return;
    dialog.resolve(result);
    setDialog(null);
  }

  return (
    <DialogContext.Provider value={api}>
      {children}
      {dialog?.kind === "prompt" && (
        <Modal
          open
          title={dialog.opts.title}
          onClose={() => closePrompt(null)}
          footer={
            <>
              <Button variant="ghost" onClick={() => closePrompt(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  const v = dialog.value.trim();
                  closePrompt(v ? v : null);
                }}
              >
                {dialog.opts.confirmLabel ?? "Create"}
              </Button>
            </>
          }
        >
          <TextField
            label={dialog.opts.label}
            value={dialog.value}
            placeholder={dialog.opts.placeholder}
            autoFocus
            onChange={(value) =>
              setDialog((d) => (d?.kind === "prompt" ? { ...d, value } : d))
            }
            onSubmit={() => {
              const v = dialog.value.trim();
              closePrompt(v ? v : null);
            }}
          />
        </Modal>
      )}
      {dialog?.kind === "confirm" && (
        <Modal
          open
          title={dialog.opts.title}
          onClose={() => closeConfirm(false)}
          footer={
            <>
              <Button variant="ghost" onClick={() => closeConfirm(false)}>
                {dialog.opts.cancelLabel ?? "Cancel"}
              </Button>
              <Button
                variant={dialog.opts.danger ? "danger" : "primary"}
                onClick={() => closeConfirm(true)}
                autoFocus
              >
                {dialog.opts.confirmLabel ?? "Confirm"}
              </Button>
            </>
          }
        >
          <p className="ui-modal-message">{dialog.opts.message}</p>
        </Modal>
      )}
      {dialog?.kind === "unsaved" && (
        <Modal
          open
          title={dialog.opts.title ?? "Unsaved changes"}
          onClose={() => closeUnsaved("cancel")}
          footer={
            <>
              <Button variant="ghost" onClick={() => closeUnsaved("discard")}>
                Don&apos;t save
              </Button>
              <Button variant="ghost" onClick={() => closeUnsaved("cancel")}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => closeUnsaved("save")}
                autoFocus
              >
                Save
              </Button>
            </>
          }
        >
          <p className="ui-modal-message">{dialog.opts.message}</p>
        </Modal>
      )}
    </DialogContext.Provider>
  );
}

export function useDialogs(): DialogApi {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error("useDialogs requires DialogProvider");
  return ctx;
}
