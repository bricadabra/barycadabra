/**
 * The travel engine: how long a trip takes, and where a group should meet.
 * No DOM, no state outside its data cache.
 *
 * Method: the barycadabra mesh
 * ----------------------------
 * No routing or isochrone service is called. The travel times were measured
 * once, at build time, by a router run on the OpenStreetMap road network
 * (barycadabra-data), and stored as a graph of grid cells: each cell holding a
 * road has an anchor point; edges go from it to the anchors of the cells at
 * fixed offsets, two rings of neighbours plus long hops in 16 directions. Here,
 * a Dijkstra per participant spreads those times over the area around them:
 * rivers without a bridge, motorways and their interchanges, one-way streets
 * are inside the measured times.
 *
 * Interface
 * ---------
 *   MODES                          ["car", "bike", "foot"]
 *
 *   loadTravelData(group, load?, open?)
 *                                  Promise<void>. `group` is the origins
 *                                  [{ lat, lng, mode }] (loads the manifest and
 *                                  the mesh tiles each mode needs: within its
 *                                  reach around its own participants, or the
 *                                  group's extent for unlimited modes), or a
 *                                  list of modes (manifest only). `load(path)`
 *                                  resolves a CDN file to JSON; `open(path)`
 *                                  returns a pmtiles `PMTiles` for a CDN file
 *                                  (default: HTTP range requests). Tests inject
 *                                  their own.
 *
 *   travelTimes(origins, points)   number[][], in minutes: `times[p][o]` is the
 *                                  trip from origin o to point p. Infinity when
 *                                  out of reach (walking > 60 min, cycling > 90:
 *                                  manifest max_minutes, +10 %) — drop the
 *                                  place, do not show a number. On the mesh
 *                                  inside the loaded window and the useful area
 *                                  (mask_km around venues); elsewhere, straight
 *                                  line × detour at 50 / 14 / 4.5 km/h.
 *
 *   searchArea(origins)            { lat, lng, radiusKm }: centred on the best
 *                                  meeting cell, wide enough for every cell
 *                                  nearly as good and for the centroid disc.
 *
 *   meetingZone(origins, maxMinutes)
 *                                  GeoJSON FeatureCollection of the cells every
 *                                  origin reaches within maxMinutes; properties
 *                                  { worst, mean } in minutes.
 *
 *   bestCells(origins, { k, objective, spacing })
 *                                  the k best cells, `spacing` cells apart.
 *
 *   loadVenues(area, categories, open?)
 *                                  Promise<venue[]>: the venues of these
 *                                  categories ("bar", "cafe", "restaurant",
 *                                  "park", "station") inside a disc
 *                                  { lat, lng, radiusKm }. Reads only the tiles
 *                                  of those categories around the disc.
 *                                  venue: { lat, lng, osmId, category, name,
 *                                  address, city, postcode, website, phone,
 *                                  opening_hours } (absent fields omitted).
 *
 *   distanceKm(a, b)               great-circle distance.
 *
 * Files (barycadabra-cdn)
 * -----------------------
 *   manifest.json                  per mode: file, zoom, offsets, vmax, step,
 *                                  reach; venue zoom and files per category
 *   mesh-<mode>.pmtiles            Web Mercator tiles at the mode's zoom, tile
 *                                  type unknown, gzip. Each tile is cut into
 *                                  T×T cells (T = manifest.tile): T²×2 bytes of
 *                                  anchor positions (fx, fy: 0..254 inside the
 *                                  cell, 255 = no anchor), then T²×K bytes of
 *                                  coded edge times, row-major from the north.
 *   venues-<category>.pmtiles      vector tiles (MVT), layer "venues", one zoom.
 *
 * An edge byte c (255 = none) decodes to seconds = base × step^c, base being
 * the straight line between the two anchors at vmax, with the cell's ground
 * size at the latitude of the first anchor, never under 5 s — lib/grid.mjs on
 * the data side.
 */

