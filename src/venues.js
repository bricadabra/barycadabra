/**
 * The places a group can meet in, from OpenStreetMap.
 *
 * One PMTiles archive of vector tiles per category on the CDN
 * (`venues-<category>.pmtiles`); travel.js `loadVenues(area, categories)`
 * reads, by HTTP range requests, only the tiles of the categories asked for
 * around the search disc. This module turns its records into what the panel
 * shows. Nothing here calls a third-party service.
 */

import { loadVenues } from "./travel.js";

export const CATEGORIES = ["bar", "cafe", "restaurant", "park", "station"];

/** An engine venue (absent properties omitted) as the panel reads it. */
export const toPlace = (v) => ({
  id: String(v.osmId),
  osmId: v.osmId ?? null,
  category: v.category,
  name: v.name || null,
  address: [v.address, [v.postcode, v.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null,
  website: v.website || null,
  phone: v.phone || null,
  hours: v.opening_hours || null,
  lat: v.lat,
  lng: v.lng,
});

// The last answer, kept: a re-ranking after a settings change (weight, a time
// limit) asks the same disc and categories again, and should not re-download.
let last = { key: null, places: null };

/** The places of these categories inside a disc `{ lat, lng, radiusKm }`. */
export async function placesIn(area, categories) {
  const wanted = CATEGORIES.filter((c) => categories.includes(c));
  const key = JSON.stringify([area.lat, area.lng, area.radiusKm, wanted]);
  if (last.key !== key) last = { key, places: (await loadVenues(area, wanted)).map(toPlace) };
  return last.places;
}
