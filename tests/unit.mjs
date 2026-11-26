/**
 * The pure modules: score, travel engine, venues, share link, geocoder
 * parsing. No network, no browser.
 *
 *   pnpm test
 */

import test from "node:test";
import assert from "node:assert/strict";

import { baryScore, rank, tightest } from "../src/score.js";
import { loadTravelData, travelTimes, searchArea, distanceKm, meetingZone } from "../src/travel.js";
import { encodeSession, decodeSession, sanitize, sanitizeWeight, sanitizeCategories } from "../src/session.js";
import { venuesIn, loadVenues, categoryOf } from "../src/venues.js";
import { safeUrl, esc } from "../src/html.js";
import { lookup, covered } from "../src/geocode.js";

// A uniform 30 km/h grid over Rennes, injected instead of downloaded.
const flatGrid = async () => ({
  metadata: { gridSize: 0.02, bounds: { minLon: -5.5, minLat: 41, maxLon: 9.5, maxLat: 51.5 } },
  grid: Object.fromEntries(
    Array.from({ length: 400 }, (_, i) => [`${190 + (i % 20)},${350 + Math.floor(i / 20)}`, 30]),
  ),
});

const rennes = { lat: 48.111, lng: -1.68 };
const east = { lat: 48.111, lng: -1.6 };

test("baryScore: everyone already there is 100", () => {
  assert.equal(baryScore([0, 0, 0]).score, 100);
});

test("baryScore: an even 20 minutes beats 5 and 45", () => {
  assert.ok(baryScore([20, 20]).score > baryScore([5, 45]).score);
});

test("baryScore: gaps are against the mean and sum to zero", () => {
  const { gaps, mean, max } = baryScore([10, 20, 30]);
  assert.equal(mean, 20);
  assert.equal(max, 30);
  assert.deepEqual(gaps, [-10, 0, 10]);
});

test("baryScore: past 66 min only fairness is left, never below 1", () => {
  assert.ok(baryScore([300, 400]).score <= 15);
  assert.equal(baryScore([10, 400]).score, 1);
});

test("rank: best first, closer wins ties", () => {
  const ranked = rank([{ id: "far" }, { id: "near" }, { id: "fair" }], [[50, 50], [5, 5], [20, 20]]);
  assert.deepEqual(ranked.map((r) => r.id), ["near", "fair", "far"]);
});

test("travel: refuses to compute before the data is loaded", () => {
  assert.throws(() => travelTimes([{ ...rennes, mode: "foot" }], [east]), /not loaded/);
});

test("travel: times grow with distance and follow the grid speed", async () => {
  await loadTravelData(["bike"], flatGrid);
  const [[near], [far]] = travelTimes([{ ...rennes, mode: "bike" }], [{ lat: 48.111, lng: -1.67 }, east]);
  assert.ok(far > near);
  // 30 km/h on the straight distance times the medium detour factor.
  const expected = ((distanceKm(rennes, east) * 1.35) / 30) * 60;
  assert.ok(Math.abs(far - expected) < 0.01, `${far} vs ${expected}`);
});

test("travel: a failed download is not cached", async () => {
  await assert.rejects(loadTravelData(["car"], async () => { throw new Error("offline"); }));
  await loadTravelData(["car"], flatGrid);
  assert.equal(travelTimes([{ ...rennes, mode: "car" }], [east]).length, 1);
});

test("searchArea: centred on the group, wide enough for the farthest pair", () => {
  const area = searchArea([rennes, east]);
  assert.ok(Math.abs(area.lng - -1.64) < 1e-9);
  assert.ok(area.radiusKm >= distanceKm(rennes, east) / 2);
  assert.equal(searchArea([rennes, rennes]).radiusKm, 3);
});

test("venuesIn: keeps the disc and the categories asked for", () => {
  const area = { ...rennes, radiusKm: 1 };
  const all = [{ ...rennes, id: 1, category: "bar" }, { ...east, id: 2, category: "bar" }, { ...rennes, id: 3, category: "park" }];
  assert.deepEqual(venuesIn(all, area, ["bar"]).map((v) => v.id), [1]);
  assert.deepEqual(venuesIn(all, area, ["bar", "park"]).map((v) => v.id), [1, 3]);
});

test("venues: category from the pipeline, else mapped from the OSM amenity", async () => {
  const point = (properties) => ({ geometry: { coordinates: [-1.68, 48.11] }, properties });
  const all = await loadVenues(async () => ({
    features: [
      point({ osmId: "1", amenity: "pub" }),
      point({ id: "w2", category: "park", name: "Thabor" }),
      point({ osmId: "3", amenity: "nightclub" }),
    ],
  }));
  assert.deepEqual(all.map((v) => [v.id, v.category]), [["1", "bar"], ["w2", "park"]]);
  assert.equal(categoryOf({ category: "spaceport", amenity: "bar" }), "bar");
});

