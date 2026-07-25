import CodeMirror from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";
import { EditorView } from "@codemirror/view";

type Props = {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  language?: "json" | "text";
  placeholder?: string;
  className?: string;
};

/** Thin CodeMirror 6 wrapper — same stack Yaak uses for bodies/responses. */
export function CodeEditor({
  value,
  onChange,
  readOnly = false,
  language = "json",
  placeholder,
  className,
}: Props) {
  const extensions = [
    ...(language === "json" ? [json()] : []),
    EditorView.lineWrapping,
    ...(readOnly ? [EditorView.editable.of(false)] : []),
  ];

  return (
    <CodeMirror
      className={`code-editor ${className ?? ""}`}
      value={value}
      height="100%"
      theme="light"
      basicSetup={{
        lineNumbers: true,
        foldGutter: true,
        highlightActiveLine: !readOnly,
        highlightSelectionMatches: true,
      }}
      extensions={extensions}
      editable={!readOnly}
      readOnly={readOnly}
      placeholder={placeholder}
      onChange={onChange}
    />
  );
}
