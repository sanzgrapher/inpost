/** Request meta helpers — body type ↔ Content-Type, path placeholders, common headers. */

export type BodyType = "none" | "json" | "text" | "urlencoded" | "multipart";
export type AuthType = "none" | "bearer" | "basic" | "apikey";

export const BODY_TYPE_OPTIONS: { id: BodyType; label: string }[] = [
  { id: "none", label: "none" },
  { id: "json", label: "JSON" },
  { id: "text", label: "Text" },
  { id: "urlencoded", label: "x-www-form-urlencoded" },
  { id: "multipart", label: "multipart/form-data" },
];

export const AUTH_TYPE_OPTIONS: { id: AuthType; label: string }[] = [
  { id: "none", label: "No auth" },
  { id: "bearer", label: "Bearer token" },
  { id: "basic", label: "Basic auth" },
  { id: "apikey", label: "API key" },
];

export const COMMON_HEADERS = [
  "Accept",
  "Accept-Encoding",
  "Accept-Language",
  "Authorization",
  "Cache-Control",
  "Content-Type",
  "Cookie",
  "If-Modified-Since",
  "If-None-Match",
  "Origin",
  "Referer",
  "User-Agent",
  "X-Request-Id",
];

export type Pair = { key: string; value: string; enabled?: boolean };

export function contentTypeFor(bodyType: BodyType): string | null {
  switch (bodyType) {
    case "json":
      return "application/json";
    case "text":
      return "text/plain";
    case "urlencoded":
      return "application/x-www-form-urlencoded";
    case "multipart":
      // Boundary set at send time in Rust.
      return null;
    default:
      return null;
  }
}

/** Set or clear managed Content-Type when body type changes. */
export function syncContentType(headers: Pair[], bodyType: BodyType): Pair[] {
  const stripped = headers.filter((p) => p.key.toLowerCase() !== "content-type");
  const base = stripped.filter((p) => p.key || p.value);
  const ct = contentTypeFor(bodyType);
  if (ct) {
    return [
      ...base,
      { key: "Content-Type", value: ct, enabled: true },
      { key: "", value: "", enabled: true },
    ];
  }
  return base.length
    ? [...base, { key: "", value: "", enabled: true }]
    : [{ key: "", value: "", enabled: true }];
}

/** Path placeholder names: `{id}` or `:id`, skipping `{{env}}`. */
export function pathVarNames(url: StringLike): string[] {
  const s = String(url);
  const names: string[] = [];
  let i = 0;
  while (i < s.length) {
    if (s[i] === "{") {
      if (s[i + 1] === "{") {
        const end = s.indexOf("}}", i + 2);
        i = end < 0 ? s.length : end + 2;
        continue;
      }
      const end = s.indexOf("}", i + 1);
      if (end > i + 1) {
        const name = s.slice(i + 1, end);
        if (isIdent(name) && !names.includes(name)) names.push(name);
        i = end + 1;
        continue;
      }
    }
    if (s[i] === ":") {
      let end = i + 1;
      while (end < s.length && /[A-Za-z0-9_]/.test(s[end])) end++;
      if (end > i + 1) {
        const name = s.slice(i + 1, end);
        if (!names.includes(name)) names.push(name);
        i = end;
        continue;
      }
    }
    i++;
  }
  return names;
}

type StringLike = string;

function isIdent(s: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(s);
}

export function parseAuthJson(json: string): {
  token?: string;
  username?: string;
  password?: string;
  key?: string;
  value?: string;
  in?: string;
} {
  try {
    const v = JSON.parse(json || "{}");
    return typeof v === "object" && v ? v : {};
  } catch {
    return {};
  }
}

/** Same token rule `http_exec::send` enforces; `{{vars}}` count as valid (resolved at send). */
export function headerNameError(name: string): string | null {
  const n = name.trim().replace(/\{\{[^}]*\}\}/g, "x");
  if (!n || /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(n)) return null;
  return "Invalid header name: use letters, digits and !#$%&'*+-.^_`|~ only (no spaces or braces)";
}

export type AutoHeader = { key: string; value: string; note: string; replaces: boolean };