test("share link: round trip of group, settings and picked place, accents included", () => {
  const session = {
    group: [
      { name: "Zoé", label: "Place Sainte-Anne, Rennes", lat: 48.11469, lng: -1.68034, mode: "bike", max: 20 },
      { name: "Léo", label: "Gare", lat: 48.10353, lng: -1.67228, mode: "foot", max: null },
    ],
    weight: 0.6,
    categories: ["bar", "park"],
    venue: "123456",
  };
  assert.deepEqual(decodeSession(encodeSession(session)), session);
});

test("share link: untrusted input is rebuilt or dropped", () => {
  assert.deepEqual(decodeSession("not base64 at all!"), { group: [], weight: 0.85, categories: ["bar"], venue: null });
  assert.equal(sanitize(["x", "", 91, 0, "car"]), null);
  assert.equal(sanitize(["x", "", "abc", 0, "car"]), null);
  assert.equal(sanitize({ lat: 1, lng: 2 }), null);
  assert.equal(sanitize(["x", "", 1, 2, "rocket"]).mode, "car");
  assert.equal(sanitize(["a".repeat(500), "", 1, 2, "car"]).name.length, 120);
  assert.equal(sanitize(["x", "", 1, 2, "car", 9999]).max, null);
  assert.equal(sanitize(["x", "", 1, 2, "car", "30"]).max, 30);
  assert.equal(sanitizeWeight(7), 0.85);
  assert.equal(sanitizeWeight(0.62), 0.6);
  assert.deepEqual(sanitizeCategories(["casino", "<script>"]), ["bar"]);
});

test("score: the weight moves the balance between proximity and fairness", () => {
  // Fast but uneven against slow but even.
  const uneven = [2, 30];
  const even = [25, 25];
  assert.ok(baryScore(uneven, 1).score > baryScore(even, 1).score);
  assert.ok(baryScore(uneven, 0).score < baryScore(even, 0).score);
  assert.equal(baryScore(even, 0.85).score, baryScore(even).score);
});

test("rank: a time limit is a hard filter; tightest names who blocks", () => {
  const places = [{ id: "a" }, { id: "b" }];
  const times = [[10, 40], [30, 30]];
  assert.deepEqual(rank(places, times, { limits: [null, 35] }).map((r) => r.id), ["b"]);
  assert.deepEqual(rank(places, times, { limits: [5, 35] }), []);
  assert.equal(tightest(times, [5, 35]), 0);
  assert.equal(tightest(times, [null, null]), -1);
});

test("meetingZone: cells where everyone arrives in time, as GeoJSON", async () => {
  await loadTravelData(["bike"], flatGrid);
  const group = [{ ...rennes, mode: "bike" }, { ...east, mode: "bike" }];
  const tight = meetingZone(group, 10);
  const loose = meetingZone(group, 30);
  assert.equal(loose.type, "FeatureCollection");
  assert.ok(loose.features.length > tight.features.length);
  assert.ok(loose.features.every((f) => f.geometry.type === "Polygon" && f.properties.max <= 30));
  assert.equal(meetingZone(group, 1).features.length, 0);
});

test("html: escapes markup and keeps only web links", () => {
  assert.equal(esc(`<img src=x onerror="a">`), "&lt;img src=x onerror=&quot;a&quot;&gt;");
  assert.equal(safeUrl("javascript:alert(1)"), null);
  assert.equal(safeUrl("example.org"), "https://example.org/");
});

test("geocode: autocomplete asks the IGN search, keeps metropolitan France only", async () => {
  const seen = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => {
    seen.push(new URL(url));
    const feature = (label, lng, lat) => ({ geometry: { coordinates: [lng, lat] }, properties: { label } });
    return new Response(JSON.stringify({
      features: [feature("Rennes", -1.68, 48.11), feature("Saint-Denis, La Réunion", 55.45, -20.88), feature("Ajaccio", 8.74, 41.93)],
    }));
  };
  try {
    const places = await lookup("renn", { autocomplete: true });
    assert.deepEqual(places.map((p) => p.label), ["Rennes", "Ajaccio"]);
    assert.equal(seen[0].searchParams.get("autocomplete"), "1");
    assert.equal(seen[0].searchParams.get("q"), "renn");
  } finally {
    globalThis.fetch = real;
  }
  assert.ok(covered({ lat: 43.3, lng: 5.37 }));
  assert.ok(!covered({ lat: 16.24, lng: -61.53 }));
});
