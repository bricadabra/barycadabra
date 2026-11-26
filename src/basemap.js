/**
 * A pale town map that keeps quiet, written by hand from the OpenMapTiles
 * schema OpenFreeMap serves (no key, no quota).
 *
 * The question on screen is "how far is it for each of us", so roads are what
 * the map keeps — graded by class, the big ones first — with water, parks and
 * place names to know where you are. Buildings appear at street level, faint.
 * Everything coloured on top (people, bars, trips) is the application's.
 */

const OFM = "https://tiles.openfreemap.org";

// A MapLibre style is JSON and cannot read a CSS custom property: these values
// are stated here only.
const C = {
  land: "#f3f2ee",
  water: "#d9e3e8",
  park: "#e2e8dc",
  building: "#e7e5df",
  roadMajor: "#ffffff",
  roadCase: "#d6d3cb",
  roadMinor: "#fbfaf7",
  boundary: "#c9c5bb",
  label: "#5d6170",
  halo: "#f3f2ee",
};

const MAJOR = ["motorway", "trunk", "primary"];

export function basemapStyle() {
  return {
    version: 8,
    glyphs: `${OFM}/fonts/{fontstack}/{range}.pbf`,
    sources: {
      basemap: {
        type: "vector",
        url: `${OFM}/planet`,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · ' +
          '<a href="https://openfreemap.org/">OpenFreeMap</a> · ' +
          '<a href="https://openmaptiles.org/">OpenMapTiles</a>',
      },
    },
    layers: [
      { id: "land", type: "background", paint: { "background-color": C.land } },
      {
        id: "park",
        type: "fill",
        source: "basemap",
        "source-layer": "park",
        paint: { "fill-color": C.park },
      },
      {
        id: "wood",
        type: "fill",
        source: "basemap",
        "source-layer": "landcover",
        filter: ["in", ["get", "class"], ["literal", ["wood", "grass"]]],
        paint: { "fill-color": C.park, "fill-opacity": 0.7 },
      },
      {
        id: "water",
        type: "fill",
        source: "basemap",
        "source-layer": "water",
        filter: ["!=", ["get", "brunnel"], "tunnel"],
        paint: { "fill-color": C.water },
      },
      {
        id: "building",
        type: "fill",
        source: "basemap",
        "source-layer": "building",
        minzoom: 14,
        paint: { "fill-color": C.building },
      },
      {
        id: "road-case",
        type: "line",
        source: "basemap",
        "source-layer": "transportation",
        filter: ["in", ["get", "class"], ["literal", [...MAJOR, "secondary"]]],
        minzoom: 6,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": C.roadCase,
          "line-width": ["interpolate", ["linear"], ["zoom"], 6, 1, 12, 4, 16, 12],
        },
      },
      {
        id: "road-minor",
        type: "line",
        source: "basemap",
        "source-layer": "transportation",
        filter: ["in", ["get", "class"], ["literal", ["tertiary", "minor", "service"]]],
        minzoom: 11,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": C.roadCase,
          "line-width": ["interpolate", ["linear"], ["zoom"], 11, 0.4, 16, 5],
        },
      },
      {
        id: "road",
        type: "line",
        source: "basemap",
        "source-layer": "transportation",
        filter: ["in", ["get", "class"], ["literal", [...MAJOR, "secondary"]]],
        minzoom: 6,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": C.roadMajor,
          "line-width": ["interpolate", ["linear"], ["zoom"], 6, 0.5, 12, 2.5, 16, 9],
        },
      },
      {
        id: "boundary",
        type: "line",
        source: "basemap",
        "source-layer": "boundary",
        filter: ["<=", ["get", "admin_level"], 4],
        paint: { "line-color": C.boundary, "line-width": 1, "line-dasharray": [3, 2] },
      },
      {
        id: "road-label",
        type: "symbol",
        source: "basemap",
        "source-layer": "transportation_name",
        minzoom: 14,
        layout: {
          "symbol-placement": "line",
          "text-field": ["get", "name"],
          "text-font": ["Noto Sans Regular"],
          "text-size": 11,
        },
        paint: { "text-color": C.label, "text-halo-color": C.halo, "text-halo-width": 1.2 },
      },
      {
        id: "place",
        type: "symbol",
        source: "basemap",
        "source-layer": "place",
        filter: ["in", ["get", "class"], ["literal", ["city", "town", "village", "suburb", "quarter"]]],
        layout: {
          "text-field": ["coalesce", ["get", "name:fr"], ["get", "name"]],
          "text-font": ["Noto Sans Regular"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 6, 10, 14, 14],
          "text-max-width": 8,
          "text-padding": 6,
        },
        paint: { "text-color": C.label, "text-halo-color": C.halo, "text-halo-width": 1.4 },
      },
    ],
  };
}
