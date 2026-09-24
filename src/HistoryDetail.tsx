import { ArrowUpRight, Copy } from "lucide-react";
import { useMemo, useState } from "react";
import { CodeEditor } from "./CodeEditor";
import { DocArticle } from "./Docs";
import { substituteInPairsJson, substituteVars } from "./envVar";
import { methodClass } from "./methodStyle";
import { PairTable, type Pair } from "./PairTable";
import { RequestChrome } from "./RequestChrome";
import {
  AUTH_TYPE_OPTIONS,
  BODY_TYPE_OPTIONS,
  parseAuthJson,
  parseHistoryHeaders,
  type AuthType,
  type BodyType,
} from "./reqMeta";
import { Button, Select } from "./ui";

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

type EnvInfo = { id: string; name: string };

type Props = {
  entry: HistoryEntryView;
  requestName?: string | null;
  requestDescription?: string | null;
  crumbPath?: string[];
  onOpenRequest?: () => void;
  activeVars?: Record<string, string>;
  globalVars?: Record<string, string>;
  env?: EnvInfo | null;
  envPairs?: Pair[];
  globalPairs?: Pair[];
};

type ReqTab = "overview" | "params" | "headers" | "body" | "auth";
type ResTab = "body" | "headers";

const noop = () => {};
const noopAsync = async () => {};
const Ism = { size: 12, strokeWidth: 1.75 } as const;

function parseSnapshot(raw: string | null | undefined): HistoryRequestSnapshot | null {
  if (!raw?.trim()) return null;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? (v as HistoryRequestSnapshot) : null;
  } catch {
    return null;
  }
}

function toPairs(raw: unknown): Pair[] {
  if (!Array.isArray(raw)) return [{ key: "", value: "", enabled: true }];
  const out: Pair[] = [];
  for (const row of raw) {
    if (Array.isArray(row) && row.length >= 2) {
      out.push({
        key: String(row[0] ?? ""),
        value: String(row[1] ?? ""),
        enabled: true,
        type: row[2] === "file" ? "file" : "text",
      });
    } else if (row && typeof row === "object") {
      const o = row as {
        key?: string;
        value?: string;
        enabled?: boolean;
        type?: string;
      };
      out.push({
        key: String(o.key ?? ""),
        value: String(o.value ?? ""),
        enabled: o.enabled !== false,
        type: o.type === "file" ? "file" : "text",
      });
    }
  }
  return out.length ? out : [{ key: "", value: "", enabled: true }];
}

function queryFromUrl(url: string): Pair[] {
  const i = url.indexOf("?");
  if (i < 0) return [{ key: "", value: "", enabled: true }];
  const query = url
    .slice(i + 1)
    .split("&")
    .filter(Boolean)
    .map((part): Pair => {
      const eq = part.indexOf("=");
      if (eq < 0) {
        try {
          return { key: decodeURIComponent(part), value: "", enabled: true };
        } catch {
          return { key: part, value: "", enabled: true };
        }
      }
      try {
        return {
          key: decodeURIComponent(part.slice(0, eq)),
          value: decodeURIComponent(part.slice(eq + 1)),
          enabled: true,
        };
      } catch {
        return {
          key: part.slice(0, eq),
          value: part.slice(eq + 1),
          enabled: true,
        };
      }
    });
  return query.length ? query : [{ key: "", value: "", enabled: true }];
}

function pairsFromHeaders(headers: [string, string][]): Pair[] {
  if (!headers.length) return [{ key: "", value: "", enabled: true }];
  return headers.map(([key, value]) => ({ key, value, enabled: true }));
}

function filledCount(pairs: Pair[]) {
  return pairs.filter((p) => p.key || p.value).length;
}

