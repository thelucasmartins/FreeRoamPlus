"""
Streams each LiDAR tile directly from OpenTopography (no bulk local LAZ
storage — a full-county raw download would be hundreds of GB) and grids it
into a DSM (top-of-canopy/roofline surface) and DTM (bare-earth surface)
GeoTIFF pair, both reprojected to WORKING_CRS (UTM 10N, meters).

nDSM = DSM - DTM (computed later, in 02/03) is the elevation-above-ground
signal that both structure and trail detection are built on — this script
just produces the two raw surfaces.

Three PDAL pipeline runs per tile, not one:
  1. Read the remote tile once, reproject, cache locally (compressed LAZ,
     under TEMP_DIR, deleted once 2/3 are done).
  2. Grid the cache into the DSM (all non-noise points, tag Classification
     7 per the ASPRS LAS spec — cheap, and trusts the vendor's own noise
     flagging rather than recomputing it).
  3. Grid the cache into the DTM (ground-classified points only,
     Classification 2 — inherently excludes noise too).
This used to be one pipeline with two writer branches sharing a single
read+reprojection — which silently produced only the DSM. PDAL's `pdal
pipeline` CLI does not run multiple independent writer/leaf stages in one
invocation; it prints "Pipeline has multiple leaf nodes... Only the first
... will be run" to stderr and returns exit code 0 regardless, so the
DSM-only result never looked like a failure. Splitting into separate
single-writer pipelines, sharing one cached local read instead of two
remote ones, fixes both that and a second problem it was masking: an
earlier version ran `filters.outlier` (statistical) across the full point
set before gridding, which took 90-180+ seconds per tile on its own —
correct in isolation, but multiplied across 11,000+ tiles that would have
made a full-county run take over a week. Trusting the vendor's
classification instead costs nothing in correctness for tiles from a
already-classified survey like this one, and the measured per-tile cost
dropped to well under a minute end to end.

Both grid pipelines are also pinned to the *same explicit bounds* (read
from the cache file's own header) rather than letting each `writers.gdal`
compute its own extent from whatever points happen to survive its own
filter. Left to compute independently, the DSM (all non-noise points) and
DTM (ground-only points) cover very slightly different real-world extents
— off by a fraction of a pixel — and GDAL rounds each to a whole-pixel grid
on its own, which can and does produce different origins and dimensions
between the two (confirmed directly: 10 of 16 tiles in one real test batch
came out mismatched by exactly one row or column). nDSM = DSM - DTM needs
the two arrays pixel-aligned, so this is fixed at generation time here,
with a second, independent safety net in common.py's read_ndsm() for any
tile that still doesn't match (produced by an older run of this script,
or any other unforeseen cause).

The cache pipeline also explicitly rescales Z — see build_cache_pipeline's
own comment for the full story, but in short: `filters.reprojection`
reprojects X/Y correctly but leaves Z untouched even when the source and
target CRS use different vertical units, which for this dataset (source
CRS in US survey feet) meant every elevation value was silently ~3.28x
too large until this was added. Confirmed directly by comparing a raw
source tile's reported Z range against the "reprojected" DSM's elevation
range — identical to two decimal places, which is only possible if Z was
never touched. This was in the pipeline for a while before being caught
(flat, low-relief downtown terrain doesn't make a wrong height threshold
obvious — a park with 500m+ of real relief does), so if you generated
tiles before this fix, they need regenerating: every height-based
threshold in 02_detect_structures.py / 03_detect_trails.py was being
compared against values in the wrong unit, not just off by a constant
offset. Width-based measurements (distance-transform corridor width,
elongation) were never affected — those come from X/Y pixel spacing,
which was always correctly in meters.

Resumable: tiles whose DSM+DTM already exist are skipped, so a dropped
connection or a `Ctrl-C` partway through a county-wide run just needs a
re-run, not a restart. Failed tiles are logged to FAILED_TILES_LOG
(common.py) rather than aborting the whole run.

Run:
  python 01_generate_dsm_dtm.py                                   # whole county
  python 01_generate_dsm_dtm.py --bbox -122.75 38.40 -122.65 38.48 # a quick test area
  python 01_generate_dsm_dtm.py --limit 20                        # first 20 tiles only, for a smoke test

Start with --bbox on a small area you actually ride, or --limit for a
smoke test, before committing to a full-county run — see README.md for
current per-tile timing and what that means at full county scale.
"""
import argparse
import json
import subprocess
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

