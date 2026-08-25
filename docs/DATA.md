# Generating the offline tile data

The app renders a local vector-tile database (`sonoma.mbtiles`, OpenMapTiles
schema) with MapLibre. This is build-time work done on a desktop (spec §9),
then transferred to the phone once.

## 1. Build `sonoma.mbtiles` with Planetiler

Requires Java 21+. Planetiler downloads the OSM extract for you and clips to
the Sonoma County bounding box:

```bash
curl -L -o planetiler.jar https://github.com/onthegomap/planetiler/releases/latest/download/planetiler.jar
java -Xmx4g -jar planetiler.jar --download --area=norcal --bounds=-123.65,38.05,-122.30,38.90 --output=data/sonoma.mbtiles
```

- `--area=norcal` pulls the Geofabrik Northern California extract (if the id
  isn't recognized, download `norcal-latest.osm.pbf` from
  https://download.geofabrik.de/north-america/us/california.html manually and
  pass `--osm-path=norcal-latest.osm.pbf` instead of `--download --area=…`).
- `--bounds` clips to Sonoma County so the output stays small (roughly tens of
  MB rather than GB).
- Output uses the OpenMapTiles schema, which is what `src/map/style.ts`
  expects (`transportation`, `building`, `place`, … source layers).

## 2. Get the file onto the phone

The app looks for the database at `<app documents>/tiles/sonoma.mbtiles` and
shows a setup screen with a download button when it's missing.

Serve the file from your desktop on the same Wi-Fi network:

```bash
npx serve --cors -l 8080 data
```

Then set `TILE_DOWNLOAD_URL` in [src/config.ts](../src/config.ts) to
`http://<your-desktop-LAN-IP>:8080/sonoma.mbtiles` and tap **Download tiles**
in the app. After that one download, the map is fully offline.

## 3. Labels (optional for now)

Text layers need font glyphs. The style automatically enables labels when a
glyph pack exists on-device at `tiles/fonts/<fontstack>/<range>.pbf` (e.g.
`tiles/fonts/Noto Sans Regular/0-255.pbf`).

