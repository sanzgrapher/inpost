import type { ReactNode, RefObject } from "react";
import { Select } from "./ui";
import { UrlField } from "./UrlField";

type EnvInfo = { id: string; name: string };
type Pair = { key: string; value: string; enabled?: boolean };

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

export function methodSelectOptions(method: string) {
  const base =
    method.toUpperCase() === "WS" ? ["WS", ...METHODS] : [...METHODS];
  if (!base.includes(method)) base.unshift(method);
  return base.map((m) => ({ id: m, label: m }));
}

/**
 * Shared request head: breadcrumb + method/URL bar.
 * Playground and history both mount this so chrome can't drift.
 */
export function RequestChrome({
  crumbPath = [],
  title,
  titleSlot,
  resolvedUrl,
  method,
  onMethodChange,
  methodDisabled = false,
  url,
  onUrlChange,
  urlReadOnly = false,
  urlHistoryKey = "",
  urlInputRef,
  env = null,
  envPairs = [],
  globalPairs = [],
  onSaveVar,
  onOpenEnv,
  actions,
}: {
  crumbPath?: string[];
  /** Static title when titleSlot is not provided. */
  title?: string;
  /** Editable rename control (playground). */
  titleSlot?: ReactNode;
  resolvedUrl?: string;
  method: string;
  onMethodChange?: (method: string) => void;
  methodDisabled?: boolean;
  url: string;
  onUrlChange?: (url: string) => void;
  urlReadOnly?: boolean;
  urlHistoryKey?: string;
  urlInputRef?: RefObject<HTMLInputElement | null>;
  env?: EnvInfo | null;
  envPairs?: Pair[];
  globalPairs?: Pair[];
  onSaveVar: (name: string, value: string) => void | Promise<void>;
  onOpenEnv?: (envId: string) => void;
  actions?: ReactNode;
}) {
  const showCrumb = crumbPath.length > 0 || Boolean(titleSlot || title);

  return (
    <>
      {showCrumb && (
        <div className="req-crumb">
          {crumbPath.map((part, i) => (
            <span key={`${i}-${part}`} className="req-crumb-seg">
              {i > 0 && (
                <span className="req-crumb-sep" aria-hidden>
                  ›
                </span>
              )}
              <span className="req-crumb-part">{part}</span>
            </span>
          ))}
          {crumbPath.length > 0 && (
            <span className="req-crumb-sep" aria-hidden>
              ›
            </span>
          )}
          {titleSlot ?? (
            <span className="req-crumb-title history-crumb-title">
              <span>{title || "Untitled"}</span>
            </span>
          )}
          {resolvedUrl?.trim() ? (
            <span
              className="req-crumb-url"
              title={resolvedUrl}
              data-tip={resolvedUrl}
            >
              {resolvedUrl}
            </span>
          ) : null}
        </div>
      )}
      <div className="url-bar">
        <Select
          className="method-picker"
          value={method}
          options={methodSelectOptions(method)}
          onChange={(m) => onMethodChange?.(m)}
          disabled={methodDisabled}
          tip="Method"
        />
        <UrlField
          inputRef={urlInputRef}
          className="url-input"
          value={url}
          onChange={(v) => onUrlChange?.(v)}
          historyKey={urlHistoryKey}
          placeholder="{{baseUrl}}/path"
          readOnly={urlReadOnly}
          env={env}
          envPairs={envPairs}
          globalPairs={globalPairs}
          onSaveVar={onSaveVar}
          onOpenEnv={onOpenEnv}
        />
        {actions}
      </div>
    </>
  );
}
