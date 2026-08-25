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
yellow/red) is meant to feed the routing graph in a later step; purple/pink
trails are display-only per spec §15.

## Later pipeline stages (not needed for basic rendering)

- Satellite + LiDAR hillshade base layers: raster MBTiles, same delivery path.
- Parcels overlay: GeoJSON export from Sonoma County GIS (spec §9).
- Offline search index: OSM place/address/POI names for Sonoma County, built
  at pipeline time and bundled on-device (spec §16).
- Routing graph: Valhalla or GraphHopper extract (spec §7), fed only by the
  drivable-width road band above.
