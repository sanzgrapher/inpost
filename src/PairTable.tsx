import { useEffect, useRef, useState } from "react";
import { MoreHorizontal, Plus, X } from "lucide-react";
import { VarField, type EnvVarHoverProps } from "./EnvVarHover";
import { Button, SuggestInput } from "./ui";

const Ism = { size: 12, strokeWidth: 1.75 } as const;

export type Pair = {
  key: string;
  value: string;
  enabled?: boolean;
  /** Multipart part kind — ignored for headers/query/path. */
  type?: "text" | "file";
  description?: string;
};

export function PairTable({
  pairs,
  onChange,
  keyLabel = "Key",
  filter = "",
  keySuggestions,
  lockKeys = false,
  readOnly = false,
  tools = false,
  envHover,
}: {
  pairs: Pair[];
  onChange: (next: Pair[]) => void;
  keyLabel?: string;
  /** Display filter only — edits still target full list indices. */
  filter?: string;
  keySuggestions?: string[];
  /** Path params: keys are derived from the URL, not editable. */
  lockKeys?: boolean;
  /** Snapshot / history: same chrome, nothing editable. */
  readOnly?: boolean;
  /** Params table actions: description column + bulk key:value editor. */
  tools?: boolean;
  /** Hover-edit `{{vars}}` in the Value column. */
  envHover?: EnvVarHoverProps;
}) {
  const frozen = lockKeys || readOnly;
  const [showDescription, setShowDescription] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkDraft, setBulkDraft] = useState("");
  const toolsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      if (toolsRef.current && !toolsRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  function update(i: number, patch: Partial<Pair>) {
    if (readOnly) return;
    const next = pairs.map((p, idx) => (idx === i ? { ...p, ...patch } : p));
    if (!lockKeys) {
      const last = next[next.length - 1];
      if (last && (last.key || last.value)) {
        next.push({ key: "", value: "", enabled: true });
      }
    }
    onChange(next);
  }

  function remove(i: number) {
    if (frozen) return;
    const next = pairs.filter((_, idx) => idx !== i);
    onChange(next.length ? next : [{ key: "", value: "", enabled: true }]);
  }

  const q = filter.trim().toLowerCase();
  const rowClass = `kv-row${showDescription ? " has-description" : ""}`;

  function openBulk() {
    setBulkDraft(
      pairs
        .filter((p) => p.key || p.value)
        .map((p) => `${p.key}:${p.value}`)
        .join("\n"),
    );
    setBulkOpen(true);
  }

  function applyBulk() {
    const next = bulkDraft
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .map((line): Pair => {
        const colon = line.indexOf(":");
        return {
          key: (colon < 0 ? line : line.slice(0, colon)).trim(),
          value: colon < 0 ? "" : line.slice(colon + 1).trim(),
          enabled: true,
        };
      });
    onChange([...next, { key: "", value: "", enabled: true }]);
    setBulkOpen(false);
  }

  return (
    <div className={`kv-table${tools && !readOnly ? " has-tools" : ""}`}>
      {tools && !readOnly && (
        <div className="kv-toolbar" ref={toolsRef}>
          <button
            type="button"
            className="kv-more"
            aria-label="Table options"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <MoreHorizontal {...Ism} />
          </button>
          {menuOpen && (
            <div className="kv-tools-menu">
              <label>
                <input
                  type="checkbox"
                  checked={showDescription}
                  onChange={(e) => setShowDescription(e.target.checked)}
                />
                Description
              </label>
            </div>
          )}
          {!lockKeys && (
            <button type="button" className="kv-bulk-btn" onClick={openBulk}>
              Bulk edit
            </button>
          )}
        </div>
      )}
      <div className={`kv-head${showDescription ? " has-description" : ""}`}>
        <span />
        <span>{keyLabel}</span>
        <span>Value</span>
        {showDescription && <span>Description</span>}
        <span />
      </div>
      {bulkOpen && !readOnly && (
        <div className="kv-bulk">
          <div className="kv-bulk-head">
            <span>Bulk edit as key:value pairs</span>
            <button
              type="button"
              className="icon-btn"
              aria-label="Close bulk edit"
              onClick={() => setBulkOpen(false)}
            >
              <X {...Ism} />
            </button>
          </div>
          <textarea
            value={bulkDraft}
            autoFocus
            placeholder={"page:1\nlimit:20"}
            onChange={(e) => setBulkDraft(e.target.value)}
          />
          <div className="kv-bulk-actions">
            <Button size="sm" onClick={() => setBulkOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" onClick={applyBulk}>
              Apply
            </Button>
          </div>
        </div>
      )}
      {pairs.map((p, i) => {
        const isLast = i === pairs.length - 1 && !p.key && !p.value;
        if (
          q &&
          !isLast &&
          !p.key.toLowerCase().includes(q) &&
          !p.value.toLowerCase().includes(q)
        ) {
          return null;
        }
        // Hide trailing empty row only for locked path tables in snapshots.
        if (readOnly && isLast && lockKeys) return null;
        return (
          <div className={rowClass} key={lockKeys || readOnly ? `${p.key}-${i}` : i}>
            <input
              type="checkbox"
              checked={p.enabled !== false}
              onChange={(e) => update(i, { enabled: e.target.checked })}
              aria-label="Enable row"
              disabled={frozen}
            />
            {keySuggestions?.length && !frozen ? (
              <SuggestInput
                placeholder={keyLabel}
                value={p.key}
                suggestions={keySuggestions}
                onChange={(key) => update(i, { key })}
              />
            ) : (
              <input
                placeholder={keyLabel}
                value={p.key}
                readOnly={frozen}
                onChange={(e) => update(i, { key: e.target.value })}
              />
            )}
            {envHover && !readOnly ? (
              <VarField
                value={p.value}
                placeholder="Value"
                env={envHover.env}
                envPairs={envHover.envPairs}
                globalPairs={envHover.globalPairs}
                onSaveVar={envHover.onSaveVar}
                onOpenEnv={envHover.onOpenEnv}
                onChange={(value) => update(i, { value })}
              />
            ) : (
              <input
                placeholder="Value"
                value={p.value}
                readOnly={readOnly}
                onChange={(e) => update(i, { value: e.target.value })}
              />
            )}
            {showDescription && (
              <input
                placeholder="Description"
                value={p.description ?? ""}
                readOnly={readOnly}
                onChange={(e) => update(i, { description: e.target.value })}
              />
            )}
            {!frozen ? (
              <button
                type="button"
                className="icon-btn"
                onClick={() => remove(i)}
                aria-label="Remove"
              >
                <X {...Ism} />
              </button>
            ) : (
              <span />
            )}
          </div>
        );
      })}
      {frozen ? (
        lockKeys &&
        pairs.filter((p) => p.key || p.value).length === 0 && (
          <div className="kv-empty muted">No path variables in URL</div>
        )
      ) : (
        <button
          type="button"
          className="link-btn"
          onClick={() =>
            onChange([...pairs, { key: "", value: "", enabled: true }])
          }
        >
          <Plus {...Ism} /> Add more
        </button>
      )}
    </div>
  );
}