function formatBytes(n: number | null | undefined) {
  if (n == null) return null;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function asBodyType(s: string | undefined): BodyType {
  if (
    s === "none" ||
    s === "json" ||
    s === "text" ||
    s === "urlencoded" ||
    s === "multipart"
  ) {
    return s;
  }
  return "none";
}

function asAuthType(s: string | undefined): AuthType {
  if (s === "bearer" || s === "basic" || s === "apikey" || s === "none") {
    return s;
  }
  return "none";
}

function FrozenInput({
  value,
  placeholder,
  type = "text",
}: {
  value: string;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      className="ui-input"
      value={value}
      placeholder={placeholder}
      type={type}
      readOnly
      disabled
    />
  );
}

export function HistoryDetail({
  entry,
  requestName,
  requestDescription,
  crumbPath = [],
  onOpenRequest,
  activeVars = {},
  globalVars = {},
  env = null,
  envPairs = [],
  globalPairs = [],
}: Props) {
  const snap = useMemo(() => parseSnapshot(entry.requestJson), [entry.requestJson]);
  const [reqTab, setReqTab] = useState<ReqTab>("params");
  const [resTab, setResTab] = useState<ResTab>("body");
  const [copiedId, setCopiedId] = useState(false);
  const [bodyView, setBodyView] = useState<"pretty" | "raw">(
    entry.bodyPretty ? "pretty" : "raw",
  );
  const resHeaders = useMemo(
    () => pairsFromHeaders(parseHistoryHeaders(entry.headersJson)),
    [entry.headersJson],
  );
  const reqHeaders = useMemo(
    () => toPairs(substituteInPairsJson(snap?.headers, activeVars, globalVars)),
    [snap, activeVars, globalVars],
  );
  const pathPairs = useMemo(
    () => toPairs(substituteInPairsJson(snap?.pathVars, activeVars, globalVars)),
    [snap, activeVars, globalVars],
  );
  const bodyPairs = useMemo(
    () => toPairs(substituteInPairsJson(snap?.bodyPairs, activeVars, globalVars)),
    [snap, activeVars, globalVars],
  );
  const resolved = useMemo(() => {
    const raw = snap?.resolvedUrl?.trim() || entry.url;
    return substituteVars(raw, activeVars, globalVars);
  }, [snap?.resolvedUrl, entry.url, activeVars, globalVars]);
  const urlTemplate = snap?.urlTemplate?.trim() || entry.url || "";
  const queryPairs = useMemo(() => queryFromUrl(resolved), [resolved]);
  const bodyText = useMemo(
    () => substituteVars(snap?.body ?? "", activeVars, globalVars),
    [snap?.body, activeVars, globalVars],
  );
  const auth = useMemo(
    () =>
      parseAuthJson(
        substituteVars(snap?.authJson ?? "{}", activeVars, globalVars),
      ),
    [snap?.authJson, activeVars, globalVars],
  );
  const bodyType = asBodyType(snap?.bodyType);
  const authType = asAuthType(snap?.authType);
  const title = requestName?.trim() || "History";
  const description = requestDescription ?? "";
  const size = formatBytes(entry.sizeBytes);
  const headerCount = filledCount(reqHeaders);
  const bodyHasContent =
    bodyType === "urlencoded" || bodyType === "multipart"
      ? filledCount(bodyPairs) > 0
      : bodyType !== "none" && Boolean(bodyText.trim());

  async function copyId() {
    await navigator.clipboard.writeText(entry.id);
    setCopiedId(true);
    window.setTimeout(() => setCopiedId(false), 1500);
  }

  return (
    <div className="history-detail">
      <RequestChrome
        crumbPath={crumbPath}
        title={title}
        resolvedUrl={resolved}
        method={entry.method}
        methodDisabled
        url={urlTemplate}
        urlReadOnly
        urlHistoryKey={entry.id}
        env={env}
        envPairs={envPairs}
        globalPairs={globalPairs}
        onSaveVar={noopAsync}
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => void copyId()}
              data-tip="Use with MCP get_history"
            >
              {copiedId ? "Copied" : "Copy ID"}
              {!copiedId && <Copy {...Ism} />}
            </Button>
            {onOpenRequest && entry.requestId ? (
              <Button
                variant="primary"
                className="send"
                onClick={onOpenRequest}
                data-tip="Open request"
              >
                Open request
                <ArrowUpRight {...Ism} />
              </Button>
            ) : null}
          </>
        }
      />

      {!snap && (
        <p className="history-detail-hint banner">
          Request details weren’t saved for this run. New sends record a full
          snapshot.
        </p>
      )}

      <div
        className="editor-split dock-right"
        style={{
          gridTemplateColumns: "minmax(140px, 1fr) minmax(140px, 1fr)",
          gridTemplateRows: "1fr",
        }}
      >
        <div className="request-pane">
          <div className="section-tabs">
            {(
              [
                ["overview", "Overview"],
                ["params", "Params"],
                [
                  "headers",
                  `Headers${headerCount ? ` (${headerCount})` : ""}`,
                ],
                ["body", "Body"],
                ["auth", "Auth"],
              ] as [ReqTab, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={reqTab === id ? "active" : ""}
                onClick={() => setReqTab(id)}
              >
                {label}
                {id === "overview" && description.trim() ? (
                  <span className="dot" />
                ) : null}
                {id === "body" && bodyHasContent ? (
                  <span className="dot" />
                ) : null}
                {id === "auth" && authType !== "none" ? (
                  <span className="dot" />
                ) : null}
              </button>
            ))}
          </div>

          <div className="section-body">
            {reqTab === "overview" && (
              <DocArticle
                title={title}
                meta={
                  <div className="doc-url">
                    <span className={methodClass(entry.method)}>
                      {entry.method}
                    </span>
                    <span className="doc-url-text">
                      {resolved || urlTemplate}
                    </span>
                  </div>
                }
                value={description}
                onChange={noop}
                placeholder="Document this request — Markdown supported."
                emptyHint="No description for this request"
                readOnly
              />
            )}
            {reqTab === "params" && (
              <div className="params-stack">
                <div className="params-block">
                  <PairTable
                    pairs={queryPairs}
                    onChange={noop}
                    keyLabel="Param"
                    readOnly
                  />
                </div>
                {filledCount(pathPairs) > 0 && (
                  <div className="params-block">
                    <div className="params-label">Path variables</div>
                    <PairTable
                      pairs={pathPairs}
                      onChange={noop}
                      keyLabel="Variable"
                      lockKeys
                      readOnly
                    />
                  </div>
                )}
              </div>
            )}
            {reqTab === "headers" && (
              <PairTable
                pairs={reqHeaders}
                onChange={noop}
                keyLabel="Header"
                readOnly
              />
            )}
            {reqTab === "body" && (
              <div className="body-pane">
                <div
                  className="body-type-bar"
                  role="radiogroup"
                  aria-label="Body type"
                >
                  {BODY_TYPE_OPTIONS.map((opt) => (
                    <label key={opt.id} className="body-type-opt">
                      <input
                        type="radio"
                        name="history-body-type"
                        checked={bodyType === opt.id}
                        disabled
                        onChange={noop}
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
                {bodyType === "none" && (
                  <div className="body-empty muted">
                    This request does not have a body
                  </div>
                )}
                {(bodyType === "json" || bodyType === "text") && (
                  <div className="editor-fill">
                    <CodeEditor
                      value={bodyText}
                      language={bodyType === "json" ? "json" : "text"}
                      readOnly
                    />
                  </div>
                )}
                {(bodyType === "urlencoded" || bodyType === "multipart") && (
                  <PairTable
                    pairs={bodyPairs}
                    onChange={noop}
                    keyLabel="Key"
                    readOnly
                  />
                )}
              </div>
            )}
            {reqTab === "auth" && (
              <div className="auth-pane">
                <div className="auth-row">
                  <label className="auth-label">Authorization type</label>
                  <Select
                    className="auth-type-select"
                    value={authType}
                    options={AUTH_TYPE_OPTIONS.map((o) => ({
                      id: o.id,
                      label: o.label,
                    }))}
                    onChange={noop}
                    disabled
                  />
                </div>
                {authType === "none" && (
                  <div className="auth-empty">
                    <p>No authorization type selected for this request</p>
                    <p className="muted">
                      Select an authorization type above
                    </p>
                  </div>
                )}
                {authType === "bearer" && (
                  <div className="auth-fields">
                    <label>
                      Token
                      <FrozenInput
                        value={auth.token ?? ""}
                        placeholder="{{token}}"
                      />
                    </label>
                  </div>
                )}
                {authType === "basic" && (
                  <div className="auth-fields">
                    <label>
                      Username
                      <FrozenInput value={auth.username ?? ""} />
                    </label>
                    <label>
                      Password
                      <FrozenInput
                        value={auth.password ?? ""}
                        type="password"
                      />
                    </label>
                  </div>
                )}
                {authType === "apikey" && (
                  <div className="auth-fields">
                    <label>
                      Key
                      <FrozenInput
                        value={auth.key ?? ""}
                        placeholder="X-Api-Key"
                      />
                    </label>
                    <label>
                      Value
                      <FrozenInput
                        value={auth.value ?? ""}
                        placeholder="{{apiKey}}"
                      />
                    </label>
                    <label>
                      Add to
                      <select
                        className="ui-input"
                        value={auth.in ?? "header"}
                        disabled
                      >
                        <option value="header">Header</option>
                        <option value="query">Query param</option>
                      </select>
                    </label>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="response-pane">
          {entry.error ? (
            <>
              <div className="response-top">
                <div className="section-tabs">
                  <button type="button" className="active">
                    Body
                  </button>
                </div>
                <div className="response-actions">
                  <div className="meta">
                    <span className="status bad">Error</span>
                  </div>
                </div>
              </div>
              <div className="error-panel history-detail-error">
                <h3>Request error — no response received</h3>
                <pre>{entry.error}</pre>
              </div>
            </>
          ) : (
            <>
              <div className="response-top">
                <div className="section-tabs">
                  <button
                    type="button"
                    className={resTab === "body" ? "active" : ""}
                    onClick={() => setResTab("body")}
                  >
                    Body
                  </button>
                  <button
                    type="button"
                    className={resTab === "headers" ? "active" : ""}
                    onClick={() => setResTab("headers")}
                  >
                    Headers
                    {filledCount(resHeaders)
                      ? ` (${filledCount(resHeaders)})`
                      : ""}
                  </button>
                </div>
                <div className="response-actions">
                  <div className="meta">
                    <span
                      className={`status ${(entry.status ?? 0) < 400 ? "ok" : "bad"}`}
                    >
                      {entry.status} {entry.statusText}
                    </span>
                    {entry.elapsedMs != null && (
                      <span>{entry.elapsedMs} ms</span>
                    )}
                    {size && <span>{size}</span>}
                  </div>
                </div>
              </div>
              {resTab === "headers" && (
                <PairTable
                  pairs={resHeaders}
                  onChange={noop}
                  keyLabel="Header"
                  readOnly
                />
              )}
              {resTab === "body" && (
                <>
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
                  <div className="editor-fill">
                    <CodeEditor
                      value={
                        bodyView === "pretty" && entry.bodyPretty
                          ? entry.bodyPretty
                          : entry.body ?? ""
                      }
                      language={
                        bodyView === "pretty" && entry.bodyPretty
                          ? "json"
                          : "text"
                      }
                      readOnly
                    />
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