import { PMTiles } from "pmtiles";
import { VectorTile } from "@mapbox/vector-tile";
import Pbf from "pbf";
import { fetchJson, CDN } from "./data.js";

export const MODES = ["car", "bike", "foot"];

const toRad = Math.PI / 180;
const EARTH = 40075016.686;

/** Great-circle distance in km. */
export function distanceKm(a, b) {
  const h = Math.sin((b.lat - a.lat) * toRad / 2) ** 2
    + Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin((b.lng - a.lng) * toRad / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.sqrt(h));
}

/** A CDN PMTiles archive, read by HTTP range requests. */
export const openPmtiles = (path) => new PMTiles(`${CDN}/${path}`);

// --- data ------------------------------------------------------------------------

let manifest = null;
let pendingManifest = null;
const archives = new Map(); // path -> PMTiles
const tiles = new Map(); // "mode/x_y" -> tile, or null where the mesh has none
const pendingTiles = new Map();

/** Forget everything loaded (tests). */
export function resetTravelData() {
  manifest = null; pendingManifest = null;
  archives.clear(); tiles.clear(); pendingTiles.clear(); fieldCache.clear(); surfaceCache.clear();
}

function archive(path, open) {
  if (!archives.has(path)) archives.set(path, open(path));
  return archives.get(path);
}

async function loadManifest(load) {
  if (!manifest) {
    pendingManifest ??= load("manifest.json").finally(() => (pendingManifest = null));
    manifest = await pendingManifest;
  }
}

export async function loadTravelData(group, load = fetchJson, open = openPmtiles) {
  await loadManifest(load);
  const origins = group.filter((o) => typeof o === "object");
  if (!origins.length) return;
  const T = manifest.tile;
  const jobs = [];
  for (const mode of new Set(origins.map((o) => o.mode))) {
    const s = modeOf(mode);
    const win = windowFor(s, origins, mode);
    const file = archive(s.file, open);
    for (let ty = Math.floor(win.y0 / T); ty <= Math.floor(win.y1 / T); ty++)
      for (let tx = Math.floor(win.x0 / T); tx <= Math.floor(win.x1 / T); tx++) {
        const key = `${mode}/${tx}_${ty}`;
        if (tiles.has(key)) continue;
        if (!pendingTiles.has(key)) {
          pendingTiles.set(key, file.getZxy(s.zoom, tx, ty)
            .then((r) => {
              const b = r && new Uint8Array(r.data);
              tiles.set(key, b ? { rep: b.subarray(0, T * T * 2), codes: b.subarray(T * T * 2) } : null);
            })
            // A failed download is retried next time, not cached.
            .finally(() => pendingTiles.delete(key)));
        }
        jobs.push(pendingTiles.get(key));
      }
  }
  await Promise.all(jobs);
}

function modeOf(mode) {
  if (!manifest) throw new Error("travel data is not loaded");
  const s = manifest.modes[mode];
  if (!s) throw new Error(`no travel data for mode "${mode}"`);
  return s;
}

// Web Mercator, in cells of the mode's grid: x eastwards, y southwards.
const cells = (s) => 2 ** s.zoom * manifest.tile;
const mercator = (s, p) => [
  (p.lng + 180) / 360 * cells(s),
  (1 - Math.log(Math.tan(p.lat * toRad) + 1 / Math.cos(p.lat * toRad)) / Math.PI) / 2 * cells(s),
];
const cellOf = (s, p) => mercator(s, p).map(Math.floor);
const lngLatOf = (s, x, y) => ({
  lng: x / cells(s) * 360 - 180,
  lat: Math.atan(Math.sinh(Math.PI * (1 - 2 * y / cells(s)))) / toRad,
});
// Ground metres per cell at a latitude (Mercator is conformal: square cells).
const cellMetres = (s, lat) => EARTH * Math.cos(lat * toRad) / cells(s);