Get prebuilt Noto Sans glyphs from the OpenMapTiles fonts release
(https://github.com/openmaptiles/fonts/releases), and copy the
`Noto Sans Regular` folder into the app's `tiles/fonts/` directory. An
in-app download path for fonts is a follow-up task — until then the map
renders unlabeled, which is fine for verifying step 1 of the build order.

## 4. Structures overlay (build-order step 2)

The app looks for building footprints at
`<app documents>/overlays/structures.geojson` — a `FeatureCollection` of
`Polygon`/`MultiPolygon` features, each with:

```json
{ "documented": true, "name": "optional, documented structures only" }
```

`documented: true` means the footprint matched a public record (OSM or
Microsoft Building Footprints); `false` means LiDAR flagged an elevation
signature with no match (spec §4). Until this file exists on-device, the
Structures toggle shows bundled placeholder data (see
[src/overlays/sampleStructures.ts](../src/overlays/sampleStructures.ts)) so
the layer is exercisable before the real pipeline runs — the in-app legend
flags this with a "Sample data" note.

To produce the real file:

1. Run the existing nDSM structure-detection pipeline over the Sonoma County
   LiDAR tile set.
2. Cross-reference detections against OSM building footprints + Microsoft
   Building Footprints to set `documented`.
3. Export as GeoJSON (WGS84) named `structures.geojson`.
4. Copy it to the device at `overlays/structures.geojson` (same manual/Wi-Fi
   transfer approach as the tile database above — an in-app download path
   for overlays, alongside tiles, is a follow-up task).

Only documented structures should carry a `name` — undocumented ones are
never labeled with identifying info (spec §6).

## 5. Roads/trails overlay (build-order step 3)

The app looks for road and path data at
`<app documents>/overlays/roads.geojson` — a `FeatureCollection` of
`LineString` features carrying **raw** cross-reference fields, not a
precomputed color. Classification into the five spec categories (green/
yellow/red from §5, purple/pink from §15) happens on-device in
[src/overlays/roadClassification.ts](../src/overlays/roadClassification.ts),
so the rule lives in one inspectable place rather than being baked into a
pipeline export. Two feature shapes, one per property set:

```json
{ "source": "osm", "access": "public", "protectedLand": false, "name": "optional, public roads only" }
{ "source": "lidar", "widthMeters": 2.4 }
```

- **`source: "osm"`** — a road with OSM tag data. `access` is `"public"`,
  `"private"`, or `"unknown"` (present in OSM but no resolvable access tag —
  treated the same as private, per spec §5's "no public data" clause).
  `protectedLand` is set by cross-referencing national forest / protected-
  land boundaries against the road geometry.
- **`source: "lidar"`** — a LiDAR-detected cleared path with no OSM match.
  `widthMeters` is the measured cleared width; the app buckets it into
  hiking trail (<1m, purple), ATV trail (1–3m, pink), or drivable-but-
  unclassified (3m+, red) per spec §15.

**Priority rule (confirmed)**: `roadClassification.ts` resolves the spec §5
green/yellow/red split as private/unknown access → red; else protected land
→ yellow; else green. Private beats protected-land beats public. This
ordering is settled, not a placeholder.

What's still open per spec §10 is upstream of that rule: which raw OSM tags
should populate the `access`/`protectedLand` fields for a given Sonoma
County road (e.g. which `boundary=protected_area`/`operator=USFS`/access
tags qualify). That's a pipeline task — refine the OSM cross-reference logic
in step 2 below once real tag coverage for the region has been reviewed;
`roadClassification.ts` itself doesn't need to change for that.

To produce the real file:

1. Run LiDAR road extraction (flat, linear cleared paths) over the Sonoma
   County tile set, recording cleared width per segment (spec §9 step 3).
2. Cross-reference against OSM road tags; where a match exists, emit an
   `osm`-sourced feature with `access`/`protectedLand`/`name` instead of a
   `lidar`-sourced one.
3. Export as GeoJSON (WGS84) named `roads.geojson`.
4. Copy it to the device at `overlays/roads.geojson` (same manual/Wi-Fi
   transfer approach as the tile database above).

Until this file exists on-device, the Roads & Trails toggle shows bundled
placeholder data covering all five categories (see
[src/overlays/sampleRoads.ts](../src/overlays/sampleRoads.ts)) — the in-app
legend flags this with a "Sample data" note. Only the drivable band (green/
yellow/red) feeds the routing graph (§7 below); purple/pink trails are
display-only per spec §15 and are never part of a computed route.

## 6. Parcels overlay (spec §4)

The app looks for parcel boundaries at
`<app documents>/overlays/parcels.geojson` — a `FeatureCollection` of
`Polygon`/`MultiPolygon` features:

```json
{ "apn": "123-456-789", "zoning": "RR (Rural Residential)", "acres": 4.8, "resourceExtraction": false }
```

No owner name field exists in this schema at all — the county's own public
"Parcels Public" layer already excludes it (CPRA privacy restriction), so
there's nothing for the app to filter out. `acres` should come straight from
the county's own acreage field rather than being computed from geometry,
which needs a proper geodesic area calculation to be trustworthy over WGS84
degree coordinates — not something to improvise. `resourceExtraction` is set
by cross-referencing the county's Zoning and Land Use layer (timber
preserve, mineral resource, and similar codes) against parcel boundaries —
same pipeline-computes-it-once pattern as structures' `documented` flag.

To produce the real file:

1. Download the "Parcels Public" layer from gis.sonomacounty.ca.gov as
   GeoJSON/shapefile.
2. Confirm the export actually has `zoning` and `APN`/acreage fields present
   before building against it (spec §4 calls this out explicitly).
3. Cross-reference against the Zoning and Land Use layer to set
   `resourceExtraction` for timber/mining/milling parcels.
4. Export as GeoJSON (WGS84) named `parcels.geojson`.
5. Copy it to the device at `overlays/parcels.geojson`.

Until this file exists on-device, the Parcels toggle shows bundled
placeholder data (see
[src/overlays/sampleParcels.ts](../src/overlays/sampleParcels.ts)) — tap any
parcel to see the info card (APN, acreage, zoning) that real data will
populate the same way.

### Why this overlay failed before (spec §10), and how to avoid it at scale

The spec flags that a parcel layer "previously failed to load/render
reliably" in an earlier project. The most likely cause at true Sonoma County
scale: the county's full parcel layer is well over 100,000 features. Loading
that as one flat GeoJSON file — parsed synchronously into a single JS object
and handed to one `GeoJSONSource`, which is what
[src/overlays/parcelsStore.ts](../src/overlays/parcelsStore.ts) does today —
is exactly the kind of thing that stalls or OOMs a phone, and would silently
render nothing if the parse or the source ever failed. That code path is
correct and safe for a moderate export (a sub-region, or the bundled
sample), but isn't the one to point at the full county.

For the full county-wide export, don't ship it as GeoJSON at all: pre-tile
it into vector tiles the same way `sonoma.mbtiles` already works reliably
(step 1 above) — `tippecanoe` is the standard tool for this:

```bash
tippecanoe -o data/parcels.mbtiles -l parcels -Z10 -z16 --drop-densest-as-needed parcels.geojson
```

Then swap `ParcelsOverlay`'s `GeoJSONSource` for a `VectorSource` pointed at
`mbtiles://.../parcels.mbtiles`, matching the pattern in
[src/map/style.ts](../src/map/style.ts). MapLibre streams vector tiles by
viewport instead of parsing the whole dataset up front, which is the actual
fix for the reliability problem — not just a smaller minzoom.

## 7. On-device routing (spec §7)

### Why this isn't literally Valhalla or GraphHopper

The spec calls for "Valhalla or GraphHopper (compiled binary + local data
extract)". Both are compiled C++/Java engines — there's no Expo/React
Native module for either (confirmed: the only JS packages for Valhalla are
either Node native addons, which can't run inside Hermes/JSC on a phone, or
HTTP clients that call a remote server, which fails the "no live server
calls" requirement outright). Getting a real one running on-device means
writing a custom native module — a Swift/Kotlin bridge around a compiled
routing engine — which needs an Xcode/Android NDK toolchain to build and
test that this project's environment doesn't have. That's not a config gap;
it's genuine native-mobile engineering, comparable in scope to what
Organic Maps or OsmAnd did to embed these engines.

What's implemented instead is a real, working, on-device graph router in
plain TypeScript — [src/routing/](../src/routing/) — that satisfies the
spec's *functional* requirements (fully offline, on-device, no server
calls, turn-by-turn shortest path) without a compiled binary:

