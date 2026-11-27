/**
 * Links out, for when an estimate is not enough: turn-by-turn directions and
 * the venue's own page. Pure: coordinates and names in, URLs out.
 */

const GOOGLE_MODE = { car: "driving", bike: "bicycling", foot: "walking" };

export const directionsUrl = (from, to, mode) =>
  `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lng}` +
  `&destination=${to.lat},${to.lng}&travelmode=${GOOGLE_MODE[mode] ?? "driving"}`;

// "n123" | "w123" | "r123" (node, way, relation); a bare number is a node.
const OSM_TYPE = { n: "node", w: "way", r: "relation" };
export function osmUrl(osmId) {
  const [, prefix = "n", id] = /^([nwr]?)(\d+)$/.exec(String(osmId)) ?? [];
  return id ? `https://www.openstreetmap.org/${OSM_TYPE[prefix || "n"]}/${id}` : null;
}

export const searchUrl = (venue) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    [venue.name, venue.address].filter(Boolean).join(" ") || `${venue.lat},${venue.lng}`,
  )}`;
