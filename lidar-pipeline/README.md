# Local LiDAR pipeline (spec §1, §4, §9, §15)

Fills the two gaps the OSM-based pipeline ([../pipeline/](../pipeline/))
couldn't: **undocumented structures** and **LiDAR-detected trail width**
(purple/pink bands with no OSM match). Both need real point-cloud
processing — PDAL, GDAL, and several GB of scratch disk — that the sandboxed
environment this app was otherwise built in doesn't have. This runs on your
own machine instead.

It does **not** replace `../pipeline/` — the OSM roads/parcels/search-index/
DEM data it already produced is real and stays as-is. This pipeline only
*adds* to the structures/roads overlays, appending new LiDAR-only features
alongside the existing OSM ones (see "How this fits with the OSM pipeline"
below).

## ⚠ If you have DSM/DTM tiles from before 2026-08-26, regenerate them

`01_generate_dsm_dtm.py` had a real bug until 2026-08-26: its cache
pipeline reprojected X/Y correctly but never converted Z (elevation) from
the source data's feet to meters — `filters.reprojection` doesn't do that
conversion on its own, and nothing else in the pipeline checked it.
Confirmed directly (a raw source tile's reported elevation range matched
the "reprojected" DSM's range to two decimal places — only possible if Z
was never touched) after real-terrain testing (Trione-Annadel State Park)
turned up impossible elevations (1267 "meters" in a park that tops out
under 600m). Flat, low-relief terrain like downtown Santa Rosa doesn't
make the bug obvious — the resulting numbers still look plausible even
though every height-based threshold downstream (`LOW_VEG_THRESHOLD_M`,
`MIN_HEIGHT_M` in 02/03) was being compared against values ~3.28x too
large. Width/elongation-based measurements were never affected — those
come from X/Y pixel spacing, which was always correct.

