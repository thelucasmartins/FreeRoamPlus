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

Requires Java 21+. Planetiler downloads its inputs and clips to the Sonoma
County bounding box:

```bash
curl -L -o planetiler.jar https://github.com/onthegomap/planetiler/releases/latest/download/planetiler.jar
java -Xmx1500m -jar planetiler.jar --download --area=norcal --bounds=-123.65,38.05,-122.30,38.90 --output='data\sonoma.mbtiles'
```

**Everything below was learned by running this command, not by reading the
Planetiler docs.** Three separate errors lived in this section until a
smoke test on a tiny bbox surfaced them. Run a smoke test before any real
build — each of these fails only at launch, so you discover them after
committing the machine rather than before.

- **`--output` must use backslashes on Windows.** Planetiler parses it as a
  URI, so `--output=D:/path/x.mbtiles` reads `D:` as a URL scheme and aborts
  with `Unsupported scheme D`. Confusingly, `--tmpdir` and `--osm_path` are
  *fine* with forward slashes — Planetiler normalizes those — so this looks
  like a path typo and isn't.
- **Do not drop `--download`.** The OpenMapTiles profile reads FOUR inputs,
  not just the OSM extract: `lake_centerline.shp.zip`,
  `water-polygons-split-3857.zip`, `natural_earth_vector.sqlite.zip`, and
  the `.osm.pbf`. Passing `--osm_path` alone skips fetching the other three
  and the run dies at startup. If you already have the extract on disk,
  keep `--download` and pass `--osm_path` as well — `--download` fetches
  only what is missing. Use `--download_dir` to keep roughly 1.5GB of
  auxiliary sources off your system drive.
  Those three sources are what feed `water`, `waterway`, `landcover`,
  `park` and `boundary` — five of the seven layers below. A build that
  somehow skipped them would produce a basemap of roads and buildings over
  blank ground.
- **Heap — measured, not estimated.** `-Xmx4g` was specified here
  originally and is wrong on a memory-constrained machine. From a real run
  of the command above on this dataset:

  | | |
  | --- | --- |
  | Peak live heap (postGC) | **1,229 MB** |
  | Peak heap in use | 1,434 MB |
  | postGC after the OSM passes | **305 MB** |
  | **Peak process RSS** | **1,958 MB** |
  | Wall time, whole county | **8m 22s** |
  | Output | 23 MB, 4,230 tiles, z0–14 |

  **The whole county build takes minutes, not hours.** Everyone involved
  assumed multi-hour and planned around it. Budget accordingly.

  **RSS runs ~460MB above the heap ceiling** — metaspace, thread stacks,
  direct buffers (~54MB observed) and the mmap'd node map all sit outside
  `-Xmx`. Any threshold arithmetic reasoning from `-Xmx` alone is wrong by
  that margin. This is not academic: a `-Xmx2g` run against a 250MB
  free-memory guard was killed mid-build because 2g + ~460MB overhead
  leaves ~200MB free as the *steady state* of a healthy run, which no
  sustained-breach rule can distinguish from distress.

  **`-Xmx1500m` is what actually completed this build**, and the figures
  above are from that run. An earlier attempt at `-Xmx2g` was killed by a
  memory guard, on the reasoning that "`-Xmx` is a ceiling, not a
  reservation, so an unused 2g costs nothing." That reasoning is true of
  the *heap* and false of *RSS*: a larger ceiling lets the JVM defer
  collection and grow its resident set, consuming the very free memory the
  guard was watching. Size the heap against what the machine can hold
  including the ~460MB of non-heap overhead, not against what the heap
  alone would use.

  On a machine with several GB to spare, `-Xmx2g` is fine and gives more
  headroom. On a constrained one, 1500m is proven sufficient for a
  county-scale extract.

  **The peak is bounds-independent, which is the counter-intuitive part.**
  `--bounds` clips the *output tiles*; it does not clip input parsing.
  `osm_pass1`/`osm_pass2` build a node map over every node in the extract
  (79M for norcal) no matter how small the output box is. So a "tiny" test
  run has essentially the same memory profile as a county run, and memory
  does **not** scale with area. The corollary is the useful one: postGC
  collapsing to 305MB once the OSM passes finish means the tile-write phase
  is cheap in heap terms, because it streams to disk.

  Practically: a small-bbox smoke test is a genuine predictor of a large
  run's memory behaviour, not a lower bound. Use one.

  Pin `--tmpdir` to a drive with room, and verify from Planetiler's own
  startup log which tmpdir it actually used rather than assuming the flag
  took.