// The cells a mode's fields cover. A mode with a reach: its own participants
// plus that reach, nothing beyond is ever worth a number. An unlimited mode
// (car): the whole group's extent plus a margin wide enough for the detours
// real trips take (around a bay, to a bridge). From the origins only, so
// loadTravelData and the calculations agree on it.
function windowFor(s, origins, mode) {
  const own = s.reach_km ? origins.filter((o) => o.mode === mode) : origins;
  const xy = own.map((o) => cellOf(s, o));
  const xs = xy.map((c) => c[0]), ys = xy.map((c) => c[1]);
  let margin;
  if (s.reach_km) {
    const lat = Math.max(...own.map((o) => Math.abs(o.lat)));
    margin = Math.ceil(s.reach_km * 1000 / cellMetres(s, lat)) + 2;
  } else {
    const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    margin = Math.max(12, Math.ceil(span * 0.4));
  }
  return { x0: Math.min(...xs) - margin, y0: Math.min(...ys) - margin,
    x1: Math.max(...xs) + margin, y1: Math.max(...ys) + margin };
}

// The window as dense arrays, node n = (iy - y0) * W + (ix - x0).
function gridFor(mode, win) {
  const T = manifest.tile;
  const s = modeOf(mode);
  const K = s.offsets.length;
  const W = win.x1 - win.x0 + 1, H = win.y1 - win.y0 + 1;
  const fx = new Uint8Array(W * H).fill(255), fy = new Uint8Array(W * H);
  const codes = new Array(W * H), at = new Int32Array(W * H);
  for (let ty = Math.floor(win.y0 / T); ty <= Math.floor(win.y1 / T); ty++)
    for (let tx = Math.floor(win.x0 / T); tx <= Math.floor(win.x1 / T); tx++) {
      const key = `${mode}/${tx}_${ty}`;
      if (!tiles.has(key)) throw new Error("travel data around the group is not loaded: call loadTravelData(origins)");
      const t = tiles.get(key);
      if (!t) continue;
      for (let iy = Math.max(win.y0, ty * T); iy <= Math.min(win.y1, ty * T + T - 1); iy++)
        for (let ix = Math.max(win.x0, tx * T); ix <= Math.min(win.x1, tx * T + T - 1); ix++) {
          const c = (iy - ty * T) * T + (ix - tx * T);
          if (t.rep[c * 2] === 255) continue;
          const n = (iy - win.y0) * W + (ix - win.x0);
          fx[n] = t.rep[c * 2]; fy[n] = t.rep[c * 2 + 1];
          codes[n] = t.codes; at[n] = c * K;
        }
    }
  const anchor = (n) => lngLatOf(s, win.x0 + (n % W) + fx[n] / 254, win.y0 + Math.floor(n / W) + fy[n] / 254);
  const node = (ix, iy) => {
    if (ix < win.x0 || ix > win.x1 || iy < win.y0 || iy > win.y1) return -1;
    const n = (iy - win.y0) * W + (ix - win.x0);
    return fx[n] === 255 ? -1 : n;
  };
  return { s, K, win, W, H, fx, fy, codes, at, anchor, node };
}

// Seconds between an exact point and an anchor close by.
const access = (s, a, b) => (distanceKm(a, b) * 1000 * s.detour) / (s.access_kmh / 3.6);