**Any DSM/DTM tile generated before the fix landed in `build_cache_pipeline`
(see its comment in `01_generate_dsm_dtm.py`) needs deleting and
regenerating** — there's no way to salvage the old rasters after the fact,
since the wrong Z values were already baked into the DSM/DTM grids
themselves. A quick check for whether a given tile is affected: open it and
look at its elevation range — Sonoma County tops out under 600m real
elevation anywhere, so a max noticeably above that (especially in hilly
terrain) means it predates the fix. Flat-terrain tiles can look
deceptively fine by this check even when they're wrong, so when in doubt,
check the tile's own file modification date against when you applied this
fix, not just its numbers. To force regeneration: delete both the `.tif`
in `DATA_ROOT\lidar\dsm\` and its counterpart in `DATA_ROOT\lidar\dtm\`,
then re-run `01_generate_dsm_dtm.py` with the same `--bbox` — resumability
means it only reprocesses what's missing.

**Everything this pipeline touches lives on an external drive, not the
repo.** Between the DSM/DTM rasters (tens of GB) and the conda environment
itself (PDAL/GDAL builds run 1–2GB), none of this belongs on the same drive
as the repo — especially if that drive is anywhere near full. Default is
`D:\FreeRoam-lidar-data`; see "What to install" and "Data root" below to
point it somewhere else.

## Data source

**[Sonoma County Vegetation Mapping and LiDAR Program](https://portal.opentopography.org/datasetMetadata?otCollectionID=OT.092014.2871.1)**,
hosted on OpenTopography (dataset shortname `SONOMA_LIDAR`) — confirmed
against the live OpenTopography Data Catalog API and tile-index server
while building this pipeline, not guessed:

- Countywide coverage (4,374 km², all of Sonoma County), flown Sep–Nov 2013
- 13.73 points/m² average density, ~60 billion points total
- Ground-classified (LAS Classification 2), NAD83(HARN) State Plane CA
  Zone II, US survey feet — each tile carries its own CRS, so the pipeline
  reprojects on read; you don't need to handle this yourself
- Split into 11,035 tiles (~640m × 640m each), ~30MB compressed (LAZ) apiece
  → **~330GB if you downloaded every tile raw**, which is exactly why this
  pipeline streams and crops each tile on the fly instead of storing them
  (see `01_generate_dsm_dtm.py`)

If a newer or higher-resolution county flight exists by the time you run
this, swap `OT_DATASET_ALTERNATE_NAME` in `common.py` for its OpenTopography
shortname — everything downstream stays the same.

## What to install

PDAL, GDAL, and scikit-image all have native binary dependencies that are
unreliable to install with plain `pip` on Windows (missing DLLs, GDAL
version mismatches between packages). Use conda-forge instead — and since
none of this belongs on a full C: drive, every step below lands on D:.

1. Install **[Miniforge](https://github.com/conda-forge/miniforge)** — a
   minimal conda installer that defaults to the conda-forge channel
   (regular Miniconda defaults to Anaconda's channel, which doesn't
   reliably carry PDAL). Download the Windows installer from the releases
   page. **When it runs, use "Just Me" install and change the install
   location** to something on D:, e.g. `D:\Miniforge3` — the installer has
   a text field for this on the destination-folder screen; the default is
   under your C: user profile.
2. Conda's *package cache* (the downloaded `.conda`/`.tar.bz2` files,
   shared across every environment you ever create) is separate from where
   an individual environment lives, and defaults to C: regardless of step
   1. Redirect it before creating anything: create (or edit)
   `%USERPROFILE%\.condarc` to include:
   ```yaml
   pkgs_dirs:
     - D:\conda-pkgs
   ```
3. Open a new terminal (so the installer's PATH changes take effect), then
   from the repo root, create the environment itself on D: too, via an
   explicit prefix rather than a named environment (named environments
   live under the conda install directory by default — a prefix sidesteps
   that entirely, one flag, no further config):
   ```bash
   conda env create -f lidar-pipeline/environment.yml -p D:\FreeRoam-lidar-env
   conda activate D:\FreeRoam-lidar-env
   ```
4. Verify:
   ```bash
   pdal --version
   python -c "import pdal, rasterio, geopandas, skimage, skan; print('ok')"
   ```

This environment is only for `lidar-pipeline/` — it's separate from the
Node/TypeScript tooling the rest of the app and `../pipeline/` use, and
none of the above touches conda setups you might already have for other
projects (the `pkgs_dirs` change in step 2 is the one exception — that
cache is shared globally by design, which is exactly why it's worth moving
regardless of what else you use conda for).

## Data root

Every path this pipeline reads or writes — tile index cache, DSM/DTM
rasters, the failed-tiles log, scratch/temp files, and its own copy of the
structures/roads overlays — is controlled by one constant in `common.py`,
`DATA_ROOT`, which defaults to `D:\FreeRoam-lidar-data`. Override it with
the `FREEROAM_LIDAR_DATA_ROOT` environment variable if you want it
somewhere else (a different drive, a different folder name):
```bash
export FREEROAM_LIDAR_DATA_ROOT="E:\lidar-data"   # bash
$env:FREEROAM_LIDAR_DATA_ROOT = "E:\lidar-data"   # PowerShell
```
`structures.geojson`/`roads.geojson` under `DATA_ROOT\overlays\` are this
pipeline's own copies, separate from the ones `../pipeline/` already wrote
under the repo (`../data/overlays/`, on C:). The first time
`02_detect_structures.py`/`03_detect_trails.py` run, they seed themselves
from the repo copy (so the real OSM data isn't lost) and write everywhere
after that to `DATA_ROOT` only — see "How this fits with the OSM pipeline"
below. When you're ready to put the merged result on a device, grab the
file from `DATA_ROOT\overlays\`, not the repo.

## Disk space and time — read this before running the whole county

- **Peak disk usage stays modest regardless of county size**: tiles are
  streamed and processed one at a time, never bulk-downloaded (see above).
  What accumulates on disk is the derived output: at 1m resolution, DSM +
  DTM GeoTIFFs for the whole county come to roughly **15–25GB**
  (compressed; exact size depends on terrain — Sonoma's hills compress less
  uniformly than flat ground). The final structures/roads GeoJSON additions
  are small (a few MB at most).
- **Time is the real cost**: 11,035 tiles, each three PDAL passes (cache +
  reproject, DSM grid, DTM grid — see `01_generate_dsm_dtm.py`'s docstring
  for why three, not one). ~60 seconds per tile end to end was the
  measurement from an early, small, downtown-Santa-Rosa test batch — treat
  that as a best case, not a reliable estimate. A later real test batch
  (Trione-Annadel State Park tiles) ran noticeably slower against the same
  connection with no code change, consistent with OpenTopography applying
  some form of fair-use throttling as cumulative usage against their public
  server adds up over a session — confirmed by directly timing a plain
  `curl` HEAD request against the same host (fast) against the actual
  tile-stream download (much slower), ruling out a local network problem.
  At 4 parallel workers and the original ~60s/tile figure, a full-county run
  would be roughly **45 hours** (call it two days); expect it to run
  slower than that in practice, and plan for a run that may need to be
  restarted or throttled back if OpenTopography starts actively rejecting
  requests rather than just slowing them. It's fully resumable (`Ctrl-C` and
  re-run picks up where it left off — see that script's docstring), so
  running it in the background across several sessions — and expecting it
  to take longer than any single estimate — is the realistic plan. Bandwidth
  is normally the bottleneck, not CPU, so raising `--workers` beyond 4 (e.g.
  6–8) can help on a good connection, but won't undo server-side throttling
  — don't go so high you look like the thing causing it.
- **Start small.** Every script accepts `--bbox MINLON MINLAT MAXLON MAXLAT`
  and `01_generate_dsm_dtm.py` also accepts `--limit N`. Run the whole
  pipeline against a small area you actually ride first — it takes minutes,
  not hours — and check the output in QGIS before committing to a
  county-wide run. This especially matters for `03_detect_trails.py`, whose
  thresholds are a heuristic (see its docstring) and may need tuning for
  what you're actually seeing before it's worth the full run.

## Running it

From the repo root, with the `D:\FreeRoam-lidar-env` conda environment
active (activation is the clean way; invoking the env's `python.exe` by
bare path also works — `common.py` repairs the Windows DLL search path
itself at import, after a real native-crash lesson documented under
"Known limitations" below):

```bash
python lidar-pipeline/00_fetch_tile_index.py
python lidar-pipeline/01_generate_dsm_dtm.py --bbox -122.75 38.40 -122.65 38.48   # small test area first
python lidar-pipeline/02_detect_structures.py --bbox -122.75 38.40 -122.65 38.48
python lidar-pipeline/03_detect_trails.py --bbox -122.75 38.40 -122.65 38.48
```

Once you're happy with a test area's output, drop `--bbox` (and `--limit`,
if you used it) to run against the full county — same commands, no other
changes needed since 00/01 are resumable and 02/03 just read whatever
tiles exist under `DATA_ROOT` (`D:\FreeRoam-lidar-data\lidar\` by default).

Load the resulting `DATA_ROOT\overlays\structures.geojson` and
`roads.geojson` in QGIS (or any GIS tool) over aerial imagery to spot-check
before copying them to a device — see the honest limitations below and in
each script's docstring.

## How this fits with the OSM pipeline

`02_detect_structures.py` and `03_detect_trails.py` both **load the
existing** structures/roads overlay (produced by
`../pipeline/fetchStructures.ts` / `fetchRoads.ts`, seeded from the repo
the first time as described in "Data root" above) and only **append** new
features:

- Structures: a LiDAR-detected building candidate that overlaps an existing
  OSM-documented footprint is treated as already known and dropped. Only
  candidates with no OSM match get added, as `{"documented": false}`.
- Roads: a LiDAR-detected linear clearing that mostly coincides with an
  existing OSM road/track is dropped as a duplicate. Only new segments get
  added, as `{"source": "lidar", "widthMeters": <measured>}` — the app's
  existing `classifyRoad()` (`../src/overlays/roadClassification.ts`)
  already turns that into the purple (<1m) / pink (1–3m) / red (3m+) bands
  with no changes needed on the app side.

Run 01/02/03 again later (e.g. after `../pipeline/fetchRoads.ts` picks up
newer OSM data) and they'll re-detect against the current file each time —
they don't track what they added last run, so re-running after manually
editing either GeoJSON file will re-evaluate everything currently in it.

## Known limitations — read before trusting the output

Both detection scripts are heuristics over an elevation signal, not
verified structure/trail data, and Sonoma's terrain (heavy tree cover in
places, extensive vineyard/agricultural land) is a genuinely hard case for
both:

- **Structures**: false positives from dense, flat-topped brush or tight
  tree clusters that pass the size/solidity filter; false negatives for
  anything under thick canopy LiDAR can't see through to the roof.
  **Confirmed at real scale**: a direct run of `02_detect_structures.py`
  against 14 real, Z-fix-verified tiles (~5.6 km²) covering part of
  Trione-Annadel State Park produced 2,258 raw candidates, 1,192 of them
  with no OSM footprint match — in a state park with only a handful of
  actual buildings (a visitor center, a couple of ranger structures), the
  overwhelming majority of those 1,192 are almost certainly dense forest
  canopy, not real undocumented buildings. Downtown Santa Rosa (flatter,
  far less tree cover) did not show this problem at anywhere near this
  rate. **Treat `documented: false` output as close to unusable in heavily
  wooded terrain without a QGIS/aerial-imagery spot-check** — the
  size/solidity filter alone doesn't separate a compact grove from a
  compact roofline at this data's resolution. Tightening `MIN_SOLIDITY`
  further wasn't tested here; the existing/undocumented cross-reference
  logic itself is not in question — this is purely a shape-based false-
  positive rate in canopy-heavy terrain, worth a follow-up filter (e.g.
  cross-referencing against known tree-canopy/land-cover data, if a real
  county land-cover layer can be found) before trusting a county-wide run
  in the hillier, more forested two-thirds of Sonoma County.

### Trail detection: a CLOSED research question — read this before reopening it

**Detecting unmapped trails from this LiDAR dataset does not work, and is
not an open TODO.** Three approaches were designed, implemented, and
measured against real mapped trails in real Sonoma terrain over
2026-08-26/27. All three failed, each for a different and now
well-understood reason. The per-approach bullets below this summary carry
the full numbers; this section exists so nobody re-derives them from
scratch.

| # | Approach | Core finding | Why it failed |
|---|---|---|---|
| 1 | **nDSM clearance** (shipped, default) | Finds real *mapped* roads reliably; 233 of 337 candidates in one run correctly matched OSM ways | Every unmatched candidate was the *edge of a wider clearing* — median width pinned at the 4m cap. Now rejected by `CAP_PINNED_WIDTH_M`, which removed 100% of false positives and 100% of all candidates |
| 2 | **Canopy-gated clearance** (`--canopy-mode`, off) | Median on-trail nDSM is 11–14m — the DSM over a canopy trail *is the canopy top* | The corridor is ~80% absent from the signal, so no threshold recovers it. Worse, signal and gate **anti-correlate**: trails with residual signal sit in sub-60% TCC cells where the gate never fires; fully-gated closed canopy has no signal at all |
| 3 | **DTM bench-cut** (probe only, not implemented) | **The signal is real** — flatness ratio 0.15 on-trail vs 0.58 on paired controls (n=693), and it *survives closed canopy* | A blind detector can't exploit it. Searching transect orientations (unavoidable without ground truth) inflates false positives ~3× at K=12 and collapses the continuity filter to 1.4× — ~17k false county-wide candidates |

**The unifying lesson**, and the reason a fourth attempt along these lines
is not advisable: a per-pixel elevation statistic plus a shape/length
filter is the wrong tool for this. Approaches 1 and 2 failed on *missing
signal* (canopy occludes the surface the statistic reads). Approach 3
proved the signal exists in the bare-earth data, and still failed on
*missing orientation* — the coherence that made it look promising was
ground-truth trail direction leaking into the measurement. Anything that
works from here needs orientation coherence as an explicit optimization
term (geodesic/minimal-path tracking over position+direction, or
Hough-style accumulation), which is a categorically different piece of
engineering from this pipeline's threshold-and-skeletonize design, with
no evidence it clears the same false-positive arithmetic.

**What this means practically**: `03_detect_trails.py` stays in the
pipeline and stays useful — it runs clean, cross-references correctly
against OSM, and its cap-pinned filter keeps it from emitting garbage. It
simply produces few or no `source: "lidar"` features on real terrain, and
**that is the correct, honest output, not a bug to chase.** The app's
purple/pink width bands (`src/overlays/roadClassification.ts`) are fully
implemented and will render correctly the day a detector produces real
features for them. Spec §15's trail-width capability is therefore
*implemented but unfed* — the honest status, matching how every other gap
in this project is recorded.

If new data changes the premise — a higher-resolution or leaf-off LiDAR
flight, or a published trail dataset to cross-reference — that is a reason
to revisit. Another pass over *this* 2013 dataset with a different
threshold is not.

- **Trails — a native crash, now fixed and understood (kept here so the
  error stays findable)**: `03_detect_trails.py` used to die outright — no
  Python traceback, exit code 127, uncatchable by any `try`/`except` — with
  `Windows fatal exception: code 0xc06d007f` inside `numpy`'s `cov()` call,
  visible only under `python -X faulthandler`. This looked tile-dependent
  (it fired on real Annadel terrain, never downtown) but wasn't: `np.cov()`
  in the elongation filter is this pipeline's *first actual BLAS call*, and
  numpy's BLAS backend (`libblas.dll`/MKL in the conda env's `Library\bin`)
  is delay-loaded at that first call — which fails natively if the env's
  `python.exe` was invoked directly without `conda activate` putting
  `Library\bin` on the DLL search path. Confirmed both ways with a bare
  `np.cov(np.random.rand(100, 2))`: crashes without it, fine with it — no
  tile data involved at all. Fixed in `common.py`, which now repairs the
  DLL search path itself at import time (every script is safe to run via a
  bare path to `python.exe`), and `03_detect_trails.py` additionally probes
  BLAS in a throwaway subprocess at startup so any *other* environment
  breakage fails immediately with a clear message instead of silently
  partway through a county-wide run. Verified after the fix: the exact
  previously-crashing tile (`ot_SOCO_0037_090.tif`) and the full 14-tile
  Annadel set both run to completion in the previously-crashing
  environment; the run found 2 real candidates (one matching White Oak
  Drive, one matching an unnamed mapped public way inside the park), both
  correctly dropped as already OSM-documented.
- **Trails — the cap-pinned-median filter, and what it revealed**: every
  candidate segment the detector produced across both real test areas
  (downtown Santa Rosa and a 90-tile Sonoma Mountain foothills /
  Rohnert Park run — 337 candidates in the latter) had a *median* width
  pinned at the 4m width cap: the signature of a wider cleared area's
  edge (parking, farmyard, field margin, road shoulder), not a trail.
  `CAP_PINNED_WIDTH_M` in `03_detect_trails.py` now rejects that
  signature outright (see its comment for the evidence), which
  eliminated 100% of the confirmed false positives — and, honestly,
  100% of all candidates so far: **no genuine sub-3.9m-median trail
  candidate has yet been observed in any area this pipeline has been
  run on.** The purple/pink detection capability is implemented and
  runs clean end to end, but is so far unproven against a confirmed
  real unmapped trail — see the canopy limitation below for the likely
  reason, and treat any future "0 candidates" result on wildland
  terrain as expected behavior, not a bug.
- **Trails — canopy cover, still open (and the land-cover fix has now
  been tried and ruled out)**: LiDAR's max-surface DSM can't resolve
  ground-level clearance under dense oak/fir canopy, and Sonoma's actual
  singletrack mostly lives exactly there. The previously-proposed fix —
  an NLCD Tree Canopy Cover cross-reference that relaxes thresholds
  under canopy — **was implemented and evaluated on 2026-08-27, and does
  not work on this dataset**: measured directly along 8,605m of
  Annadel's mapped Warren Richardson / North Burma / Two Quarry
  centerlines, median on-trail nDSM is 13.8m (canopy top); only 12.6%
  of on-trail pixels clear the open-terrain 0.4m threshold and only
  18.3% clear a canopy-relaxed 2m one, so no threshold reconnects a
  corridor that is ~80% missing from the signal itself. The only
  behavioral change observed was a new false-positive surface
  (tree-lined streets escaping the cap-pinned rejection). The
  implementation is kept behind `--canopy-mode` (off by default) purely
  so the negative result stays reproducible — see the "What was tried
  and didn't help" ledger in `03_detect_trails.py`'s docstring for the
  full numbers. A second test on genuine fire-road country (2026-08-28,
  the mapped doubletrack cluster east of Annadel: 16.4km of Ridge /
  Marsh / Lawndale / Schultz / Pig Flat / Powerline / Rhyolite) confirmed
  it structurally: the clearance signal and the canopy gate
  *anti-correlate* — partial oak canopy erases the nDSM corridor over
  exactly the doubletrack that has some signal left, without those cells
  registering as closed canopy (TCC >= 60%), while fully-gated closed
  canopy has no signal at all. No TCC threshold fixes that, and the
  test's only candidate was a confirmed powerline-cut false positive.
- **Trails — DTM micro-topography (bench-cut detection): signal is real,
  a blind detector still isn't**. The idea that survived the canopy
  work: ground returns *do* penetrate canopy, so instead of looking for
  a clearance gap overhead, look for the flattened shelf a constructed
  sidehill trail leaves in the bare-earth DTM. Probed on 2026-08-27
  against 32km of mapped trail (Warren Richardson, North Burma, Two
  Quarry, Marsh, Lawndale, Ridge, Schultz, Pig Flat), sampling a ±10m
  cross-slope transect every 5m against paired controls 30m off the
  same perpendicular. **The signal is genuinely there**, unlike
  everything else in this ledger: flatness ratio (tread gradient ÷
  ambient cross-slope) median 0.15 on trail vs 0.58 on control over 693
  paired sidehill samples, trail flatter than its own paired control
  82.8% of the time — and crucially it *survives closed canopy*
  (TCC ≥ 60%: 0.23 vs 0.52, P=75.3%), the regime where every nDSM-based
  approach sees nothing at all.
    Two findings then killed the detector, not the signal.
    First, the shape isn't what the cut-and-fill model predicts: the
  elevation residual at the flattest point versus the ambient slope
  line is ≈0 (−0.05m trail, +0.04m control). There is no measurable cut
  on the uphill side or fill lip on the downhill side — only
  *flattening*, a shelf sitting on the natural slope line. A detector
  keyed to cut/fill asymmetry would find nothing.
    Second, and decisive: the probe measured the statistic at *known
  locations with known orientation*, and a real detector has neither.
  Re-measured blind (every pixel, min-over-K transect orientations,
  no centerline search) on three no-mapped-way sidehill control tiles:
  searching orientations inflates the control false-positive rate ~3×
  at K=12 (3.4% of sidehill pixels below threshold at K=1 → 10.1% at
  K=12 → 12.5% at K=24, still climbing with finer angular sampling),
  while trail pixels only reach a 25.6% bench rate — about 2.4×
  enrichment, because trail transects were already near-optimally
  oriented and had nowhere to improve. The continuity filter that
  looked so promising (495m of unbroken bench along a known centerline,
  vs 40m max on controls) then collapses: at the 0.33 threshold the
  trail tiles produce **zero** skeleton paths ≥50m while a control tile
  produces one, and at every looser threshold the controls keep pace
  (0.70: 2.33 paths ≥50m per trail tile vs 1.67 per trail-free control,
  a 1.4× ratio → roughly 17,000 false candidates county-wide from
  trail-free tiles alone).
    The reason is worth recording: that 495m coherent run existed
  because orientation stayed consistent along the path *by
  construction*, being ground truth. A blind search picks whichever
  direction looks flattest at each pixel independently, producing
  spatially incoherent speckle that never assembles into long connected
  structures. The coherence was largely the ground truth leaking into
  the measurement — a good cautionary tale for the next probe.
    What would actually be required is orientation coherence as an
  explicit optimization term rather than a per-pixel maximum: minimal-
  path/geodesic tracking through an (position, direction) state space,
  or Hough-style accumulation. That is categorically bigger than this
  pipeline's threshold-and-skeletonize architecture, with no evidence
  yet that it clears the same false-positive arithmetic. **Not
  attempted, and not recommended on current evidence.**
- **Trails**: false positives from drainage ditches, fence lines, and
  vineyard/agricultural access rows narrow enough to pass both the width
  and elongation filters (see `03_detect_trails.py`'s docstring for what
  the elongation filter is and the real false-positive pattern — small
  paved areas near buildings — it was added to catch); false negatives
  under canopy, same as structures, plus one specific to the elongation
  filter, now substantially narrowed but not eliminated: a real trail
  opening directly into a genuinely large clearing (a real trailhead lot)
  still loses a bounded stretch near that clearing, and can lose its
  entire length if what's left doesn't clear MIN_TRAIL_LENGTH_M on its
  own. The window that measures elongation now scales down for narrower,
  more typical trails instead of using one size sized for the width cap,
  which removes the false-negative risk entirely for candidates with no
  genuinely attached wider feature (confirmed against real data) — see
  the docstring for exactly what was tried to narrow the remaining gap
  further (several approaches, each checked against real data and ruled
  out) before accepting it as a bounded, understood residual.

Each script's docstring documents its tunable constants and the reasoning
behind them. Expect to adjust thresholds and re-run against your test area
rather than trusting the defaults blind — this mirrors how every other
real-data step in this project (see `../docs/DATA.md`) has been built:
real data plus an honestly-documented gap, not a black box.

## If a tile gets skipped

`02_detect_structures.py`/`03_detect_trails.py` print `Skipping <tile>: ...`
and keep going rather than crashing the whole run if one tile's DSM/DTM
can't be read together — every other tile's real detections still make it
into the output. This shouldn't happen for tiles `01_generate_dsm_dtm.py`
generated itself (it pins both rasters to one shared extent precisely so
this can't occur — see its docstring), but can if you're mixing in tiles
from an older run of that script, or any other unforeseen cause. A
skipped tile just means that one tile's area has no detections added this
run — re-running `01_generate_dsm_dtm.py` for it (delete its DSM/DTM pair
first to force regeneration, since it's otherwise skipped as
already-done) will fix it going forward.