- `--bounds` clips to Sonoma County so the output stays small — **23MB
  measured**, not the "tens of MB" this document used to estimate. That
  distinction matters: a size threshold set from the prose figure rather
  than the measured one was calibrated at 20MB and the real artifact
  cleared it by only 15%. A slightly narrower bbox or lower maxzoom would
  have been rejected as an empty database, and the basemap is the one
  artifact with no fallback — rejecting a valid one leaves no map at all.
  Thresholds set from prose are guesses wearing a number; set them from
  measurements and record the measurement.
- Output uses the OpenMapTiles schema, which is what `src/map/style.ts`
  expects. The complete list of source layers the style actually consumes
  today, verified by grepping `source-layer` in that file, is:
  `boundary`, `building`, `landcover`, `park`, `transportation`, `water`,
  `waterway`. Verify a generated basemap against **all seven** — a tile set
  carrying only roads and buildings will render no water, parks, landcover
  or county boundary, which on an off-road navigation app is a functional
  gap, not a cosmetic one. Note `place` is deliberately absent: the
  place/label layers are gated behind an on-device glyph pack that doesn't
  exist yet (see §3), so nothing consumes it at present. Planetiler's
  OpenMapTiles profile emits all of these, so no extra flags are needed —
  this list is for *verification*, not for configuring the build.

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

### What actually gets downloaded

There are **two** kinds of download, into two different directories, and the
app treats them differently.

**Tile databases** → `<app documents>/tiles/`, served from the root of
`data/`:

| File | Size | Source layer | Rendered by |
| --- | --- | --- | --- |
| `sonoma.mbtiles` | ~23MB | (OpenMapTiles schema, §1) | the basemap style |
| `structures.mbtiles` | ~44MB | `structures` | `StructuresOverlay` (§4) |
| `parcels.mbtiles` | ~44MB | `parcels` | `ParcelsOverlay` (§6) |

**Overlay data files** → `<app documents>/overlays/`, served from
`data/overlays/`:

| File | Size | Consumed by |
| --- | --- | --- |
| `roads.geojson` | ~47MB | `roadsStore.ts` — render **and** the routing graph (§7) |
| `search-index.json` | ~12MB | `searchStore.ts` |
| `dem.json` | ~18KB | elevation/grade (§9) |
| `structures.geojson` | ~102MB | only the *source* the tiles are built from — see below |
| `parcels.geojson` | ~58MB | only the *source* the tiles are built from — see below |

**You do not need `structures.geojson` or `parcels.geojson` on the device
once the tile databases are installed**, and putting them there is actively
counterproductive. The stores resolve tiles-first (§6), so with the tiles
present those files are never read — they are 160MB occupying storage to no
effect. They remain in the download set only as the fallback for a device
that has no tiles yet, and they stay in `data/` regardless because they are
what the tile builds consume.

Note the serving layout: `npx serve --cors -l 8080 data` makes `data/` the
web root, which is why the two kinds resolve differently —
`http://<ip>:8080/structures.mbtiles` versus
`http://<ip>:8080/overlays/roads.geojson`. `OVERLAY_DOWNLOAD_BASE_URL` in
[src/config.ts](../src/config.ts) encodes that difference — keep its host in
sync with `TILE_DOWNLOAD_URL`.

