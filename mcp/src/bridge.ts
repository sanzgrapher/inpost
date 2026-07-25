import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type Session = { bridgeUrl: string; token: string };

function mcpRoot(): string {
  try {
    return dirname(fileURLToPath(import.meta.url));
  } catch {
    return dirname(process.argv[1] ?? ".");
  }
}

export function loadSession(): Session {
  if (process.env.BRIDGE_URL && process.env.BRIDGE_TOKEN) {
    return {
      bridgeUrl: process.env.BRIDGE_URL,
      token: process.env.BRIDGE_TOKEN,
    };
  }
  const path = join(mcpRoot(), "session.json");
  if (!existsSync(path)) {
    throw new Error(
      `Desktop app is not running (missing ${path}). Launch Inpost, then retry.`,
    );
  }
  const raw = JSON.parse(readFileSync(path, "utf8")) as Session;
  if (!raw.bridgeUrl || !raw.token) {
    throw new Error("Invalid session.json — restart Inpost.");
  }
  return raw;
}

export async function bridge<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const session = loadSession();
  const res = await fetch(`${session.bridgeUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${session.token}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const err =
      data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : text || res.statusText;
    throw new Error(err);
  }
  return data as T;
}

export function toolText(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text:
          typeof data === "string" ? data : JSON.stringify(data, null, 2),
      },
    ],
  };
}
