"""
Shared constants and helpers for the local LiDAR pipeline scripts.

Mirrors the relevant bits of ../src/config.ts (region bounds) — but unlike
../pipeline/ (the TypeScript OSM pipeline), everything this pipeline reads
or writes lives under DATA_ROOT, an external-drive path, not the repo
itself. This pipeline's own data — the DSM/DTM rasters especially — runs to
tens of GB, which doesn't belong on the same drive as the repo (particularly
here, where the repo sits inside OneDrive on a nearly-full C: drive). See
README.md for the full reasoning and how to point this elsewhere.
"""
import json
import os
import subprocess
import sys
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

# Everything this pipeline produces — tile index cache, DSM/DTM rasters,
# failed-tile log, scratch/temp files, and its own copy of the
# structures/roads overlays — lives here instead of under the repo.
# Override with the FREEROAM_LIDAR_DATA_ROOT environment variable if D:\
# isn't where you want it (a different drive, a different folder name,
# etc.) — nothing else in this pipeline hardcodes a drive letter.
DATA_ROOT = Path(os.environ.get("FREEROAM_LIDAR_DATA_ROOT", r"D:\FreeRoam-lidar-data"))

OVERLAYS_DIR = DATA_ROOT / "overlays"
LIDAR_DIR = DATA_ROOT / "lidar"
DSM_DIR = LIDAR_DIR / "dsm"
DTM_DIR = LIDAR_DIR / "dtm"
TILE_INDEX_PATH = LIDAR_DIR / "tile_index.geojson"
FAILED_TILES_LOG = LIDAR_DIR / "failed_tiles.txt"
TEMP_DIR = DATA_ROOT / "tmp"

STRUCTURES_PATH = OVERLAYS_DIR / "structures.geojson"
ROADS_PATH = OVERLAYS_DIR / "roads.geojson"

# The OSM pipeline (../pipeline/fetchStructures.ts, fetchRoads.ts) already
# wrote real data to these paths, under the repo on C: — 02_detect_structures.py
# and 03_detect_trails.py read from here exactly once, the first time
# STRUCTURES_PATH/ROADS_PATH don't exist yet on DATA_ROOT, so that data
# isn't silently lost. Every run after that reads/writes DATA_ROOT only.
LEGACY_STRUCTURES_PATH = REPO_ROOT / "data" / "overlays" / "structures.geojson"
LEGACY_ROADS_PATH = REPO_ROOT / "data" / "overlays" / "roads.geojson"

# GDAL/PDAL and Python's own tempfile module all default to the system temp
# directory (usually on C:) for scratch space — a reprojection/warp cache
# spillover, mainly. Redirect that here too, so nothing this pipeline does
# writes to C: even transiently. setdefault, not direct assignment: if
# you've already set these yourself, this won't override your choice.
#
# The directory has to exist *before* anything reads these env vars —
# Python's own tempfile module silently skips a TMP/TEMP candidate that
# doesn't exist yet rather than erroring, which would quietly defeat the
# whole point — so this creates it eagerly at import time rather than
# waiting for a script to call ensure_dirs().
TEMP_DIR.mkdir(parents=True, exist_ok=True)
for _env_var in ("TMPDIR", "TEMP", "TMP", "CPL_TMPDIR"):
    os.environ.setdefault(_env_var, str(TEMP_DIR))

