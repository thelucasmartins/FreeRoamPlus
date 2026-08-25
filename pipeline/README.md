# Data pipeline (spec §9)

Real, re-runnable scripts that produce the overlay/DEM data documented in
[docs/DATA.md](../docs/DATA.md), from real public data sources — no
synthetic/sample data. Each script is independent; run whichever ones you
need.

```bash
npx tsx pipeline/fetchDem.ts          # USGS elevation API -> data/overlays/dem.json
npx tsx pipeline/fetchParcels.ts      # Sonoma County ArcGIS -> data/overlays/parcels.geojson
npx tsx pipeline/fetchRoads.ts        # OpenStreetMap (Overpass) -> data/overlays/roads.geojson
npx tsx pipeline/fetchStructures.ts   # OpenStreetMap (Overpass) -> data/overlays/structures.geojson
npx tsx pipeline/fetchSearchIndex.ts  # Overpass + the two files above -> data/overlays/search-index.json
```

Run `fetchRoads.ts` and `fetchStructures.ts` before `fetchSearchIndex.ts` —
it merges named roads/structures from their output into the search index
(spec §16 asks for road names to be searchable, not just places/POIs).

Output goes to `data/overlays/` (gitignored — these are large, regenerable
build artifacts, not source). Copy the files you need to a device's
`overlays/` directory the same way as `sonoma.mbtiles` (see docs/DATA.md
step 2) to replace that overlay's bundled sample data.

## Confirmed run (2026-08-25)

| Output | Size | Count |
|---|---|---|
| `dem.json` | 18.6KB | 46×36 grid, -127m to 1338m |
| `parcels.geojson` | 60.7MB | 188,492 parcels (493 flagged resourceExtraction) |
| `roads.geojson` | 49.1MB | 119,071 ways (63,122 green / 245 yellow / 55,704 red), 25,239 named |
| `structures.geojson` | 106.8MB | 323,040 documented structures, 82,474 named |
| `search-index.json` | 12.4MB | 108,764 entries (1,051 places/POIs, 25,239 roads, 82,474 structures) |

## Why these sources, and what's still a gap

Each script's own header comment explains its source and any real
limitation found while building it (a missing zoning layer, Overpass query
tiling, etc.) — read those before trusting a field blindly. The short
version, cross-referenced against spec §9's pipeline steps:

| Spec §9 step | Real data produced? | Source |
|---|---|---|
| 1. Pull LiDAR (nDSM) + OSM building footprints | OSM half only | Overpass (`fetchStructures.ts`) |
| 2. Structure detection → documented vs. undocumented | Documented half only | same — undocumented needs LiDAR nDSM + the existing structure-detection tool (spec §1), neither available here |
| 3. Road extraction from LiDAR + OSM cross-reference | OSM half only, real protected-land spatial join | Overpass (`fetchRoads.ts`) — LiDAR-detected trail bands need point-cloud processing this environment doesn't have |
| 4. Parcel boundary data, verify it renders | Yes, real, whole county | Sonoma County ArcGIS (`fetchParcels.ts`) — see its header for a real field-check finding (no standalone zoning layer exists publicly; substituted Assessor Use Code) |
| 5. Export all layers as GeoJSON | Yes, for everything above | — |
| 6. Generate MBTiles for street + satellite | **Not done** | needs Java (Planetiler) / GDAL (`gdal2tiles`), neither installed, and this session's disk budget (4.3GB free) doesn't safely fit a regional OSM PBF + tile-generation temp space |
| 7. Build local routing graph | N/A — not a separate artifact | `src/routing/` builds the graph in-memory from `roads.geojson` at app load (see docs/DATA.md §7) |
| 8. Bundle into local storage | Manual step, same as tiles | see docs/DATA.md step 2 |

Elevation (spec §13) and the search index (spec §16) aren't in the spec §9
list above but are real too — `fetchDem.ts` queries the USGS National Map
Elevation Point Query Service directly (no bulk raster download needed),
and `fetchSearchIndex.ts` combines real OSM place/POI data with the named
roads/structures already fetched.
