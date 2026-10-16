import { useState } from "react";
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
  const pretty = view === "pretty" && bodyPretty ? bodyPretty : null;
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
      </div>
      {view === "preview" && kind ? (
        <div className="response-preview">
          <Preview kind={kind} contentType={ct} body={body} url={url} />
        </div>
      ) : (
        <div className="editor-fill">
          <CodeEditor value={pretty ?? body} language={pretty ? "json" : "text"} readOnly />
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
