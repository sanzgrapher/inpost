// Pure Markdown toolbar actions for a textarea-backed editor.
// Content stays CommonMark, so it is always valid as an OpenAPI `description`.
// Self-check: npx tsx src/mdEdit.ts

export type MdAction =
  | "bold"
  | "italic"
  | "strike"
  | "code"
  | "codeblock"
  | "h1"
  | "h2"
  | "h3"
  | "ul"
  | "ol"
  | "quote"
  | "link";

export type MdEdit = { text: string; selStart: number; selEnd: number };

const WRAP: Partial<Record<MdAction, string>> = {
  bold: "**",
  italic: "*",
  strike: "~~",
  code: "`",
};

const LINE: Partial<Record<MdAction, string>> = {
  h1: "# ",
  h2: "## ",
  h3: "### ",
  ul: "- ",
  quote: "> ",
};

function wrapToggle(text: string, s: number, e: number, mark: string): MdEdit {
  const m = mark.length;
  const sel = text.slice(s, e);
  // Unwrap when the selection is already surrounded by the marker.
  if (text.slice(s - m, s) === mark && text.slice(e, e + m) === mark) {
    return {
      text: text.slice(0, s - m) + sel + text.slice(e + m),
      selStart: s - m,
      selEnd: e - m,
    };
  }
  if (sel.startsWith(mark) && sel.endsWith(mark) && sel.length >= 2 * m) {
    const inner = sel.slice(m, sel.length - m);
    return {
      text: text.slice(0, s) + inner + text.slice(e),
      selStart: s,
      selEnd: s + inner.length,
    };
  }
  return {
    text: text.slice(0, s) + mark + sel + mark + text.slice(e),
    selStart: s + m,
    selEnd: e + m,
  };
}

/** Expand [s, e] to whole lines and return their bounds + content. */
function lineSpan(text: string, s: number, e: number) {
  const start = text.lastIndexOf("\n", s - 1) + 1;
  const nl = text.indexOf("\n", e);
  const end = nl === -1 ? text.length : nl;
  return { start, end, lines: text.slice(start, end).split("\n") };
}

const LINE_PREFIX_RE = /^(#{1,6} |- |> |\d+\. )/;

function linePrefixToggle(
  text: string,
  s: number,
  e: number,
  prefix: string,
  numbered = false,
): MdEdit {
  const { start, end, lines } = lineSpan(text, s, e);
  const has = (l: string) =>
    numbered ? /^\d+\. /.test(l) : l.startsWith(prefix);
  const allHave = lines.every((l) => !l.trim() || has(l));
  let n = 0;
  const next = lines.map((l) => {
    if (!l.trim()) {
      n = 0; // blank line ends a list run
      return l;
    }
    const stripped = l.replace(LINE_PREFIX_RE, "");
    if (allHave) return stripped;
    n += 1;
    return (numbered ? `${n}. ` : prefix) + stripped;
  });
  const block = next.join("\n");
  return {
    text: text.slice(0, start) + block + text.slice(end),
    selStart: start,
    selEnd: start + block.length,
  };
}

export function applyMdAction(
  text: string,
  selStart: number,
  selEnd: number,
  action: MdAction,
): MdEdit {
  const s = Math.min(selStart, selEnd);
  const e = Math.max(selStart, selEnd);
  const wrap = WRAP[action];
  if (wrap) return wrapToggle(text, s, e, wrap);
  if (action === "ol") return linePrefixToggle(text, s, e, "1. ", true);
  const line = LINE[action];
  if (line) return linePrefixToggle(text, s, e, line);
  if (action === "link") {
    const sel = text.slice(s, e) || "text";
    const before = text.slice(0, s);
    const out = `[${sel}](url)`;
    // Select the url placeholder so typing replaces it.
    const urlStart = s + sel.length + 3;
    return {
      text: before + out + text.slice(e),
      selStart: urlStart,
      selEnd: urlStart + 3,
    };
  }
  // codeblock
  const sel = text.slice(s, e);
  const nlBefore = s === 0 || text[s - 1] === "\n" ? "" : "\n";
  const nlAfter = e === text.length || text[e] === "\n" ? "" : "\n";
  const block = `${nlBefore}\`\`\`\n${sel}\n\`\`\`${nlAfter}`;
  const inner = s + nlBefore.length + 4;
  return {
    text: text.slice(0, s) + block + text.slice(e),
    selStart: inner,
    selEnd: inner + sel.length,
  };
}

/* ---------------- self-check (npx tsx src/mdEdit.ts) ---------------- */
declare const process: { argv: string[]; exit(code: number): never } | undefined;
const isMain =
  typeof process !== "undefined" && process?.argv?.[1]?.endsWith("mdEdit.ts");
if (isMain) {
  const eq = (a: unknown, b: unknown, msg: string) => {
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      throw new Error(`${msg}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
    }
  };

  // bold wraps and toggles back
  let r = applyMdAction("hello world", 0, 5, "bold");
  eq(r.text, "**hello** world", "bold wrap");
  r = applyMdAction(r.text, r.selStart, r.selEnd, "bold");
  eq(r.text, "hello world", "bold unwrap");

  // empty selection leaves the caret between markers
  r = applyMdAction("ab", 1, 1, "italic");
  eq(r, { text: "a**b", selStart: 2, selEnd: 2 }, "italic empty sel");

  // heading toggles per line and replaces other prefixes
  r = applyMdAction("title", 0, 0, "h2");
  eq(r.text, "## title", "h2 add");
  r = applyMdAction(r.text, 0, 0, "h1");
  eq(r.text, "# title", "h1 replaces h2");
  r = applyMdAction(r.text, 0, 0, "h1");
  eq(r.text, "title", "h1 toggle off");

  // list over multiple lines, blank lines untouched
  r = applyMdAction("a\n\nb", 0, 4, "ul");
  eq(r.text, "- a\n\n- b", "ul multi-line");
  r = applyMdAction(r.text, 0, r.text.length, "ol");
  eq(r.text, "1. a\n\n1. b", "ol restarts after blank line");

  // link selects the url placeholder
  r = applyMdAction("go here", 3, 7, "link");
  eq(r.text, "go [here](url)", "link wrap");
  eq(r.text.slice(r.selStart, r.selEnd), "url", "link url selected");

  // code block gets its own lines
  r = applyMdAction("x = 1", 0, 5, "codeblock");
  eq(r.text, "```\nx = 1\n```", "codeblock");
  r = applyMdAction("before\ncode", 7, 11, "codeblock");
  eq(r.text, "before\n```\ncode\n```", "codeblock newline guard");

  console.log("mdEdit self-check OK");
}
