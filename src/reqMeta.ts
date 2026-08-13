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
  console.log("reqMeta self-check ok");
}
