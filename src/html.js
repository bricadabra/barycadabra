/**
 * Escaping, for the modules that build HTML as strings. Venue names, websites
 * and phone numbers come from OpenStreetMap and participants from share links:
 * none of it is the application's own.
 */

export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** An http(s) URL, or null: an OSM `website` tag can hold anything. */
export function safeUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(url.includes("://") ? url : `https://${url}`);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

/** Minutes, rounded, with a non-breaking space (a literal U+00A0) before the unit. */
export const minutes = (m) => `${Math.round(m)} min`;
