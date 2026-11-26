/**
 * Links out, for when an estimate is not enough: turn-by-turn directions and
 * the venue's own page. Pure: coordinates and names in, URLs out.
 */

const GOOGLE_MODE = { car: "driving", bike: "bicycling", foot: "walking" };

export const directionsUrl = (from, to, mode) =>
  `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lng}` +
  `&destination=${to.lat},${to.lng}&travelmode=${GOOGLE_MODE[mode] ?? "driving"}`;

export const osmUrl = (osmId) => `https://www.openstreetmap.org/node/${encodeURIComponent(osmId)}`;

export const searchUrl = (venue) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    [venue.name, venue.address].filter(Boolean).join(" ") || `${venue.lat},${venue.lng}`,
  )}`;
