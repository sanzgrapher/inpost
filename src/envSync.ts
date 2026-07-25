/** Copy selected env var keys from source into target (overwrite on clash). */

export type EnvPair = { key: string; value: string; enabled?: boolean };

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
  console.log("envSync self-check ok");
}
