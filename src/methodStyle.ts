/** Shared method label/color helpers for tree + search. */

export function methodClass(m: string) {
  return `method method-${m.toLowerCase()}`;
}

/** Requestly-style short method labels. */
export function methodLabel(m: string) {
  const u = m.toUpperCase();
  if (u === "DELETE") return "DEL";
  if (u === "OPTIONS") return "OPT";
  if (u === "WS" || u === "WEBSOCKET") return "WS";
  return u;
}
