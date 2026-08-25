# FreeRoam+ — Project Spec

*Offline Off-Road Navigation & LiDAR Tool*

## 1. Purpose

A fully offline navigation and terrain-awareness app for off-road/adventure riding in Sonoma County and surrounding areas. Combines standard turn-by-turn routing with LiDAR-derived structure and road detection, built on top of the existing nDSM structure-visibility pipeline.

## 2. Platform

- Native/cross-platform app shell (React Native or Flutter) — not a hosted web app, since true offline requires local data storage rather than browser caching.
- Target: phone-mounted use on the bike, no signal required after initial data load.

## 3. Map Layers (toggleable base layers)

1. **Street map** — standard vector/road map view, labeled like Google Maps (towns, streets, POIs) using OpenStreetMap data.
2. **Satellite** — raw satellite imagery, no overlays.
3. **LiDAR** — raw LiDAR-derived terrain view (hillshade/nDSM).
4. **Hybrid** — street labels over satellite or LiDAR.

## 4. Overlay Toggles (independent, combinable)

- **Structures only** — man-made buildings detected via LiDAR nDSM + Microsoft/OSM footprints.
  - Known/publicly documented buildings shown one way.
  - LiDAR-flagged undocumented structures shown in a visually distinct style (different color/outline) so they stand out.
- **Roads only** — all road/path lines extracted from OSM + LiDAR-detected unpaved/unmapped paths.
- **Parcels** — property/parcel boundary lines, toggle on/off independently, sourced from county assessor/GIS parcel data, must actually render correctly and reliably offline (this failed to load in prior projects — needs to be fixed here).
  - Tapping a parcel shows: boundary/lot size (acreage), zoning designation, and APN (assessor's parcel number).
  - Owner name/identity is explicitly excluded — not shown, not looked up.
  - Data source: Sonoma County GIS "Parcels Public" layer (gis.sonomacounty.ca.gov), available as GeoJSON/shapefile download. Owner name is already excluded from this public layer by the county itself (CPRA privacy restriction), so no extra filtering needed on our end — confirm zoning and APN fields are present in the export before building.
  - **Resource-extraction land distinction**: parcels used for timber production, mining, or milling get a clear visual distinction (color/pattern) separate from all other parcel types. No need to identify specific company/owner name — just a clear flag that the parcel is resource-extraction land vs. any other use. Determined by cross-referencing the county's Zoning and Land Use layer (timber preserve, mineral resource, and similar zoning codes) against parcel boundaries — not owner name based, since ownership identity isn't in the public data.
- **Any combination** — structures, roads, and parcels can all be layered together as needed.

## 5. Road Color Coding (with on-map legend)

| Color | Meaning |
|---|---|
| Green | Public and government-maintained roads |
| Yellow | Roads within national forest / government-protected land |
| Red | Private roads, or unclassified roads with no public data |

## 6. Labeling

- Public/known towns, streets, POIs, and buildings labeled the same way Google Maps does.
- Private structures/roads are shown (colored/flagged) but not labeled with identifying info.

## 7. Routing

- Turn-by-turn routing engine running fully on-device: Valhalla or GraphHopper (compiled binary + local data extract).
- Routes any road/path in the dataset, including private/unclassified ones flagged red — for Lucas's own trip planning, not an implication of right-of-way.

## 8. Offline Architecture

- **Map tiles**: pre-rendered and stored locally as an MBTiles file (SQLite-based tile database) on-device.
- **Routing data**: pre-built Valhalla/GraphHopper graph extract for the target region, bundled with the app or downloaded once over Wi-Fi.
- **LiDAR layers**: nDSM, structure detections, and road extractions pre-processed on desktop, exported as static GeoJSON, bundled into the app's local storage.
- **GPS**: uses the phone's onboard GPS chip directly — works fully offline, no cell/Wi-Fi assist needed (first fix may take slightly longer without assisted GPS).

## 9. Data Pipeline (build-time, done ahead of use)

1. Pull LiDAR (nDSM) + OSM building footprints — reuses existing structure-visibility tool pipeline.
2. Run structure detection → classify known vs. undocumented.
3. Run road extraction from LiDAR (flat, linear cleared paths) → cross-reference against OSM road tags to assign green/yellow/red.
4. Pull parcel boundary data from county assessor/GIS source, export as GeoJSON, verify it actually renders (known issue in prior projects — confirm fix here).
5. Export all layers as GeoJSON.
6. Generate MBTiles for street + satellite base layers.
7. Build local routing graph from OSM + extracted road network.
8. Bundle everything into the app's local storage.

## 11. Waypoints (Pins)

- Drop a pin anywhere on the map to mark something of interest (structure found, road condition, campsite, etc.), with an optional note.
- Saved to local on-device storage — no internet or server needed to save or view them.
- Persists across sessions; not synced to cloud automatically. Manual export/backup recommended before switching phones.

## 12. Breadcrumb Trail

- Optional trail showing the path already ridden during the current session, useful for backtracking.
- Off by default — must be manually toggled on to start recording, and can be stopped/cleared at any time.
- Not always-on tracking; avoids unnecessary battery/storage use and unwanted location history.

## 10. Known Open Questions

- Parcel layer previously failed to load/render in earlier terrain-literacy project — root cause needs to be identified and fixed before relying on it here.

- OSM road tagging doesn't cleanly map to "public vs. government vs. protected land" — will need a defined rule set for bucketing OSM road classes into the three colors.
- Confidence threshold for "undocumented structure" flagging (how much LiDAR elevation signal counts as a structure vs. noise/vegetation).

## 13. Elevation / Grade Indicator

- Elevation profile and grade (steepness) indicator, reusing the grade-measurement functionality from the earlier terrain-literacy viewer.
- Lets Lucas see incline/steepness of a road or route ahead before committing to it.
- Sourced from the same LiDAR/DEM data already being processed for the nDSM layer — no separate live data needed, works offline.

## 14. Suggested Build Order

1. Get OSM-based offline routing + tiles working standalone (prove offline routing works at all).
2. Layer in existing structure-detection GeoJSON as an overlay.
3. Add road color-coding logic.
4. Add GPS live-tracking dot.
5. Package as installable app shell.
