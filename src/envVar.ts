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

  console.log("envVar self-check ok");
}
