# Generating the offline tile data

The app renders a local vector-tile database (`sonoma.mbtiles`, OpenMapTiles
schema) with MapLibre. This is build-time work done on a desktop (spec §9),
then transferred to the phone once.

**Real pipeline scripts exist for most of this**, split across two
toolchains for two different environments:

- [pipeline/](../pipeline/) (TypeScript/Node) — fetches from real public
  sources (OSM via Overpass, Sonoma County's own ArcGIS parcels service,
  USGS elevation data). Runs anywhere Node runs, including the sandboxed
  environment this app was otherwise built in.
- [lidar-pipeline/](../lidar-pipeline/) (Python/PDAL) — real LiDAR
  point-cloud processing for undocumented structures and trail-width
  detection. Needs PDAL/GDAL and tens of GB of scratch disk, so it's meant
  to run on your own machine — see its README for install steps.

Each section below is annotated with which one applies (or, for the base
map/satellite/hillshade tiles, which native toolchain neither of these
scripts covers is still needed).

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

**Real data, partially** from [pipeline/fetchStructures.ts](../pipeline/fetchStructures.ts):
real OSM building footprints for the whole county via Overpass — every
`documented: true` structure it produces is real. Confirmed run: 323,040
documented structures (82,474 named), 106.8MB, tiled into a 4×4 grid of
sub-queries since a single whole-county query 504-timed-out (see the
script's header comment).

**`documented: false` (undocumented) structures**: this needs real LiDAR
nDSM elevation-signal analysis, which needs PDAL/GDAL and tens of GB of
scratch disk this sandboxed environment doesn't have —
[lidar-pipeline/02_detect_structures.py](../lidar-pipeline/02_detect_structures.py)
does this for real on your own machine instead: it detects tall, compact,
building-shaped blobs in the LiDAR height-above-ground signal, drops any
that overlap what `fetchStructures.ts` already found (avoiding duplicates),
and appends the rest as `documented: false`. See
[lidar-pipeline/README.md](../lidar-pipeline/README.md) for what to install
and honest limitations (it's a heuristic, not a verified detector — expect
to QA the output before trusting it).

**Confirmed run, real terrain**: `02_detect_structures.py` has been run for
real against actual OpenTopography LiDAR tiles, cross-referenced against
this same `fetchStructures.ts` output. Downtown Santa Rosa (flat, mixed
built-up) and Trione-Annadel State Park (real hill/forest terrain) both
tested directly. The park result is the important honest finding: 2,258
raw candidates over 14 tiles (~5.6 km²), 1,192 of them not overlapping any
OSM footprint — almost certainly overwhelmingly dense tree canopy reading
as building-shaped, not real undocumented structures, exactly the
vegetation false-positive failure mode the script's own docstring already
warns about, just now measured at real scale. **Don't trust `documented:
false` output in forested/park terrain without a QGIS spot-check first**
— see [lidar-pipeline/README.md](../lidar-pipeline/README.md)'s "Known
limitations" for the full picture, including a real LiDAR data-quality bug
(the "Z-unit" bug) discovered during this same testing.

Run `fetchStructures.ts`, then copy `data/overlays/structures.geojson` to
the device the same way as below — or run the real pipeline yourself:

1. Run `lidar-pipeline/02_detect_structures.py` over the Sonoma County
   LiDAR tile set (real, done for two test areas — see above; a
   county-wide run just needs time, not new code).
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

**Real data, partially**: [pipeline/fetchRoads.ts](../pipeline/fetchRoads.ts)
fetches every `highway=*` way in the county from OSM (119,071 ways) and
computes real `protectedLand` via an actual point-in-polygon spatial join
against real Overpass-fetched protected-area boundaries — not a stand-in.
Run against the app's own `roadClassification.ts`, this produced 63,122
green / 245 yellow / 55,704 red real roads, including real protected-land
matches like Armstrong Woods Road (Armstrong Redwoods State Natural
Reserve).

**`lidar`-sourced features (purple/pink trail-band detection)**: this needs
real point-cloud processing (PDAL/GDAL, tens of GB of scratch disk) this
sandboxed environment doesn't have —
[lidar-pipeline/03_detect_trails.py](../lidar-pipeline/03_detect_trails.py)
does this for real on your own machine instead: it finds linear cleared
corridors in the LiDAR height-above-ground signal narrow and consistent
enough to be a trail (not a field or lot), measures their width directly
from the point cloud, drops anything that already coincides with an OSM
road/track from `fetchRoads.ts` (avoiding duplicates), and appends the rest
as `{source: "lidar", widthMeters}` — `roadClassification.ts` turns that
into the purple/pink bands with no changes needed. See
[lidar-pipeline/README.md](../lidar-pipeline/README.md) for what to install
and honest limitations (it's a heuristic, not a verified trail classifier —
expect false positives on ditches/field edges and false negatives under
heavy canopy; QA the output before trusting it).

**Status after real-terrain testing (2026-08-26)**: the script runs clean
end to end and its cross-referencing correctly recognizes real mapped
roads, but no genuine unmapped trail has been detected yet in any tested
area (downtown Santa Rosa, Trione-Annadel, Sonoma Mountain foothills). The
**canopy-cover limitation is still open**: LiDAR can't resolve ground-level
clearance under dense oak/fir canopy, which is exactly where Sonoma's real
singletrack mostly lives — so the detector only ever sees trails where
they cross open ground, and everything it flagged in open ground so far
was the edge of a wider clearing (now filtered — see the pipeline
README's "cap-pinned" note). The land-cover / tree-canopy cross-reference
that was proposed as the likely fix **has since been implemented and
evaluated (2026-08-27): it does not help** — measured along 8.6km of
Annadel's mapped trails, the DSM over the trails is canopy top (median
13.8m above ground), so no clearance threshold recovers them; the code
stays behind `03_detect_trails.py --canopy-mode` (off by default) for
reproducibility. See the pipeline README's canopy bullet for the numbers
and for the one remaining plausible approach (DTM micro-topography, not
attempted). Until something like that exists, expect `roads.geojson` to
carry few or no `source: "lidar"` features, and treat that as honest
output rather than a pipeline failure.

To produce the real file:

1. Run `pipeline/fetchRoads.ts` for the OSM-sourced portion (real, done), or
   reproduce it yourself against a full `.osm.pbf` extract with `osmium`/
   `ogr2ogr` if you want offline-only tooling instead of the live Overpass
   API this script uses.
2. Run `lidar-pipeline/03_detect_trails.py` for the LiDAR-sourced portion
   (real, on your own machine — see above) — it reads and appends to the
   same file step 1 produced, rather than needing a separate merge step.
3. Copy `data/overlays/roads.geojson` to the device at
   `overlays/roads.geojson` (same manual/Wi-Fi transfer approach as the
   tile database above).

Until this file exists on-device, the Roads & Trails toggle shows bundled
placeholder data covering all five categories (see
[src/overlays/sampleRoads.ts](../src/overlays/sampleRoads.ts)) — the in-app
legend flags this with a "Sample data" note. Only the drivable band (green/
yellow/red) feeds the routing graph (§7 below); purple/pink trails are
display-only per spec §15 and are never part of a computed route.

**Labeling (spec §6, confirmed)**: `RoadsOverlay.tsx` labels any road/trail
with a `name`, regardless of category — including red (private/
unclassified) — matching how Google Maps itself labels named private roads,
and consistent with the base street style's own labels
([src/map/labelLayers.ts](../src/map/labelLayers.ts)). Purple/pink LiDAR
trails have no `name` field in the schema at all (§15), so this has no
effect on them today.

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

**Real data, whole county**: [pipeline/fetchParcels.ts](../pipeline/fetchParcels.ts)
queries the county's actual "Parcels Public" FeatureServer directly — real
APN, real acreage, all 188,492 real parcels. Doing the spec's own "confirm
zoning and APN fields are present" check turned up a real finding: **this
layer has no standalone zoning field.** It only carries the Assessor's Use
Code (`UseCodeDescription`) — related to zoning but not the same thing (what
the parcel is *used for*, not its zoning district). No public zoning/
general-plan layer turned up after several searches of the county's GIS
catalog. The pipeline uses Use Code as the closest real substitute for the
app's `zoning` field, clearly labeled as such in the script's own comments
— not silently relabeled as a real zoning designation.

The upside: Use Code values include real `TIMBER PRESERVE ZONE/LIST A/B/C`
and `AG PRESERVE AND TPZ` entries (TPZ = Timberland Production Zone, almost
certainly the actual mechanism behind spec §4's "timber preserve" language)
— confirmed against a real rural sample query. `resourceExtraction` is
derived from those, real, not a placeholder: 493 of the 188,492 parcels are
flagged.

To produce the real file:

1. Run `pipeline/fetchParcels.ts` (real, done — whole county, ~60MB).
2. If a real zoning/general-plan layer turns up later (try PRMD directly,
   not just the GIS Hub catalog search this pipeline used), swap it in for
   the Use Code substitute and re-derive `resourceExtraction` from actual
   zoning codes instead of Use Code text matching.
3. Copy `data/overlays/parcels.geojson` to the device at
   `overlays/parcels.geojson` — see the scale warning below first.

Until this file exists on-device, the Parcels toggle shows bundled
placeholder data (see
[src/overlays/sampleParcels.ts](../src/overlays/sampleParcels.ts)) — tap any
parcel to see the info card (APN, acreage, zoning) that real data will
populate the same way.

### Why this overlay failed before (spec §10), and how to avoid it at scale

The spec flags that a parcel layer "previously failed to load/render
reliably" in an earlier project. The most likely cause at true Sonoma County
scale: the county's full parcel layer is 189,239 features, confirmed
directly against the live service above — not an estimate (188,492 made it
into `parcels.geojson`; 747 were skipped for missing required fields, see
the script's own log output). The resulting file is ~60MB. Loading that as
one flat GeoJSON file — parsed synchronously into a single JS object
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

## 8. Offline search index (spec §16)

**Real data.** [pipeline/fetchSearchIndex.ts](../pipeline/fetchSearchIndex.ts)
builds the real index directly from the other real pipeline outputs —
`loadNamedRoads()` and `loadNamedStructures()` read `roads.geojson` and
`structures.geojson`'s already-real `name` fields, plus a real Overpass
query for place/POI nodes (towns, trailheads, campgrounds, parks) across
the county. Confirmed run: 108,764 entries (1,051 places/POIs, 25,239
named roads, 82,474 named structures), 12.4MB. Depends on `fetchRoads.ts`
and `fetchStructures.ts` having already run — see
[pipeline/README.md](../pipeline/README.md) for run order.

The app looks for a search index at
`<app documents>/overlays/search-index.json` — a flat JSON array:

```json
[{ "id": "place:santa-rosa", "name": "Santa Rosa", "kind": "place", "coordinate": [-122.7141, 38.4404] }]
```

`kind` is `"place"`, `"road"`, or `"poi"` — cosmetic (shown as a label next
to each result), not used for filtering. This is deliberately a flat
name-to-coordinate lookup, not a full geocoder: selecting a result flies
the camera there and requests a route, exactly like a long-press at that
coordinate (spec §16's tap-to-pin and search are two ways to reach the same
destination-selection path — see `requestRouteTo()` in
[src/screens/MapScreen.tsx](../src/screens/MapScreen.tsx)).

**Only publicly known/named things belong in this index** (spec §16, spec
§6) — but that's enforced structurally elsewhere, not by filtering here.
Private roads and undocumented structures never get a `name` field in
`roads.geojson`/`structures.geojson` in the first place (see §5 and §4
above), so an export process that only indexes named features from those
two files, plus place/POI names from OSM, can't accidentally leak one.

To produce the real file:

1. Extract place nodes (towns, unincorporated communities) and POI nodes
   (trailheads, campgrounds, points of interest) tagged with a `name` from
   the Sonoma County OSM extract.
2. Add an entry per named feature already present in `roads.geojson` and
   `structures.geojson` (their `name` field, keeping the same coordinate
   convention — a representative point, not a full geometry).
3. Export as a flat JSON array (not GeoJSON — no geometry beyond a single
   point per entry is needed) named `search-index.json`.
4. Copy it to the device at `overlays/search-index.json`.

Until this file exists on-device, the search bar matches against bundled
sample data (see
[src/overlays/sampleSearchIndex.ts](../src/overlays/sampleSearchIndex.ts))
covering a handful of real Sonoma County town names plus the same named
sample roads/structures used elsewhere, so a search result points at the
same feature already visible on the map. The matching/ranking logic itself
— [src/search/searchQuery.ts](../src/search/searchQuery.ts) — has zero
React Native dependencies and was verified standalone under Node with
`tsx`, same as the routing module.

## 9. Elevation / grade indicator (spec §13)

**Real data.** [pipeline/fetchDem.ts](../pipeline/fetchDem.ts) queries the
USGS National Map Elevation Point Query Service (EPQS) directly at each
point of a 46×36 grid across `REGION_BOUNDS` (real elevation values, not a
bulk raster download — this environment's disk budget doesn't fit one, and
EPQS makes that unnecessary). Produced `data/overlays/dem.json`: real
Sonoma County elevations ranging from -127m (below sea level, coastal/bay
areas) to 1338m (near Mt. St. Helena), 18.6KB. See the header comment for
why point-query beat bulk DEM download here.

The app looks for an elevation grid at `<app documents>/overlays/dem.json`:

```json
{ "bounds": [-123.65, 38.05, -122.30, 38.90], "cols": 200, "rows": 200, "elevationsMeters": [12.4, 13.1, ...] }
```

A coarse regular grid, not raster tiles — `elevationsMeters` is row-major,
row 0 = the south edge of `bounds`, col 0 = the west edge (see
[src/elevation/types.ts](../src/elevation/types.ts)). This app only needs
elevation *values* at points along a route to compute grade, not a rendered
terrain surface (that's the separate planned LiDAR hillshade base layer,
spec §3.3), so a lightweight JSON grid with bilinear interpolation —
[src/elevation/profile.ts](../src/elevation/profile.ts) — avoids needing a
raster/PNG decoder in the app just for this.

Whenever a route is active, `MapScreen` samples this grid along the route's
coordinates to build a profile: cumulative distance, min/max elevation,
total gain/loss, and the steepest single-segment grade — shown in the
RoutePanel as a bar-sparkline colored by local grade (green <5%, amber
5–10%, red 10%+) plus gain/loss/max-grade figures. Points outside the
grid's coverage are skipped rather than guessing, so a route running off
the edge of a regional DEM extract degrades gracefully.

To produce the real file:

1. Sourced from the same LiDAR/DEM data already being processed for the
   nDSM layer (spec §13) — no separate acquisition needed.
2. Resample to a regular grid at whatever resolution is practical for
   Sonoma County's extent (finer than the sample's 21×21 — a few hundred
   points per side keeps the file small while giving road-scale grade
   accuracy; full LiDAR resolution isn't necessary for this feature).
3. Export as JSON in the schema above, named `dem.json`.
4. Copy it to the device at `overlays/dem.json`.

Until this file exists on-device, elevation profiles are built from a
synthetic rolling-hills grid (see
[src/elevation/sampleDem.ts](../src/elevation/sampleDem.ts)) covering the
same area as the other sample overlays — not derived from real terrain,
just enough to exercise the chart and grade math. That math —
`sampleElevation()`'s bilinear interpolation and `buildElevationProfile()`'s
gain/loss/grade calculation — was verified standalone under Node with
`tsx` against a hand-checkable grid, same pattern as routing and search.

## Waypoints — local user data, not pipeline output (spec §11)

Unlike everything above, waypoints have no pipeline step at all: they're
saved locally at `<app documents>/user-data/waypoints.json` whenever the
user saves one via the RoutePanel's "Save waypoint here" action (see
[src/waypoints/waypointsStore.ts](../src/waypoints/waypointsStore.ts)).
Deliberately kept out of `overlays/` — that directory is read-only,
pipeline-sourced data the app never writes to; `user-data/` is the app's
own write target. Per spec §11 ("not synced to cloud automatically ...
manual export/backup recommended before switching phones"), there's no
export/import UI yet — if that's wanted, it'd read/write the same
`waypoints.json` file via `expo-file-system`'s share/document-picker APIs.

## Breadcrumb trail — no storage at all (spec §12)

Also has no pipeline step, and unlike waypoints, no persistence step
either: `MapScreen` accumulates GPS positions into in-memory state
(`breadcrumbPoints`) while recording is on, and nothing is written to
disk. That's deliberate, not a gap — spec §12 explicitly frames this as
"not always-on tracking; avoids unnecessary battery/storage use and
unwanted location history." Closing the app or navigating away loses the
trail; if a "save this ride" feature is wanted later, that's a new,
explicit user action (parallel to waypoints' save flow), not something
breadcrumb recording should do implicitly.

## 10. Satellite and LiDAR hillshade base layers (spec §3.2, §3.3)

Two more base layers alongside street (spec §3.1), selectable from the
`BaseLayerSelector` pill (bottom-left) — mutually exclusive with each
other, unlike the combinable overlays in §4-6 above. Each is a separate
raster MBTiles file, downloaded on demand with the same one-time-over-Wi-Fi
mechanism as `sonoma.mbtiles` (step 2 above), via
[src/offline/baseLayerTiles.ts](../src/offline/baseLayerTiles.ts) — built
on the same generic tile-set management
([src/offline/tileSets.ts](../src/offline/tileSets.ts)) `tileStore.ts` was
refactored onto. Neither blocks using the app: only street is required
(App.tsx gates on it before `MapScreen` ever mounts), so a missing
satellite or LiDAR file just means that one segment shows a download
prompt instead of switching.

**Satellite** (`tiles/satellite.mbtiles`) — plain `raster` tiles, no
special encoding. Produce from aerial imagery (e.g. NAIP for California)
clipped to the Sonoma County bounding box and tiled with `gdal2tiles.py`
or `gdalwarp` + `gdal_translate` into an MBTiles output.

**LiDAR hillshade** (`tiles/lidar-hillshade.mbtiles`) — `raster-dem` tiles
in Terrarium encoding (`encoding: "terrarium"` in
[src/map/rasterStyles.ts](../src/map/rasterStyles.ts)), decoded and shaded
by MapLibre itself via a `hillshade` layer — there's no separate
pre-rendered hillshade image to generate. Derive from the same DEM data
already producing `dem.json` (spec §13): resample to a raster grid, encode
elevation into RGB per the Terrarium spec (`(R*256 + G + B/256) - 32768`
meters), and tile with `rio-rgbify` or `gdal2tiles.py --profile=terrarium`.

**Hybrid mode** (spec §3.4: "street labels over satellite or LiDAR") is
the Labels toggle shown whenever Satellite or LiDAR is active — it adds the
same `openmaptiles` vector source and label layers from
[src/map/labelLayers.ts](../src/map/labelLayers.ts) that the street style
uses, so road/place names read consistently no matter which base layer
they're drawn over. Requires the street `sonoma.mbtiles` to be on-device
too (for the label source) — if it isn't yet, the toggle exists but has no
effect. No new file to produce for this: it reuses `sonoma.mbtiles`
entirely.

Unlike the overlay/search/DEM data above, no synthetic sample data ships
for these two — a fabricated "fake satellite photo" or fake terrain
wouldn't actually verify anything about the real raster/hillshade
rendering pipeline, just prove a placeholder color renders. The
source/style-generation code (`rasterStyles.ts`, `baseLayerTiles.ts`) is
complete and type-checked; seeing it actually render needs the real
MBTiles files above and a device or simulator.