// Dijkstra over the window, from the anchors around one origin.
function spread(g, origin) {
  const { win, s, K, W, H, fx, fy, codes, at, anchor, node } = g;
  const dist = new Float64Array(W * H).fill(Infinity);
  const heap = new Heap();
  const [px, py] = cellOf(s, origin);
  for (let ring = 1; ring <= 3 && heap.size === 0; ring++)
    for (let iy = py - ring; iy <= py + ring; iy++)
      for (let ix = px - ring; ix <= px + ring; ix++) {
        const n = node(ix, iy);
        if (n < 0) continue;
        const d = access(s, origin, anchor(n));
        if (d < dist[n]) { dist[n] = d; heap.push(d, n); }
      }
  // Beyond the mode's reach nothing is worth spreading: stop there.
  const reach = s.max_minutes ? s.max_minutes * 60 * REACH_SLACK : Infinity;
  const pow = Array.from({ length: 255 }, (_, c) => s.step ** c);
  const v = s.vmax_kmh / 3.6;
  const off = s.offsets;
  while (heap.size) {
    const d = heap.topPriority(), n = heap.pop();
    if (d > reach) break;
    if (d > dist[n]) continue;
    const ix = win.x0 + (n % W), iy = win.y0 + Math.floor(n / W);
    const ax = fx[n], ay = fy[n];
    const m0 = cellMetres(s, lngLatOf(s, ix, iy + ay / 254).lat);
    const cs = codes[n], c0 = at[n];
    for (let j = 0; j < K; j++) {
      const code = cs[c0 + j];
      if (code === 255) continue;
      const dx = off[j][0], dy = off[j][1];
      const jx = ix + dx, jy = iy + dy;
      if (jx < win.x0 || jx > win.x1 || jy < win.y0 || jy > win.y1) continue;
      const m = n + dy * W + dx;
      if (fx[m] === 255) continue;
      const base = Math.max(5, Math.hypot(dx + (fx[m] - ax) / 254, dy + (fy[m] - ay) / 254) * m0 / v);
      const nd = d + base * pow[code];
      if (nd < dist[m]) { dist[m] = nd; heap.push(nd, m); }
    }
  }
  return { ...g, dist, origin };
}

// The mesh runs about 5 % slow (ANALYSIS.md): a trip is out of reach only
// past max_minutes plus this slack, or trips just under the limit would be
// turned away (measured: 16 walks in 300 without it).
const REACH_SLACK = 1.1;

// Where the mesh has nothing to say — the origin or the point outside the
// useful area (manifest mask_km around the venues) or outside the group's
// window — the straight line × detour at these speeds (km/h).
const FALLBACK_KMH = { car: 50, bike: 14, foot: 4.5 };

// Minutes from the origin of a field to an exact point: through the best
// anchor around the point, or straight there when it is that close. Infinity
// beyond the mode's reach (manifest max_minutes), or when the mesh holds the
// point but no way to it.
function minutesTo(f, p) {
  const { s, dist, anchor, node, origin } = f;
  const [qx, qy] = cellOf(s, p);
  let best = Infinity;
  for (let iy = qy - 1; iy <= qy + 1; iy++)
    for (let ix = qx - 1; ix <= qx + 1; ix++) {
      const n = node(ix, iy);
      if (n < 0) continue;
      if (dist[n] === Infinity) continue;
      best = Math.min(best, dist[n] + access(s, anchor(n), p));
    }
  const straight = distanceKm(origin, p);
  if (straight * 1000 < 1.5 * s.cell_m) best = Math.min(best, access(s, origin, p));
  // Also when the mesh holds both ends but no way between them (two useful
  // areas apart): a straight line, then the reach decides.
  if (best === Infinity) {
    best = (straight * 1000 * s.detour) / ((FALLBACK_KMH[origin.mode] ?? 30) / 3.6);
  }
  const minutes = best / 60;
  return s.max_minutes && minutes > s.max_minutes * REACH_SLACK ? Infinity : minutes;
}

// One field per origin, cached for the last groups seen: the same group is
// asked for its times, its area and its zone in a row.
const fieldCache = new Map();
function fields(origins) {
  const key = JSON.stringify(origins.map((o) => [o.lat, o.lng, o.mode]));
  if (fieldCache.has(key)) return fieldCache.get(key);
  const grids = new Map();
  const out = origins.map((o) => {
    if (!grids.has(o.mode)) grids.set(o.mode, gridFor(o.mode, windowFor(modeOf(o.mode), origins, o.mode)));
    return spread(grids.get(o.mode), o);
  });
  fieldCache.set(key, out);
  if (fieldCache.size > 8) fieldCache.delete(fieldCache.keys().next().value);
  return out;
}

// --- public API --------------------------------------------------------------------

