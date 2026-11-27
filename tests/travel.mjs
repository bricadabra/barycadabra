/**
 * The travel engine (src/travel.js, the barycadabra mesh in PMTiles).
 *
 * On a synthetic mesh first: one z8 Web Mercator tile where every edge is the
 * straight line at 50 km/h, coded the way the data pipeline codes it (the few
 * lines below mirror its lib/grid.mjs, which this repository does not have),
 * handed to the engine by a stand-in archive. Then, when the local copy of the
 * CDN is there (.cdn-local), real trips and venues read from the real
 * archives by byte ranges, as a browser would.
 *
 *   pnpm test
 */

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, openSync, readSync, readFileSync } from "node:fs";
import { PMTiles } from "pmtiles";
import * as travel from "../src/travel.js";

// --- the pipeline's coding, mirrored -----------------------------------------------

const TILE = 54;
const STEP = 1.02;
const VMAX = 140;
const EARTH = 40075016.686;
const rad = Math.PI / 180;
const grid = (zoom) => ({ zoom, n: 2 ** zoom * TILE, cellM: Math.round((EARTH * Math.cos(46.5 * rad)) / (2 ** zoom * TILE)) });
const cellLonLat = (g, ix, iy, fx = 0.5, fy = 0.5) => [
  ((ix + fx) / g.n) * 360 - 180,
  Math.atan(Math.sinh(Math.PI * (1 - (2 * (iy + fy)) / g.n))) / rad,
];
const cellMetres = (g, lat) => (EARTH * Math.cos(lat * rad)) / g.n;
function offsets() {
  const out = [];
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (dx || dy) out.push([dx, dy]);
  return out;
}
const baseSeconds = (g, lat, dx, dy, vmax) => Math.max(5, (Math.hypot(dx, dy) * cellMetres(g, lat)) / (vmax / 3.6));
const encode = (seconds, base) => {
  const c = Math.round(Math.log(Math.max(seconds, base) / base) / Math.log(STEP));
  return c > 254 ? 255 : c;
};

// --- a synthetic tile around Rennes -------------------------------------------------

const Z = 8, TX = 126, TY = 88;
const g = grid(Z);
const OFF = offsets();
const K = OFF.length;
const T = TILE;

// A river along column 27 with one bridge, on row 30: no edge crosses it elsewhere.
function tileBytes({ river = false } = {}) {
  const b = new Uint8Array(T * T * (2 + K)).fill(255);
  for (let iy = 0; iy < T; iy++)
    for (let ix = 0; ix < T; ix++) {
      const c = iy * T + ix;
      b[c * 2] = 127;
      b[c * 2 + 1] = 127;
      const lat = cellLonLat(g, TX * T + ix, TY * T + iy, 127 / 254, 127 / 254)[1];
      OFF.forEach(([dx, dy], j) => {
        const jx = ix + dx, jy = iy + dy;
        if (jx < 0 || jy < 0 || jx >= T || jy >= T) return;
        if (river && (ix < 27) !== (jx < 27) && !(iy === 30 && jy === 30)) return;
        b[T * T * 2 + c * K + j] = encode(baseSeconds(g, lat, dx, dy, 50), baseSeconds(g, lat, dx, dy, VMAX));
      });
    }
  return b;
}

const manifest = (maxMinutes = null) => ({
  tile: T,
  modes: {
    car: { file: "mesh-car.pmtiles", zoom: Z, cell_m: g.cellM, access_kmh: 25, detour: 1.3, vmax_kmh: VMAX,
      step: STEP, max_minutes: maxMinutes, reach_km: maxMinutes ? (maxMinutes / 60) * VMAX : null, offsets: OFF },
  },
  venues: { zoom: 10, layer: "venues", categories: {} },
});

// A stand-in archive: the engine only ever asks an archive for z/x/y tiles.
const archiveOf = (bytes) => () => ({
  getZxy: async (z, x, y) => (z === Z && x === TX && y === TY ? { data: bytes.buffer } : undefined),
});

const center = (ix, iy) => {
  const [lng, lat] = cellLonLat(g, TX * T + ix, TY * T + iy, 127 / 254, 127 / 254);
  return { lng, lat };
};

async function setup({ river = false, maxMinutes = null } = {}) {
  travel.resetTravelData();
  const origins = [{ ...center(5, 5), mode: "car" }, { ...center(48, 48), mode: "car" }];
  await travel.loadTravelData(origins, async () => manifest(maxMinutes), archiveOf(tileBytes({ river })));
  return origins;
}

test("engine: straight trips come back at the speed they were coded with", async () => {
  const origins = await setup();
  // Within the window the engine spreads over for one origin (12 cells).
  const to = center(15, 5);
  const [[t]] = travel.travelTimes([origins[0]], [to]);
  const expected = (travel.distanceKm(origins[0], to) / 50) * 60;
  assert.ok(Math.abs(t - expected) / expected < 0.03, `${t} min vs ${expected}`);
});

test("engine: a river without a bridge is a detour", async () => {
  await setup();
  const [[direct]] = travel.travelTimes([{ ...center(22, 35), mode: "car" }], [center(32, 35)]);
  await setup({ river: true });
  const [[around]] = travel.travelTimes([{ ...center(22, 35), mode: "car" }], [center(32, 35)]);
  // Ten cells straight across, or up five rows to the bridge and back: ~1.4×.
  assert.ok(around > 1.3 * direct, `${around} vs ${direct}`);
});

