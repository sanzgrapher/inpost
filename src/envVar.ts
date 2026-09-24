/** `{{var}}` tokenization + lookup for URL/header highlighting. */

export type UrlToken =
  | { kind: "text"; text: string }
  | { kind: "var"; text: string; name: string; start: number; end: number };

const VAR_RE = /\{\{\s*([^{}]+?)\s*\}\}/g;

export function tokenizeUrl(raw: string): UrlToken[] {
  const out: UrlToken[] = [];
  let last = 0;
  const re = new RegExp(VAR_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    if (m.index > last) {
      out.push({ kind: "text", text: raw.slice(last, m.index) });
    }
    out.push({
      kind: "var",
      text: m[0],
      name: m[1].trim(),
      start: m.index,
      end: m.index + m[0].length,
    });
    last = m.index + m[0].length;
  }
  if (last < raw.length) out.push({ kind: "text", text: raw.slice(last) });
  if (out.length === 0 && raw) out.push({ kind: "text", text: raw });
  return out;
}

/** Value for `name` from active then global maps (active wins). */
export function resolveVar(
  name: string,
  active: Record<string, string>,
  global: Record<string, string> = {},
): { value: string; source: "active" | "global" | "missing" } {
  if (Object.prototype.hasOwnProperty.call(active, name)) {
    return { value: active[name], source: "active" };
  }
  if (Object.prototype.hasOwnProperty.call(global, name)) {
    return { value: global[name], source: "global" };
  }
  return { value: "", source: "missing" };
}

export function pairsToMap(
  pairs: { key: string; value: string; enabled?: boolean }[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of pairs) {
    if (p.enabled === false) continue;
    const k = p.key.trim();
    if (k) out[k] = p.value;
  }
  return out;
}

/** Resolve `{{key}}` tokens. Missing keys are left as-is. Active wins over global. */
export function substituteVars(
  input: string,
  active: Record<string, string>,
  global: Record<string, string> = {},
): string {
  return input.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (m, key: string) => {
    if (Object.prototype.hasOwnProperty.call(active, key)) return active[key];
    if (Object.prototype.hasOwnProperty.call(global, key)) return global[key];
    return m;
  });
}

/**
 * Percent-encode a query key/value while leaving `{{var}}` tokens literal.
 * encodeURIComponent turns `{{` into `%7B%7B`, which breaks URL-bar hover
 * highlighting and env substitution — keep those spans intact.
 */
export function encodeQueryPart(s: string): string {
  const re = /\{\{\s*[^{}]+?\s*\}\}/g;
  let out = "";
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    out += encodeURIComponent(s.slice(last, m.index));
    out += m[0];
    last = m.index + m[0].length;
  }
  out += encodeURIComponent(s.slice(last));
  return out;
}

/** Replace `:name` and `{name}` (not `{{name}}`) path placeholders. */
export function applyPathVars(
  url: string,
  pairs: { key: string; value: string; enabled?: boolean }[],
): string {
  let out = url;
  for (const p of pairs) {
    if (p.enabled === false) continue;
    const k = p.key.trim();
    if (!k) continue;
    out = replaceSingleBraces(out, k, p.value);
    out = out.split(`:${k}`).join(p.value);
  }
  return out;
}

function replaceSingleBraces(url: string, name: string, value: string): string {
  const needle = `{${name}}`;
  let out = "";
  let i = 0;
  while (i < url.length) {
    const at = url.indexOf(needle, i);
    if (at < 0) {
      out += url.slice(i);
      break;
    }
    const beforeOk = at === 0 || url[at - 1] !== "{";
    const after = at + needle.length;
    const afterOk = after >= url.length || url[after] !== "}";
    if (beforeOk && afterOk) {
      out += url.slice(i, at) + value;
      i = after;
    } else {
      out += url.slice(i, at + 1);
      i = at + 1;
    }
  }
  return out;
}

/**
 * Same order as the Rust send path: env-sub path values → apply path vars →
 * env-sub the final URL. Missing `{{vars}}` stay as tokens.
 */
export function resolveRequestUrl(
  url: string,
  pathPairs: { key: string; value: string; enabled?: boolean }[],
  active: Record<string, string>,
  global: Record<string, string> = {},
): string {
  const path = pathPairs.map((p) => ({
    ...p,
    value: substituteVars(p.value, active, global),
  }));
  return substituteVars(applyPathVars(url, path), active, global);
}

