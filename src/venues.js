/**
 * The places a group can meet in, from OpenStreetMap.
 *
 * One GeoJSON file on the CDN (its name lives in data.js), one Point feature
 * per place:
 *
 *   properties: { category: "bar" | "cafe" | "restaurant" | "park" | "station",
 *                 id?, osmId?, name, address, city, postcode, website, phone,
 *                 opening_hours }
 *
 * The bars file published so far has no `category` but an OSM `amenity`
 * (bar, pub): it is mapped to one here, so filtering only ever looks at
 * `category`.
 *
 * Loaded once, on the first search, then filtered in memory. Nothing here
 * calls a third-party service.
 */

import { fetchJson, VENUES_FILE } from "./data.js";
import { distanceKm } from "./travel.js";

export const CATEGORIES = ["bar", "cafe", "restaurant", "park", "station"];

const FROM_AMENITY = { bar: "bar", pub: "bar", cafe: "cafe", restaurant: "restaurant" };

export const categoryOf = (p) => (CATEGORIES.includes(p.category) ? p.category : FROM_AMENITY[p.amenity] ?? null);

let venues = null;

export async function loadVenues(load = fetchJson) {
  venues ??= load(VENUES_FILE).then((geojson) =>
    geojson.features
      .map(({ geometry, properties: p }) => ({
        id: String(p.id ?? p.osmId),
        osmId: p.osmId ?? null,
        category: categoryOf(p),
        name: p.name || null,
        address: [p.address, [p.postcode, p.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null,
        website: p.website || null,
        phone: p.phone || null,
        hours: p.opening_hours || null,
        lng: geometry.coordinates[0],
        lat: geometry.coordinates[1],
      }))
      .filter((v) => v.category),
  );
  // A failed download is retried on the next search.
  venues.catch(() => (venues = null));
  return venues;
}

/** The venues of these categories inside a disc `{ lat, lng, radiusKm }`. */
export const venuesIn = (all, area, categories = CATEGORIES) =>
  all.filter((v) => categories.includes(v.category) && distanceKm(area, v) <= area.radiusKm);
