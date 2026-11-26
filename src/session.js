/**
 * A search, as a share link: `?s=<base64url of JSON>`. Pure.
 *
 *   { g: [[name, label, lat, lng, mode, max], …],   the group
 *     w: 85,                                         proximity weight, %
 *     c: ["bar"],                                    place categories
 *     v: "123" }                                     the place picked, if any
 *
 * Coordinates go to five decimals (a metre); `max` is a person's time limit in
 * minutes, or null. UTF-8 is encoded before base64, so a name with an accent
 * survives the trip — plain `btoa` throws on it.
 *
 * An incoming link is untrusted input: every field is rebuilt from validated
 * values only — finite coordinates in range, bounded text, known modes and
 * categories, bounded numbers — and anything else falls back to a default or
 * is dropped. Rendering escapes text on top of that.
 */

import { MODES } from "./travel.js";
import { CATEGORIES } from "./venues.js";
import { DEFAULT_WEIGHT } from "./score.js";

export const MAX_PARTICIPANTS = 20;
const MAX_TEXT = 120;
export const LIMIT_RANGE = [5, 240]; // a time limit, in minutes

const round = (x) => Math.round(x * 1e5) / 1e5;

export const toRow = (p) => [p.name, p.label, round(p.lat), round(p.lng), p.mode, p.max ?? null];

export function encodeSession({ group, weight, categories, venue }) {
  const json = JSON.stringify({ g: group.map(toRow), w: Math.round(weight * 100), c: categories, v: venue ?? undefined });
  const binary = String.fromCharCode(...new TextEncoder().encode(json));
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

/** Rebuild a search from a link; the group is [] for anything unreadable. */
export function decodeSession(token) {
  let data = null;
  try {
    const binary = atob(token.replaceAll("-", "+").replaceAll("_", "/"));
    data = JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0))));
  } catch {
    /* falls through to the defaults */
  }
  const rows = Array.isArray(data?.g) ? data.g : [];
  return {
    group: rows.slice(0, MAX_PARTICIPANTS).map(sanitize).filter(Boolean),
    weight: sanitizeWeight(Number(data?.w) / 100),
    categories: sanitizeCategories(data?.c),
    venue: typeof data?.v === "string" ? data.v.slice(0, 40) : null,
  };
}

/** One participant from untrusted fields, or null. */
export function sanitize(row) {
  if (!Array.isArray(row)) return null;
  const [name, label, lat, lng, mode, max] = row;
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || la < -90 || la > 90) return null;
  if (!Number.isFinite(ln) || ln < -180 || ln > 180) return null;
  return {
    name: String(name ?? "").slice(0, MAX_TEXT) || "?",
    label: String(label ?? "").slice(0, MAX_TEXT),
    lat: la,
    lng: ln,
    mode: MODES.includes(mode) ? mode : "car",
    max: sanitizeLimit(max),
  };
}

/** A time limit in whole minutes within LIMIT_RANGE, or null for none. */
export function sanitizeLimit(value) {
  if (value == null || value === "") return null;
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n >= LIMIT_RANGE[0] && n <= LIMIT_RANGE[1] ? n : null;
}

/** A proximity weight in [0, 1], by steps of 5 %. */
export function sanitizeWeight(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? Math.round(n * 20) / 20 : DEFAULT_WEIGHT;
}

/** Known categories only, at least one. */
export function sanitizeCategories(value) {
  const list = Array.isArray(value) ? CATEGORIES.filter((c) => value.includes(c)) : [];
  return list.length ? list : ["bar"];
}
