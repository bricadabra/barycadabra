# Barycadabra

The place that is fair to everyone. Each person gives where they start from
and how they travel — car, bike or on foot — and the bars, cafés,
restaurants, parks and stations of metropolitan France are ranked by how long
the trips are and how even they are. No account, no server, no routing
service: the group stays in your browser, the data is static files in
[barycadabra-cdn](https://github.com/bricadabra/barycadabra-cdn).

**→ <https://bricadabra.github.io/barycadabra/>** · a [Bricadabra](https://github.com/bricadabra) project

## Run it

```bash
pnpm install
pnpm dev        # http://localhost:3000
pnpm test       # pure modules and the travel engine, no network
pnpm build
```

`pnpm dev` reads the data from `.cdn-local` when it exists (a local copy of
the CDN, ignored by git; served at `/cdn-local` by Vite itself, files as they
are on disk). A build reads the published data, or `VITE_CDN=<url>` at build
time; `VITE_CDN=/cdn-local pnpm build && pnpm preview` serves the local copy
too. `pnpm test:smoke` drives the built site in Chrome (see
`tests/smoke.mjs`).

Push to `main` publishes to GitHub Pages.

## Using it

- **Addresses** complete as you type (IGN Géoplateforme geocoder, France
  only); arrows and Enter pick one, and picking adds the person.
- **Where to meet**: one or more kinds of place.
- **Proximity ↔ fairness**: the weight of the BaryScore (85 / 15 by default).
- **Max time** per person, optional: any place beyond it is left out.
- **Meeting zone**: shades on the map where everyone arrives within 15 to 60
  minutes.
- **Share**: the link carries the group, the settings and the place open; on a
  phone it opens the system share sheet.

## Trip times

The country is cut into cells — 500 m on foot, 1 km by bike, 2 km by car.
Times between cells were measured once, offline, on the OpenStreetMap road
network; the browser spreads them from each person (Dijkstra) and reads the
time to every candidate place (`src/travel.js`). Reach: an hour on foot, an
hour and a half by bike; beyond it a trip is out of reach and the place is
left out. Driving is without traffic. Close enough to compare places, not to
leave on time — each place links to real directions.

## The data

From `CDN` (`src/data.js`): a manifest and eight [PMTiles](https://github.com/protomaps/PMTiles)
archives, read by HTTP range requests — a search fetches a few tiles of a few
archives, never a whole file:

| File | What |
| --- | --- |
| `manifest.json` | tile size; per mode: archive, zoom, edge offsets, decoding, reach; venue zoom, layer, archives and counts |
| `mesh-car.pmtiles`, `mesh-bike.pmtiles`, `mesh-foot.pmtiles` | the mesh of a mode, Web Mercator tiles z8 / z9 / z10, each cut into 54 × 54 cells: anchor positions, then coded edge times (9 to 65 MB) |
| `venues-{bar,cafe,restaurant,park,station}.pmtiles` | the places of a category, vector tiles (layer `venues`, z10): `osmId`, `category`, name, address, website, phone, hours |

A cold search downloads about 0.5 to 1.3 MB (Paris on foot, bars: 545 kB in
8 requests; Lyon by car with Grenoble by bike: 1.3 MB) and computes in about
20 ms. The local server (`vite.config.js`) answers ranges with 206 like
GitHub Pages and never compresses on the fly.

## The BaryScore

0-100 per place: a weighted blend of proximity (the group's mean trip, 100 at
0 min, 0 from 66 min) and fairness (one minus the coefficient of variation of
the trips). Model in `src/score.js`.

## Share links

`?s=…` is base64url JSON. An incoming link is untrusted: every field is
rebuilt from validated values and every text escaped before display.

## Licence

MIT for the code. Places and road network © OpenStreetMap contributors
(ODbL), trip times measured offline with OSRM; basemap
[OpenFreeMap](https://openfreemap.org/) © [OpenMapTiles](https://openmaptiles.org/);
geocoding IGN Géoplateforme (Base Adresse Nationale, Licence Ouverte 2.0);
Manrope (SIL OFL 1.1).
