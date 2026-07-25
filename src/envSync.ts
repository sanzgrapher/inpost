/** Copy selected env var keys from source into target (overwrite on clash). */

export type EnvPair = { key: string; value: string; enabled?: boolean };

/**
 * Token-level (here: word) diff between two strings. Returns plain segments
 * that exist in both (`equal`) and segments unique to each side (`removed` /
 * `added`). The renderer walks both arrays in pairs to color only the changed
 * characters, like a git word-diff — not a strikethrough of the whole string.
 *
 * ponytail: O(n*m) LCS, fine for env values (a few hundred chars at most).
 * Upgrade path: Myers diff or a packed LCS if env values ever get to KB range.
 */
export type DiffSegment =
  | { kind: "equal"; text: string }
  | { kind: "removed"; text: string }
  | { kind: "added"; text: string };

const WORD_RE = /(\s+|[^\s]+)/g;

export function tokenize(s: string): string[] {
  const out: string[] = [];
  const re = new RegExp(WORD_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) out.push(m[0]);
  return out;
}

export function diffTokens(a: string, b: string): {
  old: DiffSegment[];
  next: DiffSegment[];
} {
  const A = tokenize(a);
  const B = tokenize(b);
  const n = A.length;
  const m = B.length;

  // LCS table — standard O(n*m) DP.
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const oldSegs: DiffSegment[] = [];
  const nextSegs: DiffSegment[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) {
      pushRun(oldSegs, "equal", A[i]);
      pushRun(nextSegs, "equal", B[j]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      pushRun(oldSegs, "removed", A[i]);
      i++;
    } else {
      pushRun(nextSegs, "added", B[j]);
      j++;
    }
  }
  while (i < n) {
    pushRun(oldSegs, "removed", A[i++]);
  }
  while (j < m) {
    pushRun(nextSegs, "added", B[j++]);
  }
  return refine(oldSegs, nextSegs);
}

/**
 * Refine "removed N tokens" / "added N tokens" pairs in `oldSegs` /
 * `nextSegs` into a character-level diff when no whitespace boundary
 * surrounds them. A whole URL like `https://…/v1` is one word-token, so the
 * word diff marks it 100% red as a single removed token — without refine,
 * the renderer would colour the whole thing red even though only the last
 * char changed. We pair old[i].removed with next[i].added by index and
 * char-diff each pair independently.
 *
 * ponytail: O(n*m) per pair, fine for env values (≤ hundreds of chars).
 * Upgrade path: Myers diff or a packed LCS if values ever get to KB range.
 */
function refine(
  oldSegs: DiffSegment[],
  nextSegs: DiffSegment[],
): { old: DiffSegment[]; next: DiffSegment[] } {
  const max = Math.max(oldSegs.length, nextSegs.length);
  const oldOut: DiffSegment[] = [];
  const nextOut: DiffSegment[] = [];
  for (let i = 0; i < max; i++) {
    const o = oldSegs[i];
    const nn = nextSegs[i];
    if (
      o?.kind === "removed" &&
      nn?.kind === "added" &&
      noWhitespaceAround(oldSegs, nextSegs, i)
    ) {
      const charDiffs = charDiff(o.text, nn.text);
      const oSide: DiffSegment[] = [];
      const nSide: DiffSegment[] = [];
      // For each char in the inserted diff, keep them in lockstep so old
      // and new have the same number of segments (preserves positional
      // alignment even on equal spans).
      for (const seg of charDiffs) {
        if (seg.kind === "removed") {
          pushRun(oSide, "removed", seg.text);
        } else if (seg.kind === "added") {
          pushRun(nSide, "added", seg.text);
        } else {
          pushRun(oSide, "equal", seg.text);
          pushRun(nSide, "equal", seg.text);
        }
      }
      oSide.forEach((s) => oldOut.push(s));
      nSide.forEach((s) => nextOut.push(s));
    } else {
      if (o) oldOut.push(o);
      if (nn) nextOut.push(nn);
    }
  }
  return { old: oldOut, next: nextOut };
}

function noWhitespaceAround(
  oldSegs: DiffSegment[],
  nextSegs: DiffSegment[],
  i: number,
): boolean {
  // Skip if the removed/added pair is glued to an `equal` segment — that
  // means there's a real boundary (e.g. word / space) and char-diff would
  // need full re-tokenisation to be coherent, which the renderer can't
  // visualise cleanly across both sides.
  return (
    oldSegs[i - 1]?.kind !== "equal" &&
    oldSegs[i + 1]?.kind !== "equal" &&
    nextSegs[i - 1]?.kind !== "equal" &&
    nextSegs[i + 1]?.kind !== "equal"
  );
}