/**
 * Resolve `{{vars}}` in history snapshot pair rows (`[k,v]` or `{key,value,…}`).
 * Used when writing request_json and when rendering older template snapshots.
 */
export function substituteInPairsJson(
  raw: unknown,
  active: Record<string, string>,
  global: Record<string, string> = {},
): unknown {
  if (!Array.isArray(raw)) return raw;
  return raw.map((row) => {
    if (Array.isArray(row) && row.length >= 2) {
      const next = row.slice();
      next[0] = substituteVars(String(row[0] ?? ""), active, global);
      next[1] = substituteVars(String(row[1] ?? ""), active, global);
      return next;
    }
    if (row && typeof row === "object") {
      const o = row as Record<string, unknown>;
      return {
        ...o,
        key: substituteVars(String(o.key ?? ""), active, global),
        value: substituteVars(String(o.value ?? ""), active, global),
      };
    }
    return row;
  });
}

// Runnable self-check: `npx tsx src/envVar.ts`
declare const process: { argv: string[] } | undefined;
if (typeof process !== "undefined" && process.argv[1]?.includes("envVar")) {
  const t = tokenizeUrl("{{baseUrl}}/api/{{id}}");
  console.assert(t.length === 3, `tokens ${t.length}`);
  console.assert(t[0].kind === "var" && t[0].name === "baseUrl", "baseUrl");
  console.assert(t[1].kind === "text" && t[1].text === "/api/", "text");
  console.assert(t[2].kind === "var" && t[2].name === "id", "id");

  const spaced = tokenizeUrl("{{ base_url }}/x");
  console.assert(
    spaced[0].kind === "var" && spaced[0].name === "base_url",
    "trim name",
  );

  const r = resolveVar("a", { a: "1" }, { a: "g", b: "2" });
  console.assert(r.source === "active" && r.value === "1", "active wins");
  console.assert(resolveVar("b", {}, { b: "2" }).source === "global", "global");
  console.assert(resolveVar("z", {}, {}).source === "missing", "missing");

  console.assert(
    Object.keys(pairsToMap([{ key: " x ", value: "y", enabled: true }]))[0] ===
      "x",
    "trim key",
  );

  console.assert(
    substituteVars("{{baseUrl}}/v1?t={{token}}", { baseUrl: "https://a" }, { token: "g" }) ===
      "https://a/v1?t=g",
    "substitute active+global",
  );
  console.assert(
    substituteVars("{{missing}}/x", {}, {}) === "{{missing}}/x",
    "missing left intact",
  );
  console.assert(
    encodeQueryPart("{{limit}}") === "{{limit}}",
    "encode keeps {{var}}",
  );
  console.assert(
    encodeQueryPart("a b{{limit}}c d") === "a%20b{{limit}}c%20d",
    "encode around {{var}}",
  );
  console.assert(
    encodeQueryPart("x&y") === "x%26y",
    "encode still escapes &",
  );
  console.assert(
    tokenizeUrl("?limit={{limit}}&offset={{offset}}").filter((t) => t.kind === "var")
      .length === 2,
    "tokenize query vars",
  );
  console.assert(
    applyPathVars("https://x/{{id}}/:id/{id}", [{ key: "id", value: "3" }]) ===
      "https://x/{{id}}/3/3",
    "path vars skip {{id}}",
  );
  console.assert(
    resolveRequestUrl(
      "{{baseUrl}}/type/:id",
      [{ key: "id", value: "{{typeId}}" }],
      { baseUrl: "https://pokeapi.co/api/v2", typeId: "3" },
    ) === "https://pokeapi.co/api/v2/type/3",
    "resolve pipeline",
  );
  console.assert(
    JSON.stringify(
      substituteInPairsJson(
        [
          ["A", "{{t}}"],
          { key: "{{k}}", value: "{{t}}", enabled: true },
        ],
        { t: "1", k: "X" },
      ),
    ) === JSON.stringify([["A", "1"], { key: "X", value: "1", enabled: true }]),
    "substitute pairs json",
  );

  console.log("envVar self-check ok");
}
