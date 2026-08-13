import { useMemo, useState } from "react";
import { CodeEditor } from "./CodeEditor";
import { methodClass, methodLabel } from "./methodStyle";
import {
  AUTH_TYPE_OPTIONS,
  parseAuthJson,
  parseHistoryHeaders,
  type AuthType,
} from "./reqMeta";

export type HistoryEntryView = {
  id: string;
  requestId?: string | null;
  method: string;
  url: string;
  status?: number | null;
  statusText?: string | null;
  elapsedMs?: number | null;
  sizeBytes?: number | null;
  error?: string | null;
  body?: string | null;
  bodyPretty?: string | null;
  headersJson?: string | null;
  requestJson?: string | null;
  createdAt: number;
};

export type HistoryRequestSnapshot = {
  urlTemplate?: string;
  resolvedUrl?: string;
  headers?: unknown;
  body?: string | null;
  bodyType?: string;
  bodyPairs?: unknown;
  authType?: string;
  authJson?: string;
  pathVars?: unknown;
};

type Props = {
  entry: HistoryEntryView;
  requestName?: string | null;
  onOpenRequest?: () => void;
};

function parseSnapshot(raw: string | null | undefined): HistoryRequestSnapshot | null {
  if (!raw?.trim()) return null;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? (v as HistoryRequestSnapshot) : null;
  } catch {
    return null;
  }
}

/** Pair[] or [string, string][] → display rows. */
function kvRows(raw: unknown): [string, string][] {
  if (!Array.isArray(raw)) return [];
  const out: [string, string][] = [];
  for (const row of raw) {
    if (Array.isArray(row) && row.length >= 2) {
      out.push([String(row[0] ?? ""), String(row[1] ?? "")]);
    } else if (row && typeof row === "object") {
      const o = row as { key?: string; value?: string; enabled?: boolean };
      if (o.enabled === false) continue;
      const k = String(o.key ?? "");
      const v = String(o.value ?? "");
      if (!k && !v) continue;
      out.push([k, v]);
    }
  }
  return out;
}

