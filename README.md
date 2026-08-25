# FreeRoam+

Offline off-road navigation and terrain-awareness app for adventure riding in Sonoma County. Combines turn-by-turn routing with LiDAR-derived structure and road detection — built to run with zero internet connection once installed.

## What it does

- **Turn-by-turn offline routing** — routes over the drivable (green/yellow/red) road network, including private and unclassified roads, with an on-device A* graph router (see [docs/DATA.md](docs/DATA.md) for why this isn't literally a compiled Valhalla/GraphHopper binary yet). Long-press anywhere to route there from your position; a regular tap never triggers routing.
- **Multiple base map layers** — street (vector, always available), satellite, and LiDAR hillshade, each a separate raster/vector MBTiles file downloaded on demand from the base-layer picker; a Labels toggle overlays street names on satellite/LiDAR for a hybrid view. All pre-rendered and stored locally, switchable with no network call.
- **Structure detection** — flags man-made buildings from LiDAR nDSM data, distinguishing known/documented structures from undocumented ones not present in public footprint databases.
- **Road classification** — color-coded by type: green (public/government-maintained), yellow (national forest/protected land), red (private or unclassified/undocumented).
- **Trail width classification** — LiDAR-detected paths with no OSM classification are bucketed by cleared width: under 1m as hiking trail (purple), 1–3m as ATV trail (pink), 3m+ as drivable road (green/yellow/red per the rule above). Only drivable-width paths join the routable road network.
- **Parcel boundaries** — toggleable parcel layer; tap a parcel to see lot size, zoning, and APN (no owner names — that field doesn't exist in this app's data at all). Resource-extraction parcels (timber, mining, milling) are visually flagged separately based on zoning data.
- **Elevation/grade indicator** — a bar-sparkline elevation profile for the active route, colored by local grade (green/amber/red), plus total gain/loss and max grade — sourced from the same LiDAR/DEM data as the nDSM layer, works offline.
- **Destination selection** — long-press anywhere to route to that exact coordinate, whether or not it falls on a known road, or search by place/road/POI name in the offline search bar; both lead to the same route request. A point with no nearby drivable road/trail still gets a route to the nearest reachable point on the network, with the remaining distance/direction flagged as off-network.
- **Waypoints** — save a pin with an optional note at any held/searched point (via the route panel), rendered as a marker on the map; tap one to view its note or delete it. Saved to on-device storage only, persists across sessions, never synced anywhere.
- **Breadcrumb trail** — off by default; toggle recording on to trace the current ride for backtracking, stop and resume anytime, clear it independently. In-memory only for the current session — nothing is written to disk, so there's no location history left behind.
- **Live GPS tracking** — uses the phone's onboard GPS chip directly, no signal required. A locate button recenters and locks the camera to your position (tap again to release); it also handles permission prompts, a "location off" state with a way to fix it, and an "Acquiring GPS…" indicator during the first fix.

## Why offline

Everything — map tiles, routing graph, LiDAR-derived layers, and parcel data — is pre-processed and bundled onto the device ahead of time. No servers, no live API calls, no signal required once the data is loaded. Built for use in areas with zero cell coverage.

## Status

🚧 In active development. See [offline-nav-lidar-spec.md](offline-nav-lidar-spec.md) for the full project specification.

Build-order steps 1–4 are done, plus parcels (§4), routing (§7), search
(§16), elevation (§13), waypoints (§11), breadcrumb trail (§12), and the
satellite/LiDAR base layers (§3.2–3.3):

- **Step 1** — offline MBTiles base map via MapLibre, fully offline once the tile file is on-device.
- **Step 2** — toggleable structures layer: documented buildings (blue) vs. LiDAR-flagged undocumented ones (red, dashed outline).
- **Step 3** — toggleable roads/trails layer: spec §5 green/yellow/red classification plus spec §15 width-based trail bands (purple hiking <1m, pink ATV 1–3m).
- **Step 4** — live GPS dot, follow-me camera button, permission/settings handling, first-fix indicator.
- **Parcels (§4)** — toggleable, tap-for-details layer (size, zoning, APN — never owner name); resource-extraction parcels flagged separately.
- **Routing (§7, §16)** — turn-by-turn over the drivable road network, with the §16 off-network fallback, reachable by long-press or offline search.
- **Elevation (§13)** — grade/profile chart for the active route, colored by steepness.
- **Waypoints (§11)** — save/view/delete pins with notes from the route panel, persisted on-device.
- **Breadcrumb trail (§12)** — off by default, toggle to record, stop/resume/clear independently, in-memory only.
- **Satellite / LiDAR base layers (§3.2–3.3)** — download-on-demand raster/hillshade base layers, switchable from a bottom-left picker, with a Labels toggle for the §3.4 hybrid view.

All overlays and the DEM/waypoint data run on bundled placeholder data
until the real pipeline/GIS output is on-device — see
[docs/DATA.md](docs/DATA.md), which also covers the vector-tile approach
needed for the parcels layer at full county scale, why routing here is a
custom on-device graph router rather than a compiled Valhalla/GraphHopper
binary, and why the satellite/LiDAR layers — unlike every other data
source in this app — have no synthetic sample data (a fabricated raster
image wouldn't verify anything real). Packaging as an installable app shell
(step 5) is the only build-order item left.

## Running it

```bash
npm install
npx expo run:android   # requires Android Studio / SDK; use `npx expo run:ios` on a Mac
```

MapLibre is a native module, so the app needs a development build — it will
not run in Expo Go. Without a local Android SDK, build in the cloud with
`npx eas build --profile development --platform android`.

On first launch the app shows a setup screen until the offline tile database
is downloaded (once, over Wi-Fi). See [docs/DATA.md](docs/DATA.md) for
generating `sonoma.mbtiles` with Planetiler and serving it to the phone.

For a development build on an iPhone via EAS, see
[docs/BUILD_IOS.md](docs/BUILD_IOS.md) — in particular, note that a physical
device build through EAS's cloud service requires a paid Apple Developer
Program account; a free Apple ID only works for Simulator builds or local
builds run on a Mac.

## Stack

- App shell: React Native (Expo, TypeScript)
- Map rendering: MapLibre React Native reading a local MBTiles (SQLite) tile store via `mbtiles://`
- Routing: custom on-device A* graph router over the classified road network (see docs/DATA.md for why not Valhalla/GraphHopper yet)
- Overlay data: GeoJSON — structures, roads/trails, and parcels overlays implemented
- Data sources: OpenStreetMap (via Planetiler), California statewide LiDAR, aerial/satellite imagery (e.g. NAIP), Microsoft Building Footprints, Sonoma County GIS (Parcels Public, Zoning & Land Use)

## Scope

Currently scoped to Sonoma County. Statewide California coverage is a possible future expansion but significantly increases storage and processing requirements.
