# Barycadabra

The place that is fair to everyone. Each person gives where they start from
and how they travel — car, bike or on foot — and the places of metropolitan
France (bars by default; cafés, restaurants, parks and stations as the data
grows) are ranked by how long the trips are and how even they are. No
account, no server: the group stays in your browser, the data is static files
in [barycadabra-cdn](https://github.com/bricadabra/barycadabra-cdn).

**→ <https://bricadabra.github.io/barycadabra/>** · a [Bricadabra](https://github.com/bricadabra) project

## Run it

```bash
pnpm install
pnpm dev        # http://localhost:3000
pnpm test       # pure modules, no network
pnpm build
```

`pnpm dev` reads the data from the local copy in `.cdn-local/` (served by Vite
itself). A build reads the published data, or `VITE_CDN=<url>` at build time, for
instance a copy served by
`pnpm exec vite preview --config /dev/null --outDir <copy> --port 4000`.
`pnpm test:smoke` drives the built site in Chrome (see `tests/smoke.mjs`).

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

## The BaryScore

0-100 per place: a weighted blend of proximity (the group's mean trip, 100 at
0 min, 0 from 66 min) and fairness (one minus the coefficient of variation of
the trips). Model in `src/score.js`.

Trip times are estimates computed in the browser from data precomputed on the
road network, not routing (`src/travel.js`). Close enough to compare places,
not to leave on time — each place links to real directions.

## Share links

`?s=…` is base64url JSON. An incoming link is untrusted: every field is
rebuilt from validated values and every text escaped before display.

## Licence

MIT for the code. Places and road network © OpenStreetMap contributors
(ODbL); basemap [OpenFreeMap](https://openfreemap.org/) ©
[OpenMapTiles](https://openmaptiles.org/); geocoding IGN Géoplateforme (Base
Adresse Nationale, Licence Ouverte 2.0); Manrope (SIL OFL 1.1).