Each overlay store reads its file from the document dir and falls back to
bundled sample data when it's absent. That fallback is deliberate and load-
bearing: it means a missing or half-transferred file degrades to samples
instead of breaking the map. The transfer itself lives in
[src/offline/overlayFiles.ts](../src/offline/overlayFiles.ts), which shares
the hardened downloader in
[src/offline/fileDownload.ts](../src/offline/fileDownload.ts) with the
MBTiles path — disk-space preflight, a 30s stall timeout, atomic
partial-file handling, and friendly error messages.

Storage to budget on the device, in the order you'd install it:

| | Size |
| --- | --- |
| Basemap `sonoma.mbtiles` | ~23MB |
| Both overlay tile databases | ~88MB |
| `roads` + `search-index` + `dem` | ~59MB |
| *Optional, and unnecessary once tiles are installed:* `structures.geojson` + `parcels.geojson` | ~160MB |

So a fully-provisioned device needs about **170MB**, not the ~220MB an
earlier version of this document quoted — that figure predated the tile
databases and assumed every overlay arrived as GeoJSON. Pulling everything,
including the two redundant GeoJSON files, is closer to 330MB.

All four sizes above are measured from the real artifacts, not estimated.

The preflight check refuses a download that would leave under 50MB free, so
a phone that's nearly full fails fast with a readable message rather than
part-way through a 100MB transfer.

Each store also records what its load actually cost — file size, parse time,
and for roads the classification time separately — and those measurements
are persisted to `<app documents>/diagnostics/load-metrics.json` so they
survive the app closing. See
[src/offline/metricsLog.ts](../src/offline/metricsLog.ts); the analysis that
reads them is in
[src/overlays/loadMetricsReport.ts](../src/overlays/loadMetricsReport.ts).
This is the only source of real load numbers the project has, since none of
it can be measured meaningfully on a desktop.

### Verifying the LAN transfer before you touch the phone

Two failure modes account for most "the app won't download" reports, and
both are checkable from the desktop in a few seconds:

**1. The file isn't served where you think it is.** Check it answers with
CORS, at the size you expect:

```bash
curl -sI http://<your-desktop-LAN-IP>:8080/overlays/roads.geojson
```

Use the **LAN IP, not `localhost`** — serving on `localhost` works fine from
the desktop and is completely unreachable from the phone.

**2. Windows Firewall.** If the Wi-Fi network is classified `Public`,
inbound connections are blocked by default and the phone will simply hang.
Node needs an inbound allow rule covering the interpreter that runs `serve`:

```powershell
Get-NetConnectionProfile | Select-Object InterfaceAlias, NetworkCategory
Get-NetFirewallRule -Enabled True -Direction Inbound -Action Allow |
  Where-Object DisplayName -match 'node'
```

A program-scoped rule for `node.exe` on the active profile is enough — the
port itself doesn't need its own rule. If no such rule exists, the phone
cannot reach the server no matter how correct the URL is.

Finally, the desktop's LAN address is **DHCP-assigned**. If the machine
reconnects to Wi-Fi and the lease changes, every download URL in
`src/config.ts` points at the wrong host and downloads fail with a
connection error. Re-check the IP before blaming the app.

## 3. Labels — required, not optional

**This step is not cosmetic, and it was mislabelled "optional" here for most
of the build.** MapLibre Native cannot draw a `symbol` layer without SDF
glyph PBFs, and it has no system-font fallback for Latin script. With no
glyph pack installed, `buildLabelLayers()` returns `[]`, the style omits its
`glyphs` key entirely, and the map renders correct Sonoma County geometry
with **no road names and no place names anywhere**.

That failure mode is why it survived so long: an unlabeled map does not look
broken, it looks finished. A device tester following §4 of
[DEVICE-VERIFICATION.md](DEVICE-VERIFICATION.md) would confirm the basemap
renders and pass a step whose implementation did not exist.