import geopandas as gpd
from shapely.geometry import box
from tqdm import tqdm

from common import (
    DEFAULT_RESOLUTION_M,
    DSM_DIR,
    DTM_DIR,
    FAILED_TILES_LOG,
    REGION_NE,
    REGION_SW,
    TEMP_DIR,
    TILE_INDEX_PATH,
    WORKING_CRS,
    ensure_dirs,
    log_failed_tile,
    run_pdal_pipeline,
)


def build_cache_pipeline(url: str, cache_path: str) -> list:
    return [
        # No in_srs given — PDAL infers it from the LAZ file's own header,
        # which is what we want (each tile carries its own State Plane
        # CRS; there's nothing to override it with here).
        {"type": "readers.las", "filename": url},
        {"type": "filters.reprojection", "out_srs": WORKING_CRS},
        # filters.reprojection only reprojects X/Y — it does not convert Z
        # even when the source and target CRS have different vertical
        # units. This tile's source CRS (NAD83(HARN) State Plane CA II)
        # reports elevation in US survey feet; WORKING_CRS (UTM 10N) is
        # meters. Left unfixed, every Z value silently stays in feet while
        # X/Y are correctly in meters — confirmed directly: a raw source
        # tile's reported Z range (450.79-1267.58) exactly matched the
        # "reprojected" DSM's elevation range to two decimal places, and
        # real elevations that far above sea level don't exist anywhere in
        # Sonoma County. Every height-based threshold downstream
        # (LOW_VEG_THRESHOLD_M, MIN_HEIGHT_M, etc. in 02/03) assumes
        # meters, so without this fix they're silently being compared
        # against values ~3.28x too large — nothing else in this pipeline
        # depends on absolute elevation, so this is the one place that
        # needs it. filters.transformation with an identity matrix except
        # for the Z scale factor (the exact US survey foot conversion,
        # 1200/3937 m, not the very slightly different international foot)
        # converts it regardless of what filters.reprojection did or
        # didn't do for the vertical axis.
        {
            "type": "filters.transformation",
            "matrix": "1 0 0 0  0 1 0 0  0 0 0.304800609601219 0  0 0 0 1",
        },
        {"type": "writers.las", "filename": cache_path, "compression": "laszip"},
    ]


def get_bounds_string(path: str) -> str:
    """
    Reads a local LAS/LAZ file's own header bounds (near-instant — no point
    processing needed, just the header) and returns them as a PDAL Bounds
    string, `"([minx,maxx],[miny,maxy])"`, so the DSM and DTM grids for the
    same tile can be pinned to the identical extent — see the module
    docstring for why that matters.
    """
    result = subprocess.run(
        ["pdal", "info", "--metadata", path],
        capture_output=True,
        text=True,
        check=True,
    )
    meta = json.loads(result.stdout)["metadata"]
    return f"([{meta['minx']},{meta['maxx']}],[{meta['miny']},{meta['maxy']}])"


def build_dsm_pipeline(cache_path: str, dsm_out: str, resolution: float, bounds: str) -> list:
    return [
        cache_path,
        # Excludes only noise (ASPRS Classification 7) — the DSM wants
        # every real return (ground, vegetation, roofs) to capture the true
        # top-of-canopy/roofline surface.
        {"type": "filters.range", "limits": "Classification![7:7]"},
        {
            "type": "writers.gdal",
            "filename": dsm_out,
            "resolution": resolution,
            "output_type": "max",
            "gdaldriver": "GTiff",
            "gdalopts": "COMPRESS=DEFLATE,TILED=YES",
            "nodata": -9999,
            "bounds": bounds,
        },
    ]


