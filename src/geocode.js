/**
 * Address to coordinates, with the Géoplateforme geocoder of IGN.
 *
 * The national address base rather than Nominatim: the application covers
 * metropolitan France only, the BAN knows French house numbers better, and the
 * service asks for no key and answers CORS. It is the only service the
 * application calls besides the basemap; what it receives is the address
 * typed, nothing else.
 *
 * One endpoint for both uses: `search` with `autocomplete=1` completes a
 * partial address and answers in the same GeoJSON as a full search, so there
 * is one parser.
 */

const GEOCODER = "https://data.geopf.fr/geocodage/search";

// The extent the data covers (mainland and Corsica). The BAN also knows the
// overseas departments, where there would be no bar to rank.
const COVERAGE = { minLat: 41, maxLat: 51.5, minLng: -5.5, maxLng: 9.6 };

export const covered = ({ lat, lng }) =>
  lat >= COVERAGE.minLat && lat <= COVERAGE.maxLat && lng >= COVERAGE.minLng && lng <= COVERAGE.maxLng;

/** Up to `limit` places `{ lat, lng, label }` for a text, inside coverage. */
export async function lookup(text, { autocomplete = false, limit = 5, signal } = {}) {
  const params = new URLSearchParams({ q: text, limit: String(limit) });
  if (autocomplete) params.set("autocomplete", "1");
  const response = await fetch(`${GEOCODER}?${params}`, { signal });
  if (!response.ok) throw new Error(`geocoder → HTTP ${response.status}`);
  return ((await response.json()).features ?? [])
    .map(({ geometry, properties }) => ({
      lng: geometry.coordinates[0],
      lat: geometry.coordinates[1],
      label: properties.label,
    }))
    .filter(covered);
}

/** Resolve a full address to its best match, or throw. */
export async function geocode(address) {
  const [hit] = await lookup(address, { limit: 1 });
  if (!hit) throw new Error("not found");
  return hit;
}
