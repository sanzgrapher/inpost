// Postman-style documentation: rendered Markdown article + toolbar editor.
// Markdown is the storage format so descriptions stay valid OpenAPI CommonMark.
import { useRef, useState, type ReactNode } from "react";
import MarkdownIt from "markdown-it";
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Pencil,
  SquareCode,
  Strikethrough,
  TextQuote,
} from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { applyMdAction, type MdAction } from "./mdEdit";

// html:false — user/agent markdown never injects raw HTML into the webview.
const md = new MarkdownIt({ html: false, linkify: true });

const I = { size: 14, strokeWidth: 1.8 };

export function Markdown({ source }: { source: string }) {
  return (
    <div
      className="md-body"
      onClick={(e) => {
        const a = (e.target as HTMLElement).closest("a");
        if (!a?.href) return;
        e.preventDefault();
        if (/^https?:/i.test(a.href)) void openUrl(a.href);
      }}
      // Safe: markdown-it with html:false escapes all raw HTML.
      dangerouslySetInnerHTML={{ __html: md.render(source) }}
    />
  );
}

const TOOLBAR: { action: MdAction; tip: string; icon: ReactNode }[] = [
  { action: "h1", tip: "Heading 1", icon: <Heading1 {...I} /> },
  { action: "h2", tip: "Heading 2", icon: <Heading2 {...I} /> },
  { action: "h3", tip: "Heading 3", icon: <Heading3 {...I} /> },
  { action: "bold", tip: "Bold", icon: <Bold {...I} /> },
  { action: "italic", tip: "Italic", icon: <Italic {...I} /> },
  { action: "strike", tip: "Strikethrough", icon: <Strikethrough {...I} /> },
  { action: "ul", tip: "Bullet list", icon: <List {...I} /> },
  { action: "ol", tip: "Numbered list", icon: <ListOrdered {...I} /> },
  { action: "quote", tip: "Quote", icon: <TextQuote {...I} /> },
  { action: "code", tip: "Inline code", icon: <Code {...I} /> },
  { action: "codeblock", tip: "Code block", icon: <SquareCode {...I} /> },
  { action: "link", tip: "Link", icon: <LinkIcon {...I} /> },
];

export function MarkdownEditor({
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [mode, setMode] = useState<"write" | "preview">("write");
  const taRef = useRef<HTMLTextAreaElement>(null);

  function run(action: MdAction) {
    const ta = taRef.current;
    if (!ta) return;
    const r = applyMdAction(ta.value, ta.selectionStart, ta.selectionEnd, action);
    onChange(r.text);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(r.selStart, r.selEnd);
    });
  }

  return (
    <div className="md-editor">
      <div className="md-editor-bar">
        <div className="md-editor-modes" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "write"}
            className={mode === "write" ? "active" : ""}
            onClick={() => setMode("write")}
          >
            Write
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "preview"}
            className={mode === "preview" ? "active" : ""}
            onClick={() => setMode("preview")}
          >
            Preview
          </button>
        </div>
        {mode === "write" && (
          <div className="md-editor-tools">
            {TOOLBAR.map(({ action, tip, icon }) => (
              <button
                key={action}
                type="button"
                data-tip={tip}
                aria-label={tip}
                onMouseDown={(e) => e.preventDefault() /* keep selection */}
                onClick={() => run(action)}
              >
                {icon}
              </button>
            ))}
          </div>
        )}
      </div>
      {mode === "write" ? (
        <textarea
          ref={taRef}
          className="md-editor-text"
          value={value}
          autoFocus={autoFocus}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          onKeyDown={(e) => {
            const mod = e.ctrlKey || e.metaKey;
            if (!mod) return;
            const k = e.key.toLowerCase();
            if (k === "b") {
              e.preventDefault();
              run("bold");
            } else if (k === "i") {
              e.preventDefault();
              run("italic");
            } else if (k === "k") {
              e.preventDefault();
              run("link");
            }
          }}
        />
      ) : (
        <div className="md-editor-preview">
          {value.trim() ? (
            <Markdown source={value} />
          ) : (
            <p className="muted">Nothing to preview</p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Centered documentation article with view/edit toggle.
 * `meta` renders under the title (e.g. method + URL chip).
 * `actions` renders next to the Edit/Done toggle (e.g. Save button).
 */
export function DocArticle({
  title,
  meta,
  value,
  onChange,
  placeholder,
  emptyHint,
  actions,
  readOnly = false,
}: {
  title: string;
  meta?: ReactNode;
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  emptyHint: string;
  actions?: ReactNode;
  /** History snapshot: view only, no Edit. */
  readOnly?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="doc-scroll">
      <div className="doc-article">
        <div className="doc-head">
          <h1 className="doc-title">{title || "Untitled"}</h1>
          <div className="doc-actions">
            {actions}
            {!readOnly && (
              <button
                type="button"
                className="doc-edit-btn"
                onClick={() => setEditing((v) => !v)}
              >
                {editing ? (
                  "Done"
                ) : (
                  <>
                    <Pencil {...I} /> Edit
                  </>
                )}
              </button>
            )}
          </div>
        </div>
        {meta}
        <div className="doc-section-label">Description</div>
        {!readOnly && editing ? (
          <MarkdownEditor
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            autoFocus
          />
        ) : value.trim() ? (
          <Markdown source={value} />
        ) : readOnly ? (
          <div className="doc-empty" style={{ cursor: "default" }}>
            {emptyHint}
          </div>
        ) : (
          <button
            type="button"
            className="doc-empty"
            onClick={() => setEditing(true)}
          >
            <Pencil {...I} /> {emptyHint}
          </button>
        )}
      </div>
    </div>
  );
}