- [graph.ts](../src/routing/graph.ts) builds a routing graph from the same
  classified road/trail data the Roads overlay already renders, keeping
  only green/yellow/red (drivable) features — purple/pink trails never
  become graph edges, per spec §15's "only paths meeting the drivable-road
  width threshold are eligible for turn-by-turn routing".
- [pathfinding.ts](../src/routing/pathfinding.ts) is A* with a binary-heap
  priority queue (not a naive linear scan — sized for a real regional
  graph, not just the sample data).
- [router.ts](../src/routing/router.ts) snaps both endpoints to the nearest
  point on the network and assembles the result; a snap more than 20m away
  is reported as a separate off-network leg (distance + compass bearing)
  rather than silently folded into the route — the spec §16 fallback.

**No separate graph-extract file or pipeline step exists for this** —
unlike the spec's "pre-built graph extract" framing, the graph is built
in-memory from `overlays/roads.geojson` (step 5 above) each time the app
loads it, via `buildRoutingGraph()`. Getting that file right (step 5) *is*
the pipeline work routing depends on; there's nothing additional to export.

### Migrating to a real native engine later

If a compiled Valhalla or GraphHopper engine is worth the investment later,
the pipeline side is the same either way — building tiles from OSM +
the extracted road network is exactly what `valhalla_build_tiles` (or
GraphHopper's graph importer) does from a `.osm.pbf` extract, run once on
a desktop, output copied to the device like every other overlay here. The
work that's specific to going native is entirely inside `src/routing/`:
swap `computeRoute()`'s implementation for calls into a custom Expo Modules
API native module wrapping the compiled engine, while leaving
`RouteResult`'s shape (and everything in `src/map/RouteOverlay.tsx` /
`src/screens/RoutePanel.tsx` that consumes it) unchanged.

### Verifying this without a device

`src/routing/` has zero React Native or native dependencies — it's pure
graph algorithms — so it can be exercised directly under Node with `tsx`,
independent of the app. That's how the pathfinding, the disconnected-graph
case, and the off-network fallback were actually verified for this change,
not just type-checked.

## Later pipeline stages (not needed for basic rendering)

- Satellite + LiDAR hillshade base layers: raster MBTiles, same delivery path.
- Offline search index: OSM place/address/POI names for Sonoma County, built
  at pipeline time and bundled on-device (spec §16) — tap-to-pin routing is
  already in (long-press on the map); text search over named places is what
  remains from spec §16.
