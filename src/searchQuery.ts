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
  // Keep a trailing space so the controlled input can type "Get Species"
  // (and so `in:Default ` still reaches COMMITTED_RE on the next round-trip).
  // Whitespace-only remainder (chip-only query) stays empty.
  const keepTrail = /\s$/.test(text);
  scope.text = text.replace(/\s+/g, " ").trim();
  if (keepTrail && scope.text) scope.text += " ";
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

/** The `in:`/`from:`/`folder:` token still being typed at the end of the input. */
export function trailingScope(
  text: string,
): { key: ScopeKey; value: string; start: number } | null {
  const trail = TRAILING_RE.exec(text);
  if (!trail) return null;
  const inner = /^(from|in|folder):(?:"([^"]*)"|(\S*))$/i.exec(trail[1]);
  if (!inner) return null;
  return {
    key: inner[1].toLowerCase() as ScopeKey,
    value: (inner[2] ?? inner[3] ?? "").trim(),
    start: trail.index,
  };
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
  // Don't trim: trailing space is how free text grows ("Get ") and how
  // half-typed scopes commit (`in:Default `).
  const text = scope.text;
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

/**
 * Turn the last committed chip back into editable input text (so Backspace
 * doesn't wipe a filter in one shot — it becomes `in:Foo` you can edit).
 */
export function uncommitLastChip(scope: SearchScope): SearchScope | null {
  const chips = scopeChips(scope);
  if (chips.length === 0) return null;
  const last = chips[chips.length - 1]!;
  const next: SearchScope = {
    from: scope.from,
    in: scope.in,
    folder: scope.folder,
    text: scope.text,
  };
  next[last.key as ScopeKey] = undefined;
  const token = `${last.key}:${quoteScopeValue(last.value)}`;
  next.text = scope.text.trim() ? `${token} ${scope.text.trim()}` : token;
  return next;
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

export type ScopeSuggestion = { key: ScopeKey; value: string };

/** Values that exist in the index for one scope key, narrowed by the other scopes. */
function valuesFor(
  items: IndexItem[],
  key: ScopeKey,
  scope: SearchScope,
  workspaceId?: string,
): string[] {
  let pool = items;
  // `from:` is the way out of the current workspace, so it is never narrowed by it.
  if (key !== "from") {
    if (scope.from) pool = pool.filter((i) => nameMatch(i.workspaceName, scope.from!));
    else if (workspaceId) pool = pool.filter((i) => i.workspaceId === workspaceId);
  }
  if (key === "folder" && scope.in) {
    pool = pool.filter((i) => nameMatch(i.collectionName, scope.in!));
  }
  const names = new Set<string>();
  for (const i of pool) {
    if (key === "from") names.add(i.workspaceName);
    else if (key === "in") names.add(i.collectionName);
    else {
      if (i.kind === "folder") names.add(i.title);
      for (const p of i.path) names.add(p);
    }
  }
  return [...names];
}

/**
 * Suggestions for a half-typed `key:value`. Falls back to the other keys so
 * `in:moves` still finds the *folder* named Moves instead of dead-ending.
 */
export function scopeSuggestions(
  items: IndexItem[],
  trail: { key: ScopeKey; value: string },
  scope: SearchScope,
  opts?: { workspaceId?: string; limit?: number },
): ScopeSuggestion[] {
  const limit = opts?.limit ?? 8;
  const q = trail.value.trim().toLowerCase();
  const rank = (list: string[], key: ScopeKey): ScopeSuggestion[] =>
    list
      .filter((n) => !q || n.toLowerCase().includes(q))
      .sort(
        (a, b) =>
          Number(!a.toLowerCase().startsWith(q)) -
            Number(!b.toLowerCase().startsWith(q)) || a.localeCompare(b),
      )
      .map((value) => ({ key, value }));

  const own = rank(valuesFor(items, trail.key, scope, opts?.workspaceId), trail.key);
  if (own.length || !q) return own.slice(0, limit);

  const others: ScopeKey[] = (["in", "folder", "from"] as const).filter(
    (k) => k !== trail.key,
  );
  return others
    .flatMap((k) => rank(valuesFor(items, k, scope, opts?.workspaceId), k))
    .slice(0, limit);
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

  // Trailing space must survive so the controlled input can type multi-word queries.
  const trailSpace = parseSearchQuery("Get ");
  console.assert(trailSpace.text === "Get ", `trailing free-text space got "${trailSpace.text}"`);
  const multi = parseSearchQuery(serializeSearchQuery({ text: "Get Species" }));
  console.assert(multi.text === "Get Species", `multi-word roundtrip got "${multi.text}"`);
  const spaceCommit = parseSearchQuery("in:Default ");
  console.assert(
    spaceCommit.in === "Default" && spaceCommit.text === "",
    `space commits chip, got in=${spaceCommit.in} text="${spaceCommit.text}"`,
  );
  const typedSpace = parseSearchQuery(serializeSearchQuery({ text: "Get " }));
  console.assert(typedSpace.text === "Get ", `serialize keeps trailing space: "${typedSpace.text}"`);

  const un = uncommitLastChip({ in: "Default", folder: "Auth", text: "login" });
  console.assert(un?.folder === undefined && un?.in === "Default", "uncommit drops last chip");
  console.assert(un?.text === "folder:Auth login", `uncommit text got ${un?.text}`);
  const unOnly = uncommitLastChip({ in: "Default", text: "" });
  console.assert(unOnly?.text === "in:Default" && !unOnly?.in, "uncommit sole chip to text");
  console.assert(uncommitLastChip({ text: "x" }) === null, "uncommit with no chips");

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

  console.assert(trailingScope("in:def")?.value === "def", "trailing value");
  console.assert(trailingScope("in:")?.key === "in", "bare key is a trailing scope");
  console.assert(trailingScope("in:default unti") === null, "committed scope is not trailing");

  const pool: IndexItem[] = [
    ...items,
    {
      kind: "folder",
      id: "f1",
      title: "Moves",
      path: [],
      collectionId: "c2",
      collectionName: "PokéAPI v2",
      workspaceId: "w1",
      workspaceName: "Personal",
    },
  ];
  const bare = scopeSuggestions(pool, { key: "in", value: "" }, { text: "" });
  console.assert(
    bare.length === 2 && bare.every((s) => s.key === "in"),
    `bare in: lists collections, got ${JSON.stringify(bare)}`,
  );
  const folderFallback = scopeSuggestions(pool, { key: "in", value: "moves" }, { text: "" });
  console.assert(
    folderFallback[0]?.key === "folder" && folderFallback[0]?.value === "Moves",
    `in:moves falls back to the folder, got ${JSON.stringify(folderFallback)}`,
  );
  const fromSug = scopeSuggestions(pool, { key: "from", value: "per" }, { text: "" });
  console.assert(
    fromSug[0]?.value === "Personal",
    `from: suggests workspaces, got ${JSON.stringify(fromSug)}`,
  );
  console.assert(
    scopeSuggestions(pool, { key: "in", value: "zzz" }, { text: "" }).length === 0,
    "no suggestion when nothing matches any key",
  );

  console.log("searchQuery self-check ok");
}
