/**
 * Where the data comes from: bricadabra/barycadabra-cdn, served by GitHub Pages
 * next to the application (same origin in production, so no CORS question) and
 * produced by a separate pipeline. The dev server reads the local copy in
 * `.cdn-local/` (served by Vite itself) until that repository exists;
 * `VITE_CDN` points anywhere else:
 *
 *   VITE_CDN=http://localhost:4000 pnpm build
 *
 * The files themselves are described where they are read: venues in
 * venues.js, travel data in travel.js.
 */

export const CDN = import.meta.env?.VITE_CDN
  ?? (import.meta.env?.DEV ? "/.cdn-local" : "https://bricadabra.github.io/barycadabra-cdn");

/**
 * Fetch a JSON file, gzipped or not.
 *
 * The same .gz file arrives differently depending on the host: GitHub Pages
 * sends the raw gzip bytes, a Vite server sends `Content-Encoding: gzip` and the
 * browser has already inflated it. Sniffing the gzip magic number works for
 * both; the native DecompressionStream does the rest, so no library is needed.
 */
export async function fetchJson(path) {
  const response = await fetch(`${CDN}/${path}`);
  if (!response.ok) throw new Error(`${path} → HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return JSON.parse(new TextDecoder().decode(bytes));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return JSON.parse(await new Response(stream).text());
}

/**
 * The file of places to meet in. The pipeline will publish every category in
 * one `venues-*.geojson.gz`; until then the bars file stands in. Only this
 * line knows the name.
 */
export const VENUES_FILE = "bars-france.geojson.gz";