test("engine: beyond the reach of the mode, a trip is Infinity, not a number", async () => {
  const origins = await setup({ maxMinutes: 5 });
  const [[near], [far]] = travel.travelTimes([origins[0]], [center(7, 5), center(50, 50)]);
  assert.ok(Number.isFinite(near) && near < 5);
  assert.equal(far, Infinity);
});

test("engine: times are [point][origin]", async () => {
  const origins = await setup();
  const t = travel.travelTimes(origins, [center(5, 5), center(48, 48), center(25, 25)]);
  assert.equal(t.length, 3);
  assert.equal(t[0].length, 2);
  assert.ok(t[0][0] < t[0][1] && t[1][1] < t[1][0]);
});

test("engine: the search area sits between the two, the zone is reachable by both", async () => {
  const origins = await setup();
  const area = travel.searchArea(origins);
  const mid = { lat: (origins[0].lat + origins[1].lat) / 2, lng: (origins[0].lng + origins[1].lng) / 2 };
  assert.ok(travel.distanceKm(area, mid) < 10, `${travel.distanceKm(area, mid)} km from the middle`);
  const zone = travel.meetingZone(origins, 90);
  assert.equal(zone.type, "FeatureCollection");
  assert.ok(zone.features.length > 0);
  for (const f of zone.features) assert.ok(f.geometry.type === "Polygon" && f.properties.worst <= 90);
  assert.equal(travel.meetingZone(origins, 1).features.length, 0);
});

test("engine: tiles not loaded around a group are an error, not a wrong answer", async () => {
  await setup();
  assert.throws(() => travel.travelTimes([{ lat: 45, lng: 5, mode: "car" }], [{ lat: 45, lng: 5.1 }]), /not loaded/);
});

// --- the real archives, when the local CDN copy is there ---------------------------

const CDN = new URL("../.cdn-local/", import.meta.url).pathname;
const real = existsSync(`${CDN}manifest.json`) && existsSync(`${CDN}mesh-car.pmtiles`);
const json = async (p) => JSON.parse(readFileSync(CDN + p, "utf8"));
const read = { bytes: 0, requests: 0 };
// A PMTiles archive read from disk by byte ranges, counting what a browser
// would have downloaded.
const local = (path) => {
  const fd = openSync(CDN + path, "r");
  return new PMTiles({
    getKey: () => path,
    getBytes: async (offset, length) => {
      const b = Buffer.alloc(length);
      const n = readSync(fd, b, 0, length, offset);
      read.bytes += n;
      read.requests++;
      return { data: b.buffer.slice(b.byteOffset, b.byteOffset + n) };
    },
  });
};

async function realGroup(group) {
  travel.resetTravelData();
  await travel.loadTravelData(group, json, local);
}

test("real mesh: Rennes → Saint-Malo by car close to the router's 59 min", { skip: !real }, async () => {
  const group = [{ lat: 48.1173, lng: -1.6778, mode: "car" }, { lat: 48.6493, lng: -2.0257, mode: "car" }];
  await realGroup(group);
  const t = travel.travelTimes(group, group)[1][0];
  assert.ok(Math.abs(t - 59) / 59 < 0.15, `${t} min`);
});

test("real mesh: two walkers 20 km apart cannot meet on foot", { skip: !real }, async () => {
  const group = [{ lat: 48.8584, lng: 2.347, mode: "foot" }, { lat: 48.8049, lng: 2.1204, mode: "foot" }];
  await realGroup(group);
  const [[a, b]] = travel.travelTimes(group, [{ lat: 48.83, lng: 2.23 }]);
  assert.ok(a === Infinity || b === Infinity, `${a} / ${b}`);
});

test("real mesh: Lyon by car, Grenoble by bike, read by ranges", { skip: !real }, async () => {
  const group = [{ lat: 45.764, lng: 4.8357, mode: "car" }, { lat: 45.1885, lng: 5.7245, mode: "bike" }];
  read.bytes = 0;
  await realGroup(group);
  const area = travel.searchArea(group);
  assert.ok(travel.distanceKm(area, group[1]) < travel.distanceKm(area, group[0]), JSON.stringify(area));
  const [[car, bike]] = travel.travelTimes(group, [area]);
  assert.ok(Number.isFinite(car) && Number.isFinite(bike) && bike <= 99, `${car} / ${bike}`);
  // A few megabytes at most out of 35 for these two archives.
  assert.ok(read.bytes < 4e6, `${read.bytes} bytes read`);
});

test("real venues: bars only, inside the disc, typed OSM ids", { skip: !real }, async () => {
  await realGroup([{ lat: 48.1113, lng: -1.68, mode: "car" }]);
  const area = { lat: 48.1113, lng: -1.68, radiusKm: 1 };
  const bars = await travel.loadVenues(area, ["bar"], local);
  assert.ok(bars.length > 10, `${bars.length} bars`);
  for (const b of bars) {
    assert.equal(b.category, "bar");
    assert.ok(travel.distanceKm(area, b) <= 1);
    assert.match(b.osmId, /^[nwr]\d+$/);
  }
});
