/**
 * Local persistence: the group and the settings stay in this browser between
 * visits. No account, no server. Every access is guarded: localStorage throws
 * in private windows and when site data is blocked, and the application works
 * without it. Everything read back goes through the share-link sanitizers.
 */

import { sanitize, sanitizeWeight, sanitizeCategories, toRow } from "./session.js";

const GROUP = "barycadabra.group";
const PREFS = "barycadabra.prefs";

function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null");
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage blocked: kept for this visit only */
  }
}

export function loadGroup() {
  const rows = read(GROUP);
  return Array.isArray(rows) ? rows.map(sanitize).filter(Boolean) : [];
}

export const saveGroup = (group) => write(GROUP, group.map(toRow));

/** `{ weight, categories }` */
export function loadPrefs() {
  const prefs = read(PREFS) ?? {};
  return { weight: sanitizeWeight(prefs.weight), categories: sanitizeCategories(prefs.categories) };
}

export const savePrefs = (prefs) => write(PREFS, prefs);