function formatBytes(n: number | null | undefined) {
  if (n == null) return null;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function authLabel(t: string | undefined) {
  const id = (t ?? "none") as AuthType;
  return AUTH_TYPE_OPTIONS.find((o) => o.id === id)?.label ?? t ?? "No auth";
}

function KvTable({ rows, empty }: { rows: [string, string][]; empty: string }) {
  if (!rows.length) return <div className="history-detail-empty">{empty}</div>;
  return (
    <div className="kv-table read-only">
      {rows.map(([k, v], i) => (
        <div className="kv-row" key={`${k}-${i}`}>
          <span />
          <code>{k}</code>
          <code>{v}</code>
          <span />
        </div>
      ))}
    </div>
  );
}

export function HistoryDetail({ entry, requestName, onOpenRequest }: Props) {
  const snap = useMemo(() => parseSnapshot(entry.requestJson), [entry.requestJson]);
  const [bodyView, setBodyView] = useState<"pretty" | "raw">(
    entry.bodyPretty ? "pretty" : "raw",
  );
  const resHeaders = useMemo(
    () => parseHistoryHeaders(entry.headersJson),
    [entry.headersJson],
  );
  const reqHeaders = useMemo(() => kvRows(snap?.headers), [snap]);
  const pathVars = useMemo(() => kvRows(snap?.pathVars), [snap]);
  const bodyPairs = useMemo(() => kvRows(snap?.bodyPairs), [snap]);
  const auth = useMemo(
    () => parseAuthJson(snap?.authJson ?? "{}"),
    [snap?.authJson],
  );
  const resolved =
    snap?.resolvedUrl?.trim() || entry.url;
  const template = snap?.urlTemplate?.trim();
  const showTemplate = template && template !== resolved;
  const bodyType = snap?.bodyType ?? "none";
  const pairBody = bodyType === "urlencoded" || bodyType === "multipart";
  const when = new Date(entry.createdAt).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <div className="history-detail">
      <header className="history-detail-head">
        <div className="history-detail-title-row">
          <span className={methodClass(entry.method)}>
            {methodLabel(entry.method)}
          </span>
          <h2 className="history-detail-title truncate">
            {requestName?.trim() || resolved || "History"}
          </h2>
          {entry.error ? (
            <span className="status bad">Error</span>
          ) : (
            <span
              className={`status ${(entry.status ?? 0) < 400 ? "ok" : "bad"}`}
            >
              {entry.status} {entry.statusText}
            </span>
          )}
        </div>
        <div className="history-detail-meta">
          <span>{when}</span>
          {entry.elapsedMs != null && <span>{entry.elapsedMs} ms</span>}
          {formatBytes(entry.sizeBytes) && (
            <span>{formatBytes(entry.sizeBytes)}</span>
          )}
          {onOpenRequest && entry.requestId && (
            <button
              type="button"
              className="ui-btn ui-btn-ghost ui-btn-sm"
              onClick={onOpenRequest}
            >
              Open request
            </button>
          )}
        </div>
      </header>

      <div className="history-detail-grid">
        <section className="history-detail-pane">
          <h3>Request</h3>
          {!snap && (
            <p className="history-detail-hint">
              Request details weren’t saved for this run. New sends record a full
              snapshot.
            </p>
          )}
          <label className="history-detail-label">URL</label>
          <code className="history-detail-url">{resolved || "—"}</code>
          {showTemplate && (
            <>
              <label className="history-detail-label">Template</label>
              <code className="history-detail-url muted">{template}</code>
            </>
          )}

          <label className="history-detail-label">Path params</label>
          <KvTable rows={pathVars} empty={snap ? "None" : "—"} />

          <label className="history-detail-label">Headers</label>
          <KvTable rows={reqHeaders} empty={snap ? "None" : "—"} />

          <label className="history-detail-label">Auth</label>
          {!snap ? (
            <div className="history-detail-empty">—</div>
          ) : (snap.authType ?? "none") === "none" ? (
            <div className="history-detail-empty">{authLabel("none")}</div>
          ) : (
            <div className="kv-table read-only">
              <div className="kv-row">
                <span />
                <code>Type</code>
                <code>{authLabel(snap.authType)}</code>
                <span />
              </div>
              {auth.token != null && auth.token !== "" && (
                <div className="kv-row">
                  <span />
                  <code>Token</code>
                  <code>{auth.token}</code>
                  <span />
                </div>
              )}
              {auth.username != null && auth.username !== "" && (
                <div className="kv-row">
                  <span />
                  <code>Username</code>
                  <code>{auth.username}</code>
                  <span />
                </div>
              )}
              {auth.password != null && auth.password !== "" && (
                <div className="kv-row">
                  <span />
                  <code>Password</code>
                  <code>{auth.password}</code>
                  <span />
                </div>
              )}
              {auth.key != null && auth.key !== "" && (
                <div className="kv-row">
                  <span />
                  <code>Key</code>
                  <code>{auth.key}</code>
                  <span />
                </div>
              )}
              {auth.value != null && auth.value !== "" && (
                <div className="kv-row">
                  <span />
                  <code>Value</code>
                  <code>{auth.value}</code>
                  <span />
                </div>
              )}
              {auth.in != null && auth.in !== "" && (
                <div className="kv-row">
                  <span />
                  <code>Add to</code>
                  <code>{auth.in}</code>
                  <span />
                </div>
              )}
            </div>
          )}

          <label className="history-detail-label">
            Body{snap ? ` · ${bodyType}` : ""}
          </label>
          {!snap ? (
            <div className="history-detail-empty">—</div>
          ) : bodyType === "none" ? (
            <div className="history-detail-empty">None</div>
          ) : pairBody ? (
            <KvTable rows={bodyPairs} empty="Empty" />
          ) : (
            <div className="history-detail-editor">
              <CodeEditor
                value={snap.body ?? ""}
                language={bodyType === "json" ? "json" : "text"}
                readOnly
              />
            </div>
          )}
        </section>

        <section className="history-detail-pane">
          <h3>Response</h3>
          {entry.error ? (
            <div className="error-panel history-detail-error">
              <h3>Request error — no response received</h3>
              <pre>{entry.error}</pre>
            </div>
          ) : (
            <>
              <label className="history-detail-label">Headers</label>
              <KvTable rows={resHeaders} empty="None" />
              <label className="history-detail-label">Body</label>
              <div className="body-toolbar">
                <button
                  type="button"
                  className={bodyView === "pretty" ? "active" : ""}
                  onClick={() => setBodyView("pretty")}
                  disabled={!entry.bodyPretty}
                >
                  JSON
                </button>
                <button
                  type="button"
                  className={bodyView === "raw" ? "active" : ""}
                  onClick={() => setBodyView("raw")}
                >
                  Raw
                </button>
              </div>
              <div className="history-detail-editor">
                <CodeEditor
                  value={
                    bodyView === "pretty" && entry.bodyPretty
                      ? entry.bodyPretty
                      : entry.body ?? ""
                  }
                  language={
                    bodyView === "pretty" && entry.bodyPretty ? "json" : "text"
                  }
                  readOnly
                />
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
