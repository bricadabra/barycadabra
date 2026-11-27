/**
 * The pure modules: score, venues, share link, links, geocoder parsing (the
 * travel engine has tests/travel.mjs). No network, no browser.
 *
 *   pnpm test
 */

import test from "node:test";
import assert from "node:assert/strict";

import { baryScore, rank, blocker } from "../src/score.js";
import { encodeSession, decodeSession, sanitize, sanitizeWeight, sanitizeCategories } from "../src/session.js";
import { toPlace } from "../src/venues.js";
import { safeUrl, esc } from "../src/html.js";
import { osmUrl } from "../src/links.js";
import { lookup, covered } from "../src/geocode.js";


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

test("venues: an engine record becomes a place, absent fields as null", () => {
  const place = toPlace({ lat: 48.11, lng: -1.68, osmId: "w2", category: "park", name: "Thabor", postcode: "35000", city: "Rennes" });
  assert.deepEqual(place, {
    id: "w2", osmId: "w2", category: "park", name: "Thabor", address: "35000 Rennes",
    website: null, phone: null, hours: null, lat: 48.11, lng: -1.68,
  });
  assert.equal(toPlace({ lat: 0, lng: 0, osmId: "n1", category: "bar", address: "1 rue X" }).address, "1 rue X");
});

test("links: OSM ids name their type", () => {
  assert.equal(osmUrl("n123"), "https://www.openstreetmap.org/node/123");
  assert.equal(osmUrl("w45"), "https://www.openstreetmap.org/way/45");
  assert.equal(osmUrl("r6"), "https://www.openstreetmap.org/relation/6");
  assert.equal(osmUrl("x9"), null);
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

test("rank: out of reach and over a limit are hard filters; blocker says who and why", () => {
  const places = [{ id: "a" }, { id: "b" }];
  const times = [[10, 40], [30, 30]];
  assert.deepEqual(rank(places, times, { limits: [null, 35] }).map((r) => r.id), ["b"]);
  assert.deepEqual(rank(places, times, { limits: [5, 35] }), []);
  assert.deepEqual(blocker(times, [5, 35]), { who: 0, why: "limit" });
  assert.deepEqual(blocker(times, [null, null]), { who: -1, why: null });
  // A walker who cannot reach anything: out of reach, whatever the limits.
  const far = [[12, Infinity], [15, Infinity]];
  assert.deepEqual(rank(places, far), []);
  assert.deepEqual(blocker(far, [null, null]), { who: 1, why: "reach" });
  assert.deepEqual(rank(places, [[12, Infinity], [15, 20]]).map((r) => r.id), ["b"]);
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