### Producing the pack

`data/fonts/` is a build artifact like the `.mbtiles` files — `/data` is
gitignored, so it is produced locally and served, never committed.

Get prebuilt Noto Sans glyphs from the OpenMapTiles fonts release
(https://github.com/openmaptiles/fonts/releases — `noto-sans.zip`, ~62MB),
and extract just the ranges the app asks for into
`data/fonts/Noto Sans Regular/`:

| Range | Why |
| --- | --- |
| `0-255` | Basic Latin + Latin-1 Supplement — ordinary names |
| `256-511` | Latin Extended-A — accented names |
| `8192-8447` | General Punctuation — OSM names use U+2019 curly apostrophes, which are **not** in `0-255` |

Three files, a few hundred KB total. The full 62MB archive is almost
entirely CJK ranges this app will never request; do not ship it.

The set is declared once in `GLYPH_RANGES`
([src/config.ts](../src/config.ts)) and is the same list used for both the
download and the readiness check, so the two cannot drift.

### Getting it onto the device

In-app, from **Layers → Map data → Download map labels**
([src/offline/glyphs.ts](../src/offline/glyphs.ts)). Each range is fetched
individually rather than as an archive, because expo-file-system cannot
unzip.

Readiness requires **every** listed range to be present and over 1KB — not
merely that `tiles/fonts/` exists. That directory is created by the first
write, so the earlier existence check meant an interrupted install switched
labels on and left MapLibre requesting ranges that had never been fetched.
Same lesson as the empty-SQLite-shell floor in §1: the presence of a
container has never been evidence that its contents arrived.

### Known unknown

The glyph URL template resolves to a `file://` path containing spaces
(`.../fonts/Noto Sans Regular/0-255.pbf`), because the directory name must
match `text-font` exactly. Whether MapLibre Native handles that unescaped on
both platforms **has not been verified on a device** — like `mbtiles://`
itself, nothing on the desktop can test it. If labels stay missing after a
successful install, this is the first thing to suspect, and the fix is to
rename the stack to a space-free name in both `GLYPH_FONTSTACK` and the
`text-font` arrays in `labelLayers.ts`, `RoadsOverlay.tsx` and
`StructuresOverlay.tsx`.

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

> **At county scale this layer renders from vector tiles, not this GeoJSON.**
> `structures.geojson` is ~102MB — the largest overlay, bigger than parcels —
> and parsing it whole is the same trap described under §6. The GeoJSON below
> is still what the pipeline produces and what the tiles are built *from*, but
> the app prefers `structures.mbtiles` when it's present and skips reading the
> GeoJSON entirely. See "Vector tiles for the two large overlays" in §6 for
> the build command, the staging rule, and the resolution order.

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
reproducibility. The successor idea — **DTM micro-topography**, detecting
the flattened shelf a sidehill trail leaves in the *bare-earth* surface
(which ground returns capture even under canopy) — was probed on
2026-08-27 and is a more interesting result: the signal is genuinely
there (flatness ratio 0.15 on trail vs 0.58 on paired controls across
32km of mapped trail, and it survives closed canopy), but a *blind*
detector still can't exploit it — searching transect orientations, which
a real detector must, inflates the false-positive rate ~3x and collapses
the continuity filter to a 1.4x separation. Both are documented with
full numbers in the pipeline README's canopy bullet and in
`03_detect_trails.py`'s negative-results ledger.

Practical consequence for this overlay: expect `roads.geojson` to carry
few or no `source: "lidar"` features, and treat that as honest output
rather than a pipeline failure. The purple/pink width bands remain fully
implemented on the app side and will render correctly if a future
detector ever produces real features for them.

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
[src/overlays/parcelsStore.ts](../src/overlays/parcelsStore.ts) used to do —
is exactly the kind of thing that stalls or OOMs a phone, and would silently
render nothing if the parse or the source ever failed. That code path is
correct and safe for a moderate export (a sub-region, or the bundled
sample), but isn't the one to point at the full county.

**This is now fixed, and the fix has a subtlety worth understanding before
you touch either store.** See "Vector tiles for the two large overlays"
below.

### Vector tiles for the two large overlays

Structures (~102MB) and parcels (~58MB) are not shipped as GeoJSON. Both are
pre-tiled into MBTiles and streamed by viewport, which is the actual fix for
the reliability problem — not just a smaller minzoom.

**Building the tiles.** Use `ogr2ogr` (GDAL), which is already available in
the [lidar-pipeline](../lidar-pipeline/) conda environment. An earlier
version of this document recommended `tippecanoe`; that is a fine tool but
is not installed here, and `ogr2ogr` is what these files were actually built
with:

> **GDAL is installed but not on `PATH`.** It lives in
> `D:\FreeRoam-lidar-env\Library\bin`, which is why `ogr2ogr`, `ogrinfo` and
> `sqlite3` all appear to be missing. Prepend that directory and you have all
> three without installing anything:
>
> ```bash
> export PATH="/d/FreeRoam-lidar-env/Library/bin:$PATH"   # bash
> $env:PATH = "D:\FreeRoam-lidar-env\Library\bin;$env:PATH"  # PowerShell
> ```
>
> Worth knowing before you conclude a tool is unavailable and work around it:
> `ogrinfo` and `sqlite3` are the only practical way to check what's actually
> inside an MBTiles file — layer names, zoom range, feature counts — which is
> how you tell "the tiles are empty" apart from "the VectorSource is
> misconfigured". Those two look identical on screen.

```bash
ogr2ogr -f MVT data/.staging/parcels.mbtiles data/overlays/parcels.geojson \
  -nln parcels -dsco MINZOOM=10 -dsco MAXZOOM=16
```

**Verified output of the real builds**, for comparison if you ever rebuild
these:

| | Size | Source layer | Zoom | Tile-features | Distinct features |
| --- | --- | --- | --- | --- | --- |
| `structures.mbtiles` | 45,834,240 B | `structures` | 10–16 | 371,942 | 323,040 |
| `parcels.mbtiles` | 45,154,304 B | `parcels` | 10–16 | 293,582 | 188,492 |

**`ogrinfo` reports features per tile, not distinct features, and the two
numbers do not match.** A polygon crossing a tile boundary is counted once
in every tile it touches, so the tile-feature count is always the larger.
The ratios above (~1.15x for structures, ~1.56x for parcels) are normal and
expected — parcels duplicate more because they are larger polygons and so
straddle more tile edges. A count exceeding the source's feature count is
*not* evidence of duplicated or corrupted geometry, and it is an easy thing
to misread as one. The distinct counts come from the source GeoJSON.

**Expect this warning on dense data, and do not treat it as a failure:**

```
Warning 1: At least one tile exceeded the default maximum tile size of
500000 bytes and was encoded at lower resolution
```

GDAL caps tiles at 500KB and, when one overflows, re-encodes *that tile*
with simplified geometry. **Every feature is still present** — only vertex
precision drops on the densest tiles. This is strictly better than what the
tippecanoe recipe would have done: `--drop-densest-as-needed` resolves the
same overflow by *dropping features*. For parcels, where "is my parcel here
and what is its APN" matters far more than boundary vertex fidelity, losing
precision beats losing parcels. All 188,492 with some simplified edges is
the right trade.

If it ever needs addressing, two levers, both a rerun rather than a
redesign: raise the cap with `-dsco MAX_SIZE=<bigger>`, or raise `MAXZOOM`
so features spread across more tiles and fewer overflow. Neither is worth a
full reconversion unless parcel edges look visibly wrong on a device.

`-nln` sets the **source layer name inside the tiles**, and it matters more
than it looks: a layer referencing a source-layer that doesn't exist renders
nothing, silently, with no error anywhere. The names are `structures` and
`parcels`, mirrored in `STRUCTURES_SOURCE_LAYER` / `PARCELS_SOURCE_LAYER` in
[src/config.ts](../src/config.ts) so they're declared in exactly one place.

**Build to staging, then rename into place.** Note the `data/.staging/`
output path above. The dev file server serves `data/`, so writing an MBTiles
file directly to its final path publishes a partial database for the whole
duration of the conversion — and a truncated SQLite file is not zero bytes,
so it downloads happily and then renders an empty layer. Build to
`data/.staging/`, then `mv` into `data/` on success only; a rename within a
volume is atomic, so the served path never exists in a partial state.
Anything in `data/.staging/` is by definition incomplete.

This matters more than it sounds, because a partial MBTiles is not detectable
by inspection. GDAL creates the real file as a valid but empty ~16KB SQLite
database at startup and only flushes tiles into it at the end, so a file
fetched mid-build has a correct `SQLite format 3` header, opens fine, and
contains nothing. The app defends against this with a minimum-size floor
(`MIN_TILE_DB_BYTES` in [tileSets.ts](../src/offline/tileSets.ts)): an
undersized database resolves to *not ready*, so the overlay falls back to
GeoJSON or sample data rather than rendering blank. That is a backstop, not a
substitute — atomic publishing is what actually prevents the situation.

**Tiles-first resolution — the part that's easy to get wrong.** Putting the
tiles on the device is only half the fix. The stores previously read the
on-device GeoJSON whenever it was present, so a device holding *both*
`structures.mbtiles` and `structures.geojson` would render from tiles and
still take the ~102MB parse — fixing nothing while appearing to.

So [structuresStore.ts](../src/overlays/structuresStore.ts) and
[parcelsStore.ts](../src/overlays/parcelsStore.ts) resolve in this order,
and return an `OverlaySource<T>` describing which mode won:

1. tile database present → `{ mode: 'tiles' }`, **returning without reading
   the `.geojson` at all**;
2. else real GeoJSON on device → `{ mode: 'file' }`;
3. else → `{ mode: 'sample' }`.

Step 1's early return is load-bearing, not an optimisation. If you ever
refactor these stores, preserving it *is* preserving the fix.

A consequence worth planning for: once tiles are the norm, downloading
structures/parcels GeoJSON is ~160MB of dead weight that also re-enables the
parse. Dropping them from the default download set in
[overlayFiles.ts](../src/offline/overlayFiles.ts) has to happen in step with
the render change — earlier, and the layers have nothing to draw.

**Tap-to-inspect is unaffected.** The parcel info card is driven by the
source's own `onPress`, not by a lookup against parsed features, and in
`@maplibre/maplibre-react-native` 11.3.7 both `VectorSourceProps` and
`GeoJSONSourceProps` extend `PressableSourceProps` — identical handler
signature. One gotcha if you add layers: on `<Layer>` the prop is the
hyphenated `"source-layer"`, not `sourceLayer`, whenever you're using
`paint`/`layout` rather than the deprecated `style` prop.

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
(App.tsx gates on it before `MapScreen` ever mounts).

**Both segments are hidden by default.** Nothing in this repo produces
either file — the download code, the raster styles and the UI segments were
all written ahead of the data — so the picker was offering two buttons whose
only possible outcome was a 404 against the file server. To a tester that is
indistinguishable from the LAN transfer being broken, which is a worse
failure than the layer simply not being there.

`SATELLITE_TILES_PROVISIONED` and `LIDAR_TILES_PROVISIONED`
([src/config.ts](../src/config.ts)) gate *offering* the layer. Flip one to
`true` once the corresponding pipeline below actually publishes its
`.mbtiles` to the served directory. A segment also appears whenever the file
is already on the device regardless of the flag, so a sideloaded database is
never hidden by a stale constant.

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
