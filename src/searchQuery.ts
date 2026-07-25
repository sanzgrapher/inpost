/** Scoped search query parsing — `in:`, `from:`, `folder:` prefixes. */

export type SearchScope = {
  /** Workspace name or id fragment (space-committed chip) */
  from?: string;
  /** Collection name or id fragment (space-committed chip) */
  in?: string;
  /** Folder name fragment (space-committed chip) */
  folder?: string;
  /**
   * What the search input shows.
   * Space-terminated scopes become chips; a trailing `in:foo` stays here until spaced.
   */
  text: string;
};

type ScopeKey = "from" | "in" | "folder";

/** `in:Default ` (trailing space) → chip. */
const COMMITTED_RE =
  /\b(from|in|folder):(?:"([^"]+)"|(\S+))\s+/gi;
/** Trailing token at EOS — filters, but stays in the input (not a chip yet). */
const TRAILING_RE =
  /(?:^|\s)((?:from|in|folder):(?:"([^"]*)"|(\S*)))$/i;

function setKey(scope: SearchScope, key: ScopeKey, val: string) {
  if (val) scope[key] = val;
}

/** Peel space-committed scopes into chips; leave the rest (incl. trailing `in:…`) as text. */
export function parseSearchQuery(raw: string): SearchScope {
  const scope: SearchScope = { text: "" };
  let m: RegExpExecArray | null;
  const re = new RegExp(COMMITTED_RE.source, COMMITTED_RE.flags);
  let text = raw;
  while ((m = re.exec(raw))) {
    setKey(scope, m[1].toLowerCase() as ScopeKey, (m[2] ?? m[3] ?? "").trim());
    text = text.replace(m[0], " ");
  }
  scope.text = text.replace(/\s+/g, " ").trim();
  return scope;
}

/** Chips + trailing typed scope (for filtering). */
export function effectiveScope(scope: SearchScope): SearchScope {
  const out: SearchScope = {
    from: scope.from,
    in: scope.in,
    folder: scope.folder,
    text: scope.text,
  };
  const trail = TRAILING_RE.exec(scope.text);
  if (!trail) return out;
  const inner = /^(from|in|folder):(?:"([^"]*)"|(\S*))$/i.exec(trail[1]);
  if (!inner) return out;
  setKey(out, inner[1].toLowerCase() as ScopeKey, (inner[2] ?? inner[3] ?? "").trim());
  out.text = scope.text.slice(0, trail.index).trim();
  return out;
}

function quoteScopeValue(v: string): string {
  return /\s/.test(v) ? `"${v}"` : v;
}

/**
 * Rebuild stored query: committed chips (space-terminated) + input text.
 */
export function serializeSearchQuery(scope: SearchScope): string {
  const chips: string[] = [];
  if (scope.from) chips.push(`from:${quoteScopeValue(scope.from)}`);
  if (scope.in) chips.push(`in:${quoteScopeValue(scope.in)}`);
  if (scope.folder) chips.push(`folder:${quoteScopeValue(scope.folder)}`);
  const text = scope.text.trim();
  if (chips.length === 0) return text;
  // Trailing space keeps chips committed on the next parse.
  return text ? `${chips.join(" ")} ${text}` : `${chips.join(" ")} `;
}

export function scopeChips(scope: SearchScope): { key: string; value: string }[] {
  const out: { key: string; value: string }[] = [];
  if (scope.from) out.push({ key: "from", value: scope.from });
  if (scope.in) out.push({ key: "in", value: scope.in });
  if (scope.folder) out.push({ key: "folder", value: scope.folder });
  return out;
}

export type IndexItem = {
  kind: "request" | "folder" | "collection";
  id: string;
  title: string;
  method?: string;
  url?: string;
  path: string[];
  collectionId: string;
  collectionName: string;
  workspaceId: string;
  workspaceName: string;
  folderId?: string | null;
};

function includes(hay: string, needle: string) {
  return hay.toLowerCase().includes(needle.toLowerCase());
}

function nameMatch(name: string, needle: string) {
  const n = needle.toLowerCase();
  const h = name.toLowerCase();
  return h === n || h.includes(n) || n.includes(h);
}

export function filterIndex(
  items: IndexItem[],
  scope: SearchScope,
  opts?: { workspaceId?: string; workspaceName?: string },
): IndexItem[] {
  const s = effectiveScope(scope);
  let pool = items;

  if (s.from) {
    pool = pool.filter(
      (i) =>
        nameMatch(i.workspaceName, s.from!) || includes(i.workspaceId, s.from!),
    );
  } else if (opts?.workspaceId) {
    pool = pool.filter((i) => i.workspaceId === opts.workspaceId);
  }

  if (s.in) {
    pool = pool.filter(
      (i) =>
        nameMatch(i.collectionName, s.in!) || includes(i.collectionId, s.in!),
    );
  }

  if (s.folder) {
    pool = pool.filter((i) => {
      if (i.kind === "folder") return nameMatch(i.title, s.folder!);
      return i.path.some((p) => nameMatch(p, s.folder!));
    });
  }

  const q = s.text.trim().toLowerCase();
  if (!q) return pool;

  return pool.filter((i) => {
    if (i.title.toLowerCase().includes(q)) return true;
    if (i.method?.toLowerCase().includes(q)) return true;
    if (i.url?.toLowerCase().includes(q)) return true;
    if (i.path.some((p) => p.toLowerCase().includes(q))) return true;
    if (i.collectionName.toLowerCase().includes(q)) return true;
    return false;
  });
}

// Runnable self-check: `npx tsx src/searchQuery.ts`
declare const process: { argv: string[] } | undefined;
if (typeof process !== "undefined" && process.argv[1]?.includes("searchQuery")) {
  const p = parseSearchQuery('from:Personal in:"API Spec" folder:Auth login');
  console.assert(p.from === "Personal", "from");
  console.assert(p.in === "API Spec", "in quoted");
  console.assert(p.folder === "Auth", "folder");
  console.assert(p.text === "login", `text got ${p.text}`);

  const mid = parseSearchQuery("in:default unti");
  console.assert(mid.in === "default", "mid in");
  console.assert(mid.text === "unti", `mid text ${mid.text}`);
  console.assert(scopeChips(mid).length === 1, "chip committed");

  const typing = parseSearchQuery("in:def");
  console.assert(!typing.in, "no chip while typing");
  console.assert(typing.text === "in:def", `typing stays in input: ${typing.text}`);
  console.assert(effectiveScope(typing).in === "def", "typing still filters");
  console.assert(scopeChips(typing).length === 0, "no chip while typing");

  const round = parseSearchQuery(serializeSearchQuery(p));
  console.assert(round.text === "login" && round.in === "API Spec", "serialize");

  const chipOnly = parseSearchQuery(serializeSearchQuery({ in: "default", text: "" }));
  console.assert(chipOnly.in === "default" && chipOnly.text === "", "chip-only roundtrip");

  const items: IndexItem[] = [
    {
      kind: "request",
      id: "1",
      title: "Login",
      method: "POST",
      url: "/auth/login",
      path: ["Auth"],
      collectionId: "c1",
      collectionName: "API Spec",
      workspaceId: "w1",
      workspaceName: "Personal",
    },
  ];
  const hits = filterIndex(items, p);
  console.assert(hits.length === 1, "hit");
  console.log("searchQuery self-check ok");
}