# Running this conda env's python.exe directly (no `conda activate`) leaves
# the env's Library\bin off the Windows DLL search path. Imports still
# succeed — but numpy's BLAS backend (libblas.dll/MKL, in Library\bin) is
# delay-loaded on the *first actual BLAS call*, and with Library\bin
# unresolvable that first call dies with a native "Windows fatal exception:
# code 0xc06d007f" (the VC++ delay-load helper's procedure-not-found) — no
# Python traceback, uncatchable by any try/except, process gone. In this
# pipeline the first BLAS call is np.cov() inside 03_detect_trails.py's
# elongation filter, so the crash looked tile-dependent (it only fires on a
# tile that produces at least one width-filtered skeleton pixel) when it
# was purely environmental. Confirmed both ways with a bare
# np.cov(np.random.rand(100, 2)): crashes without Library\bin resolvable,
# fine with it. Prepending it here — PATH for the delay-load helper's
# legacy LoadLibrary search (and for the `pdal` subprocesses 01 spawns),
# add_dll_directory for the modern search path — makes every script in
# this pipeline safe to run via a bare path to python.exe. GDAL_DATA and
# PROJ_DATA get the same treatment (setdefault only) mainly for the `pdal`
# subprocesses, which inherit this environment and need them for their own
# GDAL writer stages. Note this does NOT silence the in-process one-time
# "Cannot find gdalvrt.xsd (GDAL_DATA is not defined)" warning — the GDAL
# DLL snapshots its environment when it loads, during rasterio's import,
# which happens before this module runs. That warning is cosmetic (VRT
# schema validation only) and every raster read/write here works despite
# it, verified across real runs.
if os.name == "nt":
    _library_bin = Path(sys.prefix) / "Library" / "bin"
    if _library_bin.is_dir():
        os.add_dll_directory(str(_library_bin))
        if str(_library_bin).lower() not in os.environ.get("PATH", "").lower():
            os.environ["PATH"] = f"{_library_bin}{os.pathsep}{os.environ.get('PATH', '')}"
    _gdal_data = Path(sys.prefix) / "Library" / "share" / "gdal"
    if _gdal_data.is_dir():
        os.environ.setdefault("GDAL_DATA", str(_gdal_data))
    _proj_data = Path(sys.prefix) / "Library" / "share" / "proj"
    if _proj_data.is_dir():
        os.environ.setdefault("PROJ_DATA", str(_proj_data))

# Same as REGION_BOUNDS in ../src/config.ts (WGS84 lon/lat).
REGION_SW = (-123.65, 38.05)
REGION_NE = (-122.30, 38.90)

# OpenTopography's own dataset shortname for the countywide Sonoma survey
# (2013 acquisition, 13.73 pts/m^2, whole-county coverage, ground-classified) —
# confirmed against the live OpenTopography Data Catalog API and tile index
# server while building this pipeline, not guessed. See README.md.
OT_DATASET_ALTERNATE_NAME = "SONOMA_LIDAR"
OT_TILE_INDEX_URL = (
    f"https://opentopography.s3.sdsc.edu/pc-bulk/"
    f"{OT_DATASET_ALTERNATE_NAME}/{OT_DATASET_ALTERNATE_NAME}_TileIndex.zip"
)

# All detection/measurement work happens in this projected, meters-based CRS
# (UTM Zone 10N — the standard projection for this part of Northern
# California) rather than in WGS84 degrees or the source data's native
# State Plane feet, so that areas/lengths/widths are directly in meters
# without unit-conversion bugs. Only the final vector outputs get
# reprojected to EPSG:4326 to match the app's GeoJSON schema.
WORKING_CRS = "EPSG:32610"
OUTPUT_CRS = "EPSG:4326"

DEFAULT_RESOLUTION_M = 1.0


def ensure_dirs() -> None:
    for d in (OVERLAYS_DIR, LIDAR_DIR, DSM_DIR, DTM_DIR, TEMP_DIR):
        d.mkdir(parents=True, exist_ok=True)


def verify_blas_works() -> None:
    """
    Runs numpy's cov + eigvalsh once in a throwaway subprocess before a long
    tile loop starts. A broken BLAS delay-load (see the Library\\bin comment
    at the top of this module) kills the process natively — no traceback, no
    catchable exception — so probing in-process would just reproduce the
    silent death this exists to prevent. A subprocess turns that native
    crash into a nonzero exit code this can report clearly, at startup,
    instead of a run dying without a message hours in. The subprocess
    inherits this process's environment, PATH fix included, so on a healthy
    setup it just passes (~1s, once per run).
    """
    probe = (
        "import numpy as np; a = np.arange(12, dtype=float).reshape(6, 2); "
        "np.linalg.eigvalsh(np.cov(a, rowvar=False))"
    )
    result = subprocess.run([sys.executable, "-c", probe], capture_output=True, text=True)
    if result.returncode != 0:
        raise SystemExit(
            "numpy's BLAS backend crashed on a trivial matrix operation "
            f"(probe exit code {result.returncode}). This almost always means the "
            "conda environment's DLLs aren't resolvable — run via `conda activate` "
            f"or check that {Path(sys.prefix) / 'Library' / 'bin'} exists. "
            "Aborting now rather than dying silently partway through the tile loop."
            + (f"\nProbe stderr: {result.stderr.strip()}" if result.stderr.strip() else "")
        )