export function travelTimes(origins, points) {
  const fs = fields(origins);
  return points.map((p) => fs.map((f) => minutesTo(f, p)));
}

/** How a set of travel times (minutes) ranks a meeting point; lower is better. */
export const OBJECTIVES = {
  mean: (t) => t.reduce((a, b) => a + b, 0) / t.length,
  max: (t) => Math.max(...t),
  // Half the average, half the longest trip: nobody is sacrificed to the group.
  fair: (t) => (t.reduce((a, b) => a + b, 0) / t.length + Math.max(...t)) / 2,
};

// Every reachable cell of the coarsest mode in the group, with each origin's
// minutes and the objective. On its own grid a field already holds the time
// to each anchor; only the other modes' fields are asked point by point.
const surfaceCache = new Map();
function surface(origins, objective = "fair") {
  const key = JSON.stringify(origins.map((o) => [o.lat, o.lng, o.mode]));
  const named = typeof objective === "string";
  if (named && surfaceCache.get(key)?.objective === objective) return surfaceCache.get(key).result;
  const score = named ? OBJECTIVES[objective] : objective;
  const fs = fields(origins);
  const coarse = fs.reduce((a, f) => (f.s.cell_m > a.s.cell_m ? f : a));
  const out = [];
  const { win } = coarse;
  for (let iy = win.y0; iy <= win.y1; iy++)
    for (let ix = win.x0; ix <= win.x1; ix++) {
      const n = coarse.node(ix, iy);
      if (n < 0) continue;
      const a = coarse.anchor(n);
      const times = fs.map((f) => (f.s === coarse.s && f.win === win ? f.dist[n] / 60 : minutesTo(f, a)));
      if (times.some((t) => t === Infinity)) continue;
      out.push({ ...a, ix, iy, times, score: score(times) });
    }
  const result = { cells: out, s: coarse.s };
  if (named) {
    surfaceCache.set(key, { objective, result });
    if (surfaceCache.size > 8) surfaceCache.delete(surfaceCache.keys().next().value);
  }
  return result;
}

export function bestCells(origins, { k = 5, objective = "fair", spacing = 2 } = {}) {
  const cells = [...surface(origins, objective).cells].sort((a, b) => a.score - b.score);
  const out = [];
  for (const c of cells) {
    if (out.some((o) => Math.max(Math.abs(o.ix - c.ix), Math.abs(o.iy - c.iy)) < spacing)) continue;
    out.push(c);
    if (out.length === k) break;
  }
  return out;
}

/**
 * The disc in which candidate places are scored: centred on the best cell,
 * wide enough to hold every cell nearly as good — within max(10 min, 30 %) —
 * and the centroid disc Barycentre used. Generous on purpose: every candidate
 * is then ranked on the mesh, so a wider disc costs milliseconds, a narrow one
 * can leave a walking group without its best venue (measured, ANALYSIS.md).
 */
export function searchArea(origins) {
  const { cells } = surface(origins);
  if (!cells.length) return centroidArea(origins);
  const best = cells.reduce((a, c) => (c.score < a.score ? c : a));
  const tolerance = Math.max(10, 0.3 * best.score);
  let radiusKm = 0;
  for (const c of cells) if (c.score <= best.score + tolerance) radiusKm = Math.max(radiusKm, distanceKm(best, c));
  const centroid = centroidArea(origins);
  radiusKm = Math.max(radiusKm + 1, distanceKm(best, centroid) + centroid.radiusKm);
  return { lat: best.lat, lng: best.lng, radiusKm };
}

function centroidArea(origins) {
  const lat = origins.reduce((s, o) => s + o.lat, 0) / origins.length;
  const lng = origins.reduce((s, o) => s + o.lng, 0) / origins.length;
  let widest = 0;
  for (let i = 0; i < origins.length; i++)
    for (let j = i + 1; j < origins.length; j++) widest = Math.max(widest, distanceKm(origins[i], origins[j]));
  return { lat, lng, radiusKm: Math.max(3, widest / 2 + 2) };
}