/** Headers `http_exec::send` adds at send time; mirror of the Rust rules, keep in sync. */
export function autoHeaders(r: {
  headers: Pair[];
  bodyType: BodyType;
  body: string;
  authType: AuthType;
  authJson: string;
}): AutoHeader[] {
  const has = (name: string) =>
    r.headers.some((p) => p.enabled !== false && p.key.trim().toLowerCase() === name.toLowerCase());
  const out: AutoHeader[] = [];
  const add = (key: string, value: string, note: string) =>
    out.push({ key, value, note, replaces: has(key) });
  const auth = parseAuthJson(r.authJson);
  if (r.authType === "bearer" && auth.token) add("Authorization", `Bearer ${auth.token}`, "Auth tab");
  if (r.authType === "basic" && (auth.username || auth.password))
    add("Authorization", "Basic <base64 username:password>", "Auth tab");
  if (r.authType === "apikey" && auth.key && (auth.in ?? "header") !== "query")
    add(auth.key, auth.value ?? "", "Auth tab");
  if (r.bodyType === "urlencoded")
    add("Content-Type", "application/x-www-form-urlencoded", "body type");
  if (r.bodyType === "multipart") add("Content-Type", "multipart/form-data; boundary=…", "body type");
  const defaultCt = r.bodyType === "json" ? "application/json" : r.bodyType === "text" ? "text/plain" : null;
  if (defaultCt && r.body !== "" && !has("Content-Type")) add("Content-Type", defaultCt, `${r.bodyType} body`);
  if (!has("Accept")) add("Accept", "*/*", "default");
  if (!has("User-Agent")) add("User-Agent", "Inpost/<version>", "default");
  return out;
}

export function parseHistoryHeaders(
  headersJson: string | null | undefined,
): [string, string][] {
  if (!headersJson) return [];
  try {
    const arr = JSON.parse(headersJson);
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (row): row is [string, string] =>
        Array.isArray(row) && row.length >= 2 && typeof row[0] === "string",
    );
  } catch {
    return [];
  }
}

// Runnable self-check: `npx tsx src/reqMeta.ts`
declare const process: { argv: string[] } | undefined;
if (typeof process !== "undefined" && process.argv[1]?.includes("reqMeta")) {
  console.assert(pathVarNames("{{baseUrl}}/users/{id}/:slug").join() === "id,slug");
  console.assert(pathVarNames("https://x/{a}/{a}").join() === "a");
  // Imports often store pathVars as `{}`; UI still derives placeholders from the URL.
  console.assert(
    pathVarNames("{{baseUrl}}/pokemon-species/{species}").join() === "species",
    "species path placeholder",
  );
  const h = syncContentType(
    [{ key: "Accept", value: "application/json", enabled: true }],
    "json",
  );
  console.assert(h.some((p) => p.key === "Content-Type" && p.value === "application/json"));
  const none = syncContentType(h, "none");
  console.assert(!none.some((p) => p.key.toLowerCase() === "content-type"));
  const mp = autoHeaders({
    headers: [{ key: "Content-Type", value: "application/jsons", enabled: true }],
    bodyType: "multipart",
    body: "",
    authType: "bearer",
    authJson: '{"token":"t"}',
  });
  console.assert(
    mp.find((h) => h.key === "Content-Type")?.replaces === true,
    "multipart replaces user Content-Type",
  );
  console.assert(mp.some((h) => h.key === "Authorization" && h.value === "Bearer t"));
  console.assert(mp.some((h) => h.key === "Accept" && !h.replaces));
  const js = autoHeaders({
    headers: [
      { key: "Content-Type", value: "text/x", enabled: true },
      { key: "Accept", value: "a", enabled: false },
    ],
    bodyType: "json",
    body: "{}",
    authType: "none",
    authJson: "{}",
  });
  console.assert(!js.some((h) => h.key === "Content-Type"), "user JSON Content-Type wins");
  console.assert(js.some((h) => h.key === "Accept"), "disabled Accept doesn't count");
  const tx = autoHeaders({ headers: [], bodyType: "text", body: "hi", authType: "none", authJson: "{}" });
  console.assert(tx.some((h) => h.key === "Content-Type" && h.value === "text/plain"), "text default CT");
  console.assert(tx.some((h) => h.key === "User-Agent"), "default User-Agent");
  console.assert(!headerNameError("X-Api_Key.v2") && !headerNameError("") && !headerNameError("{{hdr}}"));
  console.assert(!!headerNameError("X Bad") && !!headerNameError("X:Y") && !!headerNameError("{x}"));
  console.log("reqMeta self-check ok");
}
