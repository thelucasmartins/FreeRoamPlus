# FreeRoam+

Offline off-road navigation and terrain-awareness app for adventure riding in Sonoma County. Combines turn-by-turn routing with LiDAR-derived structure and road detection — built to run with zero internet connection once installed.

## What it does

- **Turn-by-turn offline routing** — routes any road or path in the dataset, including private and unclassified roads, using an on-device routing engine (Valhalla/GraphHopper).
- **Multiple map layers** — street, satellite, LiDAR (hillshade/nDSM), and hybrid views, all pre-rendered and stored locally.
- **Structure detection** — flags man-made buildings from LiDAR nDSM data, distinguishing known/documented structures from undocumented ones not present in public footprint databases.
- **Road classification** — color-coded by type: green (public/government-maintained), yellow (national forest/protected land), red (private or unclassified/undocumented).
- **Parcel boundaries** — toggleable parcel layer showing lot size, zoning, and APN (no owner names). Resource-extraction parcels (timber, mining, milling) are visually flagged separately based on zoning data.
- **Elevation/grade indicator** — shows incline and steepness along a route or road segment.
- **Waypoints** — drop pins with notes anywhere on the map, saved locally.
- **Breadcrumb trail** — optional, manually-toggled trail of the current ride for backtracking.
- **Live GPS tracking** — uses the phone's onboard GPS chip directly, no signal required.

## Why offline

Everything — map tiles, routing graph, LiDAR-derived layers, and parcel data — is pre-processed and bundled onto the device ahead of time. No servers, no live API calls, no signal required once the data is loaded. Built for use in areas with zero cell coverage.

## Status

🚧 In active development. See [offline-nav-lidar-spec.md](offline-nav-lidar-spec.md) for the full project specification.

Build-order step 1 (offline map rendering) is scaffolded: an Expo/React Native
app that renders a local Sonoma County MBTiles database with MapLibre, fully
offline once the tile file is on the device. Routing, overlays, and the other
layers come next.

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

## Stack

- App shell: React Native (Expo, TypeScript)
- Map rendering: MapLibre React Native reading a local MBTiles (SQLite) tile store via `mbtiles://`
- Routing (planned): Valhalla or GraphHopper (on-device)
- Overlay data (planned): GeoJSON (structures, roads, parcels)
- Data sources: OpenStreetMap (via Planetiler), California statewide LiDAR, Microsoft Building Footprints, Sonoma County GIS (Parcels Public, Zoning & Land Use)

## Scope

Currently scoped to Sonoma County. Statewide California coverage is a possible future expansion but significantly increases storage and processing requirements.