def build_dtm_pipeline(cache_path: str, dtm_out: str, resolution: float, bounds: str) -> list:
    return [
        cache_path,
        {"type": "filters.range", "limits": "Classification[2:2]"},
        {
            "type": "writers.gdal",
            "filename": dtm_out,
            "resolution": resolution,
            "output_type": "min",
            "gdaldriver": "GTiff",
            "gdalopts": "COMPRESS=DEFLATE,TILED=YES",
            "nodata": -9999,
            "bounds": bounds,
        },
    ]


def process_tile(filename: str, url: str, resolution: float) -> tuple[str, str | None]:
    stem = filename.rsplit(".", 1)[0]
    dsm_out = str(DSM_DIR / f"{stem}.tif")
    dtm_out = str(DTM_DIR / f"{stem}.tif")
    cache_path = str(TEMP_DIR / f"{stem}.cache.laz")

    try:
        run_pdal_pipeline(build_cache_pipeline(url, cache_path))
        bounds = get_bounds_string(cache_path)
        run_pdal_pipeline(build_dsm_pipeline(cache_path, dsm_out, resolution, bounds))
        run_pdal_pipeline(build_dtm_pipeline(cache_path, dtm_out, resolution, bounds))
        return filename, None
    except Exception as e:  # noqa: BLE001 -- reported to the caller, not raised, so one bad tile can't kill the pool
        return filename, str(e)
    finally:
        Path(cache_path).unlink(missing_ok=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--bbox", nargs=4, type=float, metavar=("MINLON", "MINLAT", "MAXLON", "MAXLAT"))
    parser.add_argument("--resolution", type=float, default=DEFAULT_RESOLUTION_M)
    parser.add_argument("--workers", type=int, default=4, help="Parallel PDAL processes (default 4 — this is streaming from a shared public server, keep it modest)")
    parser.add_argument("--limit", type=int, default=None, help="Process only the first N intersecting tiles (smoke test)")
    args = parser.parse_args()

    ensure_dirs()

    if not TILE_INDEX_PATH.exists():
        raise SystemExit(f"Run 00_fetch_tile_index.py first — {TILE_INDEX_PATH} is missing.")

    tiles = gpd.read_file(TILE_INDEX_PATH)

    if args.bbox:
        minlon, minlat, maxlon, maxlat = args.bbox
    else:
        minlon, minlat = REGION_SW
        maxlon, maxlat = REGION_NE
    aoi = box(minlon, minlat, maxlon, maxlat)
    tiles = tiles[tiles.intersects(aoi)]

    if args.limit:
        tiles = tiles.iloc[: args.limit]

    already_done = {
        f.stem for f in DSM_DIR.glob("*.tif") if (DTM_DIR / f.name).exists()
    }
    todo = tiles[~tiles["Filename"].str.rsplit(".", n=1).str[0].isin(already_done)]

    print(f"{len(tiles)} tiles intersect the target area, {len(todo)} remaining after skipping already-processed ones")
    if len(todo) == 0:
        return

    failures = 0
    with ProcessPoolExecutor(max_workers=args.workers) as pool:
        futures = {
            pool.submit(process_tile, row["Filename"], row["URL"], args.resolution): row["Filename"]
            for _, row in todo.iterrows()
        }
        for future in tqdm(as_completed(futures), total=len(futures), desc="Tiles"):
            filename, error = future.result()
            if error:
                failures += 1
                log_failed_tile(filename, error)

    if failures:
        print(f"{failures} tile(s) failed — see {FAILED_TILES_LOG}. Re-run this script to retry them.")


if __name__ == "__main__":
    main()
