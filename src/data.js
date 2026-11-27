/**
 * Where the data comes from: bricadabra/barycadabra-cdn, served by GitHub Pages
 * next to the application (same origin in production, so no CORS question) and
 * produced by a separate pipeline: manifest.json and PMTiles archives read by
 * HTTP range requests (travel.js). The dev server reads the local copy
 * `.cdn-local`, served at /cdn-local by vite.config.js with range support;
 * `VITE_CDN` points anywhere else, at build time:
 *
 *   VITE_CDN=/cdn-local pnpm build && pnpm preview
 */

// In dev, vite.config.js sets VITE_CDN=/cdn-local when the local copy exists.
export const CDN = import.meta.env?.VITE_CDN ?? "https://bricadabra.github.io/barycadabra-cdn";

/**
 * Fetch a JSON file (manifest.json), gzipped or not.
 *
 * A .gz file arrives differently depending on the host: GitHub Pages sends the
 * raw gzip bytes, some servers send `Content-Encoding: gzip` and the browser
 * has already inflated it. Sniffing the gzip magic number works for both; the
 * native DecompressionStream does the rest, so no library is needed.
 */
export async function fetchJson(path) {
  const response = await fetch(`${CDN}/${path}`);
  if (!response.ok) throw new Error(`${path} → HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return JSON.parse(new TextDecoder().decode(bytes));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return JSON.parse(await new Response(stream).text());
}
