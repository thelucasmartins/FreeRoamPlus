# FreeRoam+

Offline off-road navigation and terrain-awareness app for adventure riding in Sonoma County. Combines turn-by-turn routing with LiDAR-derived structure and road detection — built to run with zero internet connection once installed.

## What it does

- **Turn-by-turn offline routing** — routes any road or path in the dataset, including private and unclassified roads, using an on-device routing engine (Valhalla/GraphHopper).
- **Multiple map layers** — street, satellite, LiDAR (hillshade/nDSM), and hybrid views, all pre-rendered and stored locally.
- **Structure detection** — flags man-made buildings from LiDAR nDSM data, distinguishing known/documented structures from undocumented ones not present in public footprint databases.
- **Road classification** — color-coded by type: green (public/government-maintained), yellow (national forest/protected land), red (private or unclassified/undocumented).
- **Trail width classification** — LiDAR-detected paths with no OSM classification are bucketed by cleared width: under 1m as hiking trail (purple), 1–3m as ATV trail (pink), 3m+ as drivable road (green/yellow/red per the rule above). Only drivable-width paths join the routable road network.
- **Parcel boundaries** — toggleable parcel layer; tap a parcel to see lot size, zoning, and APN (no owner names — that field doesn't exist in this app's data at all). Resource-extraction parcels (timber, mining, milling) are visually flagged separately based on zoning data.
- **Elevation/grade indicator** — shows incline and steepness along a route or road segment.
- **Destination selection** — tap anywhere to pin and route to that exact coordinate, or search by name/address/road using an offline index built from OSM data (public/named locations only, consistent with the labeling rule). Pins with no nearby routable path still get a route to the nearest reachable point, flagged as off-network beyond that.
- **Waypoints** — drop pins with notes anywhere on the map, saved locally.
- **Breadcrumb trail** — optional, manually-toggled trail of the current ride for backtracking.
- **Live GPS tracking** — uses the phone's onboard GPS chip directly, no signal required. A locate button recenters and locks the camera to your position (tap again to release); it also handles permission prompts, a "location off" state with a way to fix it, and an "Acquiring GPS…" indicator during the first fix.

## Why offline

Everything — map tiles, routing graph, LiDAR-derived layers, and parcel data — is pre-processed and bundled onto the device ahead of time. No servers, no live API calls, no signal required once the data is loaded. Built for use in areas with zero cell coverage.

## Status

🚧 In active development. See [offline-nav-lidar-spec.md](offline-nav-lidar-spec.md) for the full project specification.

Build-order steps 1–4 are done, plus the parcels overlay from spec §4: an
Expo/React Native app that renders a local Sonoma County MBTiles database
with MapLibre, fully offline once the tile file is on the device (step 1); a
toggleable structures layer distinguishing documented buildings (blue) from
LiDAR-flagged undocumented ones (red, dashed outline) (step 2); a toggleable
roads/trails layer applying the spec §5 green/yellow/red road classification
plus the spec §15 width-based trail bands — purple for hiking trails under
1m, pink for ATV trails 1–3m (step 3); a live GPS position dot with a
follow-me camera button, permission/settings handling, and a first-fix
indicator (step 4); and a toggleable, tap-for-details parcels layer (size,
zoning, APN — never owner name) with resource-extraction parcels flagged
separately. All three overlays run on bundled placeholder data until the
real pipeline/GIS output is on-device — see [docs/DATA.md](docs/DATA.md),
which also covers the vector-tile approach needed for the parcels layer to
hold up at full Sonoma County scale (previously a known failure point).
Packaging as an installable app shell (step 5) is what's left.

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
- Routing (planned): Valhalla or GraphHopper (on-device)
- Overlay data: GeoJSON — structures, roads/trails, and parcels overlays implemented
- Data sources: OpenStreetMap (via Planetiler), California statewide LiDAR, Microsoft Building Footprints, Sonoma County GIS (Parcels Public, Zoning & Land Use)

## Scope

Currently scoped to Sonoma County. Statewide California coverage is a possible future expansion but significantly increases storage and processing requirements.