function charDiff(a: string, b: string): DiffSegment[] {
  const m = a.length;
  const n = b.length;
  const dp: Uint16Array[] = Array.from(
    { length: m + 1 },
    () => new Uint16Array(n + 1),
  );
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] =
        a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const segs: DiffSegment[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      pushRun(segs, "equal", a[i]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      pushRun(segs, "removed", a[i]);
      i++;
    } else {
      pushRun(segs, "added", b[j]);
      j++;
    }
  }
  while (i < m) pushRun(segs, "removed", a[i++]);
  while (j < n) pushRun(segs, "added", b[j++]);
  return segs;
}

function pushRun(segs: DiffSegment[], kind: DiffSegment["kind"], text: string) {
  const last = segs[segs.length - 1];
  if (last && last.kind === kind) last.text += text;
  else segs.push({ kind, text });
}

export function syncSelectedVars(
  target: EnvPair[],
  source: EnvPair[],
  keys: string[],
): EnvPair[] {
  const want = new Set(keys.map((k) => k.trim()).filter(Boolean));
  const byKey = new Map<string, EnvPair>();
  for (const p of target) {
    const k = p.key.trim();
    if (k) byKey.set(k, { key: k, value: p.value, enabled: p.enabled !== false });
  }
  for (const p of source) {
    const k = p.key.trim();
    if (!k || !want.has(k)) continue;
    byKey.set(k, { key: k, value: p.value, enabled: p.enabled !== false });
  }
  const out = [...byKey.values()];
  out.push({ key: "", value: "", enabled: true });
  return out;
}

/** Keys present in source with a non-empty name. */
export function sourceKeys(source: EnvPair[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of source) {
    const k = p.key.trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

export function uniqueEnvName(base: string, taken: string[]): string {
  const names = new Set(taken.map((n) => n.toLowerCase()));
  const root = base.trim() || "Environment";
  if (!names.has(root.toLowerCase())) return root;
  let i = 2;
  while (names.has(`${root} ${i}`.toLowerCase())) i++;
  return `${root} ${i}`;
}

// Runnable self-check: `npx tsx src/envSync.ts`
declare const process: { argv: string[] } | undefined;
if (typeof process !== "undefined" && process.argv[1]?.includes("envSync")) {
  const src = [
    { key: "baseUrl", value: "https://local" },
    { key: "token", value: "abc" },
    { key: "", value: "" },
  ];
  const tgt = [
    { key: "baseUrl", value: "https://prod" },
    { key: "region", value: "us" },
    { key: "", value: "" },
  ];
  const merged = syncSelectedVars(tgt, src, ["baseUrl", "token"]);
  console.assert(
    merged.find((p) => p.key === "baseUrl")?.value === "https://local",
    "overwrites baseUrl",
  );
  console.assert(
    merged.find((p) => p.key === "token")?.value === "abc",
    "adds token",
  );
  console.assert(
    merged.find((p) => p.key === "region")?.value === "us",
    "keeps region",
  );
  console.assert(
    merged.some((p) => !p.key.trim()),
    "keeps empty trailing row",
  );
  console.assert(
    sourceKeys(src).join(",") === "baseUrl,token",
    "source keys",
  );
  console.assert(uniqueEnvName("Local", ["Local"]) === "Local 2", "unique 2");
  console.assert(
    uniqueEnvName("Local", ["Local", "Local 2"]) === "Local 3",
    "unique 3",
  );
  console.assert(uniqueEnvName("Prod", ["Local"]) === "Prod", "unique free");
  const d1 = diffTokens("https://pokeapi.co/api/v1", "https://pokeapi.co/api/v2");
  console.assert(
    d1.old.some((s) => s.kind === "equal" && s.text.endsWith("/api/v")),
    "common prefix kept equal: " + JSON.stringify(d1),
  );
  console.assert(
    d1.old.some((s) => s.kind === "removed" && s.text === "1"),
    "v1 char refines to removed '1': " + JSON.stringify(d1),
  );
  console.assert(
    d1.next.some((s) => s.kind === "added" && s.text === "2"),
    "v2 char refines to added '2': " + JSON.stringify(d1),
  );
  const d2 = diffTokens("pikachu", "ditto");
  console.assert(
    d2.old.some((s) => s.kind === "removed"),
    "fully different: has removed: " + JSON.stringify(d2),
  );
  const d3 = diffTokens("same", "same");
  console.assert(
    d3.old.length === 1 && d3.old[0].kind === "equal" && d3.next.length === 1 && d3.next[0].kind === "equal",
    "identical: all equal: " + JSON.stringify(d3),
  );
  const d4 = diffTokens("foo bar", "foo baz");
  console.assert(
    d4.old.some((s) => s.kind === "equal" && s.text.startsWith("foo")),
    "word-boundary diff keeps 'foo' equal: " + JSON.stringify(d4),
  );
  console.log("envSync self-check ok");
}
