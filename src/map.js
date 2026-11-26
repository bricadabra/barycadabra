/**
 * The map: the group, the meeting area, the ranked bars and the trips to the
 * one chosen. MapLibre GL over the hand-written basemap of basemap.js.
 *
 * People and bars are DOM markers (a few dozen at most, each a real button
 * that takes focus); the area and the trips are GeoJSON layers, so the trip
 * times can be drawn along their lines by the map's own label engine.
 *
 * MapLibre is a megabyte: it is imported when the map is built, so the panel
 * paints first.
 */

import { basemapStyle } from "./basemap.js";
import { esc, minutes } from "./html.js";

// The map's half of the theme: app.css colours the pins, this the layers.
const INK = "#1c2029";
const ZONE = "#e0961a"; // the light-background spark

const HOME = { center: [2.4, 46.6], zoom: 4.8 };

let gl = null;
let map = null;
let people = [];
let bars = [];
let loaded = null;

export async function initMap(container) {
  gl = (await import("maplibre-gl")).default;
  await import("maplibre-gl/dist/maplibre-gl.css");
  map = new gl.Map({ container, style: basemapStyle(), ...HOME, attributionControl: { compact: false } });
  map.addControl(new gl.NavigationControl({ showCompass: false }), "top-right");
  loaded = new Promise((resolve) =>
    map.on("load", () => {
      map.addSource("zone", { type: "geojson", data: empty() });
      map.addLayer({
        id: "zone",
        type: "fill",
        source: "zone",
        paint: { "fill-color": ZONE, "fill-opacity": 0.28, "fill-antialias": false },
      });
      map.addSource("area", { type: "geojson", data: empty() });
      map.addLayer({
        id: "area",
        type: "line",
        source: "area",
        paint: { "line-color": INK, "line-width": 1.2, "line-dasharray": [2, 2], "line-opacity": 0.5 },
      });
      map.addSource("trips", { type: "geojson", data: empty() });
      map.addLayer({
        id: "trips",
        type: "line",
        source: "trips",
        layout: { "line-cap": "round" },
        paint: { "line-color": INK, "line-width": 2.5, "line-dasharray": [1, 2] },
      });
      map.addLayer({
        id: "trip-times",
        type: "symbol",
        source: "trips",
        layout: {
          "symbol-placement": "line-center",
          "text-field": ["get", "label"],
          "text-font": ["Noto Sans Bold"],
          "text-size": 13,
          "text-allow-overlap": true,
        },
        paint: { "text-color": INK, "text-halo-color": "#ffffff", "text-halo-width": 2 },
      });
      resolve();
    }),
  );
  // Returned as soon as it exists, not once the basemap has loaded: markers
  // can go on now, layers wait for `loaded`, and a slow tile server must not
  // hold the ranking back.
  return map;
}

const empty = () => ({ type: "FeatureCollection", features: [] });

function pin(className, text, label) {
  const el = document.createElement("button");
  el.type = "button";
  el.className = `pin ${className}`;
  el.textContent = text;
  el.setAttribute("aria-label", label);
  return el;
}

/** The participants, numbered in list order. */
export function showGroup(group) {
  if (!map) return;
  people.forEach((m) => m.remove());
  people = group.map((p, i) =>
    new gl.Marker({ element: pin("pin-person", i + 1, p.name) })
      .setLngLat([p.lng, p.lat])
      .setPopup(new gl.Popup({ offset: 16 }).setHTML(`<strong>${esc(p.name)}</strong><br>${esc(p.label)}`))
      .addTo(map),
  );
}

/** The disc candidates were taken from, or nothing. */
export async function showArea(area) {
  if (!map) return;
  await loaded;
  map.getSource("area").setData(area ? circle(area) : empty());
}

/** The ranked bars; `onPick(index)` when one is clicked. */
export function showBars(list, onPick) {
  if (!map) return;
  bars.forEach((m) => m.remove());
  bars = list.map((v, i) => {
    const el = pin("pin-bar", i + 1, v.name ?? "");
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      onPick(i);
    });
    return new gl.Marker({ element: el }).setLngLat([v.lng, v.lat]).addTo(map);
  });
}

/** The trips from every participant to one bar, timed; or none. */
export async function showTrips(group, venue, index) {
  if (!map) return;
  await loaded;
  bars.forEach((m, i) => m.getElement().classList.toggle("is-picked", i === index));
  const features = venue
    ? group.map((p, i) => ({
        type: "Feature",
        properties: { label: minutes(venue.minutes[i]) },
        geometry: { type: "LineString", coordinates: arc([p.lng, p.lat], [venue.lng, venue.lat]) },
      }))
    : [];
  map.getSource("trips").setData({ type: "FeatureCollection", features });
}

/** Frame a set of `{ lat, lng }` points. */
export function frame(points) {
  if (!map || !points.length) return;
  const b = new gl.LngLatBounds();
  points.forEach((p) => b.extend([p.lng, p.lat]));
  map.fitBounds(b, { padding: 60, maxZoom: 15, duration: 600 });
}

// A gentle curve rather than a straight line: the trip is an estimate, and a
// ruler-straight segment would claim a route it does not know.
function arc([x1, y1], [x2, y2]) {
  const k = 0.15;
  const cx = (x1 + x2) / 2 - (y2 - y1) * k;
  const cy = (y1 + y2) / 2 + (x2 - x1) * k;
  return Array.from({ length: 21 }, (_, i) => {
    const t = i / 20;
    const u = 1 - t;
    return [u * u * x1 + 2 * u * t * cx + t * t * x2, u * u * y1 + 2 * u * t * cy + t * t * y2];
  });
}

function circle({ lat, lng, radiusKm }) {
  const dLat = radiusKm / 111.32;
  const dLng = dLat / Math.cos((lat * Math.PI) / 180);
  const ring = Array.from({ length: 65 }, (_, i) => {
    const a = (i / 64) * 2 * Math.PI;
    return [lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)];
  });
  return { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: ring } };
}


/** The meeting zone (travel.js `meetingZone`), or nothing. */
export async function showZone(geojson) {
  if (!map) return;
  await loaded;
  map.getSource("zone").setData(geojson ?? empty());
}
