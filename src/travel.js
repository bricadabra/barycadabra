/**
 * The travel engine: the one module that knows how long a trip takes and where
 * a fair meeting place is to be looked for. Pure — no DOM, no state outside its
 * data cache — so the data pipeline can replace the method without touching
 * the interface.
 *
 * Interface
 * ---------
 *   MODES                          ["car", "bike", "foot"]
 *
 *   loadTravelData(modes, load?)   Promise<void>. Fetches what the engine needs
 *                                  for these modes, once per mode. `load(path)`
 *                                  resolves a CDN file to JSON; it defaults to
 *                                  data.js `fetchJson` and tests inject their own.
 *
 *   travelTimes(origins, points)   number[][], in minutes: `times[p][o]` is the
 *                                  trip from origin o to point p.
 *                                    origins  [{ lat, lng, mode }]
 *                                    points   [{ lat, lng }]
 *                                  The modes of `origins` must have been loaded.
 *
 *   searchArea(origins)            { lat, lng, radiusKm }: the disc in which
 *                                  candidate places are scored.
 *
 *   meetingZone(origins, maxMinutes)  GeoJSON FeatureCollection of the cells
 *                                  where every origin arrives within
 *                                  maxMinutes (Polygon features, property
 *                                  `max` = longest trip in minutes).
 *
 * Current method: speed grid
 * --------------------------
 * `routing-grid-<mode>.json.gz` holds an average road speed per grid cell:
 *
 *   { metadata: { gridSize, bounds: { minLon, minLat, maxLon, maxLat } },
 *     grid: { "<x>,<y>": km/h } }
 *
 * where x = floor((lon - minLon) / gridSize), y likewise on latitude. The
 * straight line is sampled through the grid, the mean speed applied to the
 * straight distance corrected by a detour factor. No routing service is
 * called. The search area is the centroid of the group, wide enough to hold
 * the farthest pair.
 */

import { fetchJson } from "./data.js";

export const MODES = ["car", "bike", "foot"];

// Used where the grid has no road at all, and outside it.
const DEFAULT_SPEED = { car: 60, bike: 15, foot: 5 };

// Straight lines underestimate roads, less so on long trips.
const DETOUR = {
  car: [1.5, 1.3, 1.2],
  bike: [1.45, 1.35, 1.25],
  foot: [1.35, 1.25, 1.15],
};

const grids = new Map(); // mode -> grid, once loaded
const pending = new Map(); // mode -> Promise, while loading

export function loadTravelData(modes, load = fetchJson) {
  return Promise.all(
    [...new Set(modes)].filter((mode) => !grids.has(mode)).map((mode) => {
      if (!pending.has(mode)) {
        pending.set(
          mode,
          load(`routing-grid-${mode}.json.gz`)
            .then((data) => {
              const { gridSize, bounds } = data.metadata ?? {};
              if (!data.grid || !gridSize || !bounds) throw new Error(`routing-grid-${mode}: no metadata`);
              grids.set(mode, { cells: data.grid, gridSize, bounds });
            })
            // A failed download is retried next time, not cached.
            .finally(() => pending.delete(mode)),
        );
      }
      return pending.get(mode);
    }),
  ).then(() => {});
}

function gridOf(mode) {
  const grid = grids.get(mode);
  if (!grid) throw new Error(`travel data for "${mode}" is not loaded`);
  return grid;
}

/** Great-circle distance in km. */
export function distanceKm(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function cellSpeed(grid, lng, lat, fallback) {
  const x = Math.floor((lng - grid.bounds.minLon) / grid.gridSize);
  const y = Math.floor((lat - grid.bounds.minLat) / grid.gridSize);
  const own = grid.cells[`${x},${y}`];
  if (own) return own;
  // No road in this cell: the mean of its neighbours, then the mode default.
  let sum = 0;
  let n = 0;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const s = grid.cells[`${x + dx},${y + dy}`];
      if (s) { sum += s; n++; }
    }
  }
  return n ? sum / n : fallback;
}

function tripMinutes(from, to, mode) {
  const grid = gridOf(mode);
  const straight = distanceKm(from, to);
  const samples = Math.max(8, Math.ceil(straight * 3));
  let speed = 0;
  let weight = 0;
  for (let i = 0; i < samples; i++) {
    const t = i / (samples - 1);
    // The ends carry the local street speed at each end: weigh them more.
    const w = i === 0 || i === samples - 1 ? 1.5 : 1;
    speed += w * cellSpeed(grid, from.lng + (to.lng - from.lng) * t, from.lat + (to.lat - from.lat) * t, DEFAULT_SPEED[mode]);
    weight += w;
  }
  const [short, medium, long] = DETOUR[mode];
  const detour = straight < 2 ? short : straight < 10 ? medium : long;
  return ((straight * detour) / (speed / weight)) * 60;
}

export function travelTimes(origins, points) {
  return points.map((p) => origins.map((o) => tripMinutes(o, p, o.mode)));
}

export function searchArea(origins) {
  const lat = origins.reduce((s, o) => s + o.lat, 0) / origins.length;
  const lng = origins.reduce((s, o) => s + o.lng, 0) / origins.length;
  let widest = 0;
  for (let i = 0; i < origins.length; i++) {
    for (let j = i + 1; j < origins.length; j++) widest = Math.max(widest, distanceKm(origins[i], origins[j]));
  }
  return { lat, lng, radiusKm: Math.max(3, widest / 2 + 2) };
}

/**
 * The meeting zone: the cells where everyone arrives within `maxMinutes`, as
 * a GeoJSON FeatureCollection of square cell polygons (property `max`, the
 * longest trip to the cell centre, in minutes).
 *
 * Interim version on the speed grid: the search disc is cut into at most
 * 60 × 60 cells and every centre timed like a place. The meshed engine of the
 * data pipeline will return the same shape from its own cells.
 */
export function meetingZone(origins, maxMinutes) {
  const area = searchArea(origins);
  const dLat = area.radiusKm / 111.32;
  const dLng = dLat / Math.cos((area.lat * Math.PI) / 180);
  const step = (2 * dLat) / 60;
  const stepLng = (step * dLng) / dLat;
  const centres = [];
  for (let lat = area.lat - dLat + step / 2; lat < area.lat + dLat; lat += step) {
    for (let lng = area.lng - dLng + stepLng / 2; lng < area.lng + dLng; lng += stepLng) {
      if (distanceKm(area, { lat, lng }) <= area.radiusKm) centres.push({ lat, lng });
    }
  }
  const times = travelTimes(origins, centres);
  const features = [];
  centres.forEach((c, i) => {
    const max = Math.max(...times[i]);
    if (max > maxMinutes) return;
    const [w, e, s, n] = [c.lng - stepLng / 2, c.lng + stepLng / 2, c.lat - step / 2, c.lat + step / 2];
    features.push({
      type: "Feature",
      properties: { max: Math.round(max) },
      geometry: { type: "Polygon", coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] },
    });
  });
  return { type: "FeatureCollection", features };
}
