import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ListFilter } from "lucide-react";
import { CodeEditor } from "./CodeEditor";
import {
  defaultBodyView,
  htmlWithBase,
  previewKind,
  responseContentType,
  type BodyView,
  type PreviewKind,
} from "./reqMeta";

type Props = {
  body: string;
  bodyPretty?: string | null;
  headers: [string, string][];
  /** Request URL; relative links/images in an HTML preview resolve against it. */
  url: string;
};

/** JSON / Raw / Preview toolbar + viewer for a live or historical response. Remount (key) per response. */
export function ResponseBody({ body, bodyPretty, headers, url }: Props) {
  const ct = responseContentType(headers);
  const kind = previewKind(ct);
  const [view, setView] = useState<BodyView>(() => defaultBodyView(bodyPretty, kind));
  const [filter, setFilter] = useState("");
  const [filtered, setFiltered] = useState<{ out?: string; err?: string }>({});
  const pretty = view === "pretty" && bodyPretty ? bodyPretty : null;

  useEffect(() => {
    const path = filter.trim();
    if (!path || !bodyPretty) {
      setFiltered({});
      return;
    }
    const t = setTimeout(() => {
      invoke<string>("json_path_filter", { body, path })
        .then((out) => setFiltered({ out }))
        .catch((err) => setFiltered({ err: String(err) }));
    }, 150);
    return () => clearTimeout(t);
  }, [filter, body, bodyPretty]);

  return (
    <>
      <div className="body-toolbar">
        <button
          type="button"
          className={view === "pretty" ? "active" : ""}
          onClick={() => setView("pretty")}
          disabled={!bodyPretty}
        >
          JSON
        </button>
        <button
          type="button"
          className={view === "raw" ? "active" : ""}
          onClick={() => setView("raw")}
        >
          Raw
        </button>
        {kind && (
          <button
            type="button"
            className={view === "preview" ? "active" : ""}
            onClick={() => setView("preview")}
          >
            Preview
          </button>
        )}
        {bodyPretty && view !== "preview" && (
          <label className={`body-filter${filtered.err ? " bad" : ""}`} title="Filter with JSONPath, e.g. $.results[*].name">
            <ListFilter size={13} aria-hidden />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setFilter("")}
              placeholder="$.results[*].name"
              aria-label="Filter response with JSONPath"
              spellCheck={false}
            />
          </label>
        )}
      </div>
      {filtered.err && <p className="body-filter-err">{filtered.err}</p>}
      {view === "preview" && kind ? (
        <div className="response-preview">
          <Preview kind={kind} contentType={ct} body={body} url={url} />
        </div>
      ) : (
        <div className="editor-fill">
          {filtered.out !== undefined ? (
            <CodeEditor value={filtered.out} language="json" readOnly />
          ) : (
            <CodeEditor value={pretty ?? body} language={pretty ? "json" : "text"} readOnly />
          )}
        </div>
      )}
    </>
  );
}

function Preview({
  kind,
  contentType,
  body,
  url,
}: {
  kind: PreviewKind;
  contentType: string;
  body: string;
  url: string;
}) {
  if (kind === "html") {
    // Empty sandbox: no scripts, forms, popups or same-origin access to the app.
    return (
      <iframe
        title="Response preview"
        sandbox=""
        referrerPolicy="no-referrer"
        srcDoc={htmlWithBase(body, url)}
      />
    );
  }
  if (body.endsWith("…[truncated]")) {
    return <p className="muted">Too large to keep in history. Send the request again to preview it.</p>;
  }
  const src =
    kind === "svg"
      ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(body)}`
      : `data:${contentType};base64,${body}`;
  return <img src={src} alt="Response image" />;
}
