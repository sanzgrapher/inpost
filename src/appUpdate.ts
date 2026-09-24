/** Notify-only update check: compare installed version to GitHub latest release. */

export const GITHUB_REPO = "sanzgrapher/inpost";
export const REPO_URL = `https://github.com/${GITHUB_REPO}`;
export const RELEASES_PAGE = `${REPO_URL}/releases/latest`;

const DISMISS_KEY = "inpost.dismissedUpdate";

export type LatestRelease = { version: string; url: string };

export function normalizeVersion(v: string): string {
  return v.trim().replace(/^v/i, "");
}

/** True when `a` is strictly newer than `b` (dotted numeric, missing parts = 0). */
export function isNewer(a: string, b: string): boolean {
  const pa = normalizeVersion(a).split(".").map((x) => parseInt(x, 10) || 0);
  const pb = normalizeVersion(b).split(".").map((x) => parseInt(x, 10) || 0);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return da > db;
  }
  return false;
}

export async function fetchLatestRelease(
  fetchImpl: typeof fetch = fetch,
): Promise<LatestRelease | null> {
  const res = await fetchImpl(
    `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
    { headers: { Accept: "application/vnd.github+json" } },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as {
    tag_name?: string;
    html_url?: string;
    draft?: boolean;
    prerelease?: boolean;
  };
  if (!data.tag_name || data.draft || data.prerelease) return null;
  return {
    version: normalizeVersion(data.tag_name),
    url: data.html_url ?? RELEASES_PAGE,
  };
}

export async function checkForUpdate(
  currentVersion: string,
  opts?: { fetchImpl?: typeof fetch; dismissed?: string | null },
): Promise<LatestRelease | null> {
  const latest = await fetchLatestRelease(opts?.fetchImpl);
  if (!latest) return null;
  if (!isNewer(latest.version, currentVersion)) return null;
  if (
    opts?.dismissed != null &&
    normalizeVersion(opts.dismissed) === latest.version
  ) {
    return null;
  }
  return latest;
}

export function getDismissedUpdate(): string | null {
  try {
    return localStorage.getItem(DISMISS_KEY);
  } catch {
    return null;
  }
}

export function setDismissedUpdate(version: string): void {
  try {
    localStorage.setItem(DISMISS_KEY, normalizeVersion(version));
  } catch {
    /* ignore quota / private mode */
  }
}

// Runnable self-check: `npx tsx src/appUpdate.ts`
declare const process: { argv: string[] } | undefined;
if (typeof process !== "undefined" && process.argv[1]?.includes("appUpdate")) {
  console.assert(normalizeVersion("v1.2.3") === "1.2.3", "strip v");
  console.assert(isNewer("0.1.1", "0.1.0"), "patch newer");
  console.assert(isNewer("0.2.0", "0.1.9"), "minor newer");
  console.assert(!isNewer("0.1.0", "0.1.0"), "same not newer");
  console.assert(!isNewer("0.1.0", "0.1.1"), "older not newer");
  console.assert(isNewer("1.0", "0.9.9"), "shorter major");

  void (async () => {
    const mockOk: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          tag_name: "v0.2.0",
          html_url: "https://github.com/sanzgrapher/inpost/releases/tag/v0.2.0",
        }),
        { status: 200 },
      );
    const u = await checkForUpdate("0.1.0", { fetchImpl: mockOk });
    console.assert(u?.version === "0.2.0", "detect update");
    const same = await checkForUpdate("0.2.0", { fetchImpl: mockOk });
    console.assert(same === null, "no update when current");
    const dismissed = await checkForUpdate("0.1.0", {
      fetchImpl: mockOk,
      dismissed: "0.2.0",
    });
    console.assert(dismissed === null, "honor dismiss");
    console.log("appUpdate self-check ok");
  })();
}