/** The cells every origin reaches within maxMinutes, as GeoJSON squares. */
export function meetingZone(origins, maxMinutes) {
  const { cells, s } = surface(origins);
  const r1 = (x) => Math.round(x * 10) / 10;
  const r6 = (x) => Math.round(x * 1e6) / 1e6;
  const features = [];
  for (const c of cells) {
    const worst = Math.max(...c.times);
    if (worst > maxMinutes) continue;
    const nw = lngLatOf(s, c.ix, c.iy), se = lngLatOf(s, c.ix + 1, c.iy + 1);
    const w = r6(nw.lng), e = r6(se.lng), so = r6(se.lat), n = r6(nw.lat);
    features.push({
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [[[w, so], [e, so], [e, n], [w, n], [w, so]]] },
      properties: { worst: r1(worst), mean: r1(OBJECTIVES.mean(c.times)) },
    });
  }
  return { type: "FeatureCollection", features };
}

/**
 * The venues of some categories inside a disc { lat, lng, radiusKm }: only
 * the tiles of those categories' archives that the disc touches are read.
 */
export async function loadVenues(area, categories, open = openPmtiles) {
  if (!manifest) throw new Error("travel data is not loaded");
  const v = manifest.venues;
  const z = v.zoom, n = 2 ** z;
  const dLat = area.radiusKm / 110.574, dLng = area.radiusKm / (111.32 * Math.cos(area.lat * toRad));
  const tx = (lng) => Math.floor((lng + 180) / 360 * n);
  const ty = (lat) => Math.floor((1 - Math.log(Math.tan(lat * toRad) + 1 / Math.cos(lat * toRad)) / Math.PI) / 2 * n);
  const jobs = [];
  for (const c of categories) {
    if (!v.categories[c]) continue;
    const file = archive(v.categories[c].file, open);
    for (let y = ty(area.lat + dLat); y <= ty(area.lat - dLat); y++)
      for (let x = tx(area.lng - dLng); x <= tx(area.lng + dLng); x++)
        jobs.push(file.getZxy(z, x, y).then((r) => (r ? decodeVenues(r.data, z, x, y, v.layer) : [])));
  }
  return (await Promise.all(jobs)).flat().filter((p) => distanceKm(area, p) <= area.radiusKm);
}

function decodeVenues(data, z, x, y, layerName) {
  const layer = new VectorTile(new Pbf(new Uint8Array(data))).layers[layerName];
  if (!layer) return [];
  const out = [];
  for (let i = 0; i < layer.length; i++) {
    const f = layer.feature(i);
    const [pt] = f.loadGeometry()[0];
    const wx = (x + pt.x / layer.extent) / 2 ** z, wy = (y + pt.y / layer.extent) / 2 ** z;
    out.push({
      lng: wx * 360 - 180,
      lat: Math.atan(Math.sinh(Math.PI * (1 - 2 * wy))) / toRad,
      ...f.properties,
    });
  }
  return out;
}

// --- binary min-heap, priorities and values in parallel arrays ---------------------

class Heap {
  constructor() { this.p = []; this.v = []; }
  get size() { return this.p.length; }
  topPriority() { return this.p[0]; }
  push(p, v) {
    const { p: P, v: V } = this;
    let i = P.length;
    P.push(p); V.push(v);
    while (i > 0) {
      const j = (i - 1) >> 1;
      if (P[j] <= p) break;
      P[i] = P[j]; V[i] = V[j]; i = j;
    }
    P[i] = p; V[i] = v;
  }
  pop() {
    const { p: P, v: V } = this;
    const top = V[0];
    const lp = P.pop(), lv = V.pop();
    if (P.length) {
      let i = 0;
      const n = P.length;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && P[c + 1] < P[c]) c++;
        if (P[c] >= lp) break;
        P[i] = P[c]; V[i] = V[c]; i = c;
      }
      P[i] = lp; V[i] = lv;
    }
    return top;
  }
}
