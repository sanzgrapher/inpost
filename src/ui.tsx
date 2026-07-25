import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
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
}: {
  value: string;
  options: { id: string; label: string }[];
  onChange: (id: string) => void;
  placeholder?: string;
  className?: string;
  tip?: string;
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
    <div className={`ui-select ${className}`.trim()} ref={rootRef} data-tip={tip}>
      <button
        type="button"
        className={`ui-select-trigger ${open ? "open" : ""}`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="ui-select-value">
          {current?.label ?? placeholder}
        </span>
        <span className="ui-select-chevron">
          <ChevronDown {...Ism} />
        </span>
      </button>
      {open && (
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

export function Modal({
  open,
  title,
  children,
  onClose,
  footer,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
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
        className="ui-modal"
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

type DialogApi = {
  prompt: (opts: PromptOpts) => Promise<string | null>;
  confirm: (opts: ConfirmOpts) => Promise<boolean>;
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

  const api = useMemo(() => ({ prompt, confirm }), [prompt, confirm]);

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
    </DialogContext.Provider>
  );
}

export function useDialogs(): DialogApi {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error("useDialogs requires DialogProvider");
  return ctx;
}