def run_pdal_pipeline(pipeline: list, retries: int = 3) -> None:
    """
    Runs a PDAL pipeline (as a Python dict) via the `pdal pipeline` CLI in a
    subprocess rather than the pdal Python module directly — this is safe to
    call from multiple worker processes in parallel (ProcessPoolExecutor);
    the Python module's remote-read (curl/GDAL VSI) handles don't reliably
    survive being shared across threads/forked workers.

    Retries on failure (a remote tile stream can drop mid-read same as any
    other network fetch) with a short backoff, matching the pattern used in
    ../pipeline/overpass.ts for the OSM pipeline.
    """
    payload = json.dumps({"pipeline": pipeline})
    last_error = None
    for attempt in range(retries + 1):
        if attempt > 0:
            time.sleep(5 * attempt)
        result = subprocess.run(
            ["pdal", "pipeline", "--stdin"],
            input=payload,
            capture_output=True,
            text=True,
        )
        if result.returncode == 0:
            return
        last_error = result.stderr.strip()
    raise RuntimeError(f"pdal pipeline failed after {retries + 1} attempts: {last_error}")


def log_failed_tile(filename: str, reason: str) -> None:
    with open(FAILED_TILES_LOG, "a", encoding="utf-8") as f:
        f.write(f"{filename}\t{reason}\n")


def read_ndsm(dsm_path, dtm_path):
    """
    Loads a DSM/DTM tile pair and returns (ndsm, valid_mask, transform) —
    shared by 02_detect_structures.py and 03_detect_trails.py, which both
    start from the same "height above ground" signal and only differ in
    what they threshold it for (tall+solid vs. low+linear).

    01_generate_dsm_dtm.py pins both rasters to the same explicit bounds
    when it generates them, so in the normal case they already share one
    shape and transform exactly. This still checks rather than assuming
    it, and aligns to the overlapping window if not — a tile produced by
    an older run of that script (which let each of the two writers pick
    its own extent independently, and could come out a pixel off in either
    dimension — confirmed happening on roughly 60% of one real test batch)
    would otherwise crash every caller with a raw numpy broadcast error.
    Returns (None, None, None) if the two rasters turn out not to overlap
    at all, so callers can skip the tile instead of crashing.
    """
    import numpy as np
    import rasterio
    from rasterio.windows import Window, from_bounds

    with rasterio.open(dsm_path) as dsm_ds, rasterio.open(dtm_path) as dtm_ds:
        dsm_nodata = dsm_ds.nodata
        dtm_nodata = dtm_ds.nodata

        if dsm_ds.transform == dtm_ds.transform and dsm_ds.shape == dtm_ds.shape:
            dsm = dsm_ds.read(1)
            dtm = dtm_ds.read(1)
            transform = dsm_ds.transform
        else:
            left = max(dsm_ds.bounds.left, dtm_ds.bounds.left)
            bottom = max(dsm_ds.bounds.bottom, dtm_ds.bounds.bottom)
            right = min(dsm_ds.bounds.right, dtm_ds.bounds.right)
            top = min(dsm_ds.bounds.top, dtm_ds.bounds.top)
            if left >= right or bottom >= top:
                return None, None, None

            dsm_window = from_bounds(left, bottom, right, top, dsm_ds.transform)
            dtm_window = from_bounds(left, bottom, right, top, dtm_ds.transform)

            # Both rasters share the same resolution (01_generate_dsm_dtm.py
            # always grids DSM and DTM at the same --resolution), so these
            # two windows should already agree on size to within a rounding
            # error — clamp to the smaller of the two explicitly rather
            # than assume they match, so this path can never itself raise
            # a shape mismatch.
            rows = min(int(dsm_window.height), int(dtm_window.height))
            cols = min(int(dsm_window.width), int(dtm_window.width))
            if rows <= 0 or cols <= 0:
                return None, None, None

            dsm_window = Window(round(dsm_window.col_off), round(dsm_window.row_off), cols, rows)
            dtm_window = Window(round(dtm_window.col_off), round(dtm_window.row_off), cols, rows)

            dsm = dsm_ds.read(1, window=dsm_window)
            dtm = dtm_ds.read(1, window=dtm_window)
            transform = dsm_ds.window_transform(dsm_window)

    valid = (dsm != dsm_nodata) & (dtm != dtm_nodata)
    ndsm = np.where(valid, dsm - dtm, np.nan)
    return ndsm, valid, transform
