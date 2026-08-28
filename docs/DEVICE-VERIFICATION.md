# On-device verification pass

The final acceptance step: proving FreeRoam+ works on real hardware with
real Sonoma County data. Everything else in this repo can be verified from
a desktop. This cannot — it needs a human holding the phone.

Run it in order. Each step is chosen so that a failure tells you *which*
part broke, rather than leaving you to guess. Stop and record the failure
rather than skipping ahead; a later step passing doesn't clear an earlier
one that failed.

## Before you start

| Requirement | Check |
| --- | --- |
| Metro running | `npx expo start --dev-client` from the repo root |
| File server running | `npx serve --cors -l 8080 data` from the repo root |
| Phone and desktop on the same Wi-Fi | Same subnet; a phone on cellular reaches nothing |
| `src/config.ts` host matches this machine | LAN IP is DHCP-assigned and changes |

Confirm the desktop can see its own server before blaming the phone:

```bash
curl -sI http://<LAN-IP>:8080/overlays/dem.json
```

## Step 1 — Prove the transfer path (18KB)

Tap **Test connection only (18KB)** on the setup screen.

This downloads `dem.json` alone, and it is deliberately first: it exercises
the entire delivery mechanism — URL resolution, Windows Firewall, the
disk-space preflight, the stall timeout, the atomic write, and the store's
read path — in about a second, before committing to a multi-hundred-megabyte
transfer.

- **Passes** → the whole transfer path works. Everything after this is
  about data volume, not plumbing.
- **Fails** → stop. Nothing else will work. The message distinguishes the
  causes: a connection error means wrong host or firewall; "not enough
  space" is the preflight doing its job; "Download stalled" means the
  server is reachable but not delivering.

## Step 2 — Real overlay data

Tap **Download overlay data**.

Budget roughly **150MB** for what a tiles-equipped device actually needs
(roads, search index, DEM), or ~310MB if you pull everything including the
GeoJSON sources. See `docs/DATA.md` §2 for the split — the short version is
that `structures.geojson` and `parcels.geojson` are *unnecessary* once the
tile databases are installed, since the stores resolve tiles-first and
never read them.

Expect several minutes. Per-file progress is shown; failures are reported
per file and do not abort the rest.

Then check the Metro console. Each store logs a real measurement:

```
roads [file]: 47.0MB — parse 000ms, classify 000ms, 119071 features
```

**These numbers are the point of this step**, not just that it succeeded:

- **`roads` is the one to watch.** It is the only large overlay still
  loading as GeoJSON, because it feeds the routing graph as well as the
  map, and viewport-streamed tiles cannot produce a complete graph. If it
  stalls the UI, the parse and classify timings tell you which half to fix
  — a slow parse means it needs the vector-tile treatment plus a separate
  routing extract; a slow classify means `classifyRoads()` needs
  optimising. Those are completely different fixes.
- `search-index` (12MB) and `dem` (18KB) should be unremarkable.

## Step 3 — Vector tiles (only after the desktop build confirms)

Tap **Download structures & parcels as vector tiles**.

Do **not** run this until the desktop conversions have completed and
verified. A build in progress leaves a valid-but-empty SQLite file at the
served path, and the app will correctly refuse it as *incomplete
database* — that is the guard working, not a bug.

On success the stores stop reading the GeoJSON entirely:

```
structures [tiles]: 38.9MB — 0ms parse
```

A `0ms parse` on structures is the whole migration paying off: the ~102MB
GeoJSON is never touched.

## Step 4 — The map itself

With `sonoma.mbtiles` installed, the app should reach the map directly
rather than the setup screen. Confirm the basemap is **Sonoma County, not
a generic world map** — the latter means it fell back to the online demo
style and the offline basemap isn't loading.

Check all seven source layers actually render, since a tile set missing
some of them still looks superficially fine: **roads, buildings, water,
waterways, parks, landcover, county boundary.** Missing water and parks on
an off-road navigation app is a functional gap, not a cosmetic one.

## Step 5 — Core features

Each of these has been verified only by typecheck and desktop reasoning.
None has run on real hardware.

| Feature | What to do | What proves it |
| --- | --- | --- |
| GPS permission | Launch, accept the prompt | Blue dot appears at your real position |
| Follow mode | Tap the follow control | Camera tracks you and rotates with heading |
| Overlay toggles | Toggle structures / roads / parcels | Each appears and disappears; no "Sample data" badge once real data is installed |
| Parcel tap | Tap a parcel | Info card shows APN, acreage, zoning — **this is the one at risk from the vector-tile migration**; it depends on press events surviving the source swap |
| Search | Search a Sonoma place name | Result flies the camera there |
| Routing | Long-press a destination | Route draws; elevation profile appears with gain/loss and max grade |
| Waypoints | Save one, reopen, delete it | Persists across an app restart |
| Breadcrumb | Start recording, walk a little | Trail draws behind you |
| GPS loss | Start recording, then disable Location | **"No GPS — trail paused"** badge appears rather than silently recording nothing |

## Step 6 — The actual point

Put the phone in airplane mode and confirm the map still works: pan, zoom,
overlays, search, routing. That is the entire premise of the app, and it
is the only step that proves it.

## Recording results

Note, for each failure: what you tapped, what you expected, what happened,
and anything in the Metro console at that moment. A failure with console
output is usually diagnosable immediately; one without it usually needs
the whole sequence run again.
