"""
Detects undocumented structures from the LiDAR nDSM signal (spec §4, §9):
buildings tall enough and solid/rectangular enough to plausibly be a real
structure, that don't overlap anything already in structures.geojson from
the OSM pipeline (../pipeline/fetchStructures.ts) — those are already
`documented: true` and this script leaves them alone.

Algorithm, per DSM/DTM tile pair from 01_generate_dsm_dtm.py:
  1. nDSM = DSM - DTM (height above ground).
  2. Threshold to MIN_HEIGHT_M..MAX_HEIGHT_M — tall enough to be a roofline,
     not so tall it's obviously a data spike.
  3. Binary opening to drop single-pixel noise.
  4. Connected-component label the surviving mask.
  5. Per component: keep it only if its area and solidity (area / convex
     hull area) both look building-like rather than vegetation-like — real
     buildings are compact and roughly rectangular; tree canopy tends to be
     either too small (isolated trees) or too irregular (canopy clusters).
  6. Vectorize survivors, drop any that overlap an existing OSM-documented
     footprint, append the rest to structures.geojson as `documented: false`.

IMPORTANT — this is a heuristic, not ground truth. Sonoma County has heavy
tree cover in places; dense, flat-topped brush or a tightly packed grove can
still pass the solidity filter and register as a false positive, and a
structure under thick canopy (LiDAR can't see through solid canopy to the
roof) can be missed entirely. Treat this script's output as a candidate
list, not a verified structures overlay: load it in QGIS over aerial
imagery and spot-check before trusting it, and tune the constants below for
what you're actually seeing before a full county-wide run. The spec's own
structure-detection step (§1, §9) has always assumed this kind of
elevation-signal heuristic with a public-record cross-reference, not a
100%-accurate detector.

Run: python 02_detect_structures.py [--bbox MINLON MINLAT MAXLON MAXLAT]
Output: overwrites STRUCTURES_PATH (common.py) — DATA_ROOT\overlays\
structures.geojson (OSM-documented features untouched, new undocumented
ones appended; seeded from the repo's copy on first run — see README.md).
"""
import argparse
import json

import geopandas as gpd
import numpy as np
import rasterio
from rasterio.features import shapes
from scipy import ndimage
from shapely.geometry import box, shape
from skimage.measure import regionprops
from tqdm import tqdm

from common import (
    DSM_DIR,
    DTM_DIR,
    LEGACY_STRUCTURES_PATH,
    OUTPUT_CRS,
    STRUCTURES_PATH,
    WORKING_CRS,
    ensure_dirs,
    read_ndsm,
)

MIN_HEIGHT_M = 2.5
MAX_HEIGHT_M = 100.0
MIN_AREA_M2 = 12.0
MAX_AREA_M2 = 6000.0
MIN_SOLIDITY = 0.55
SIMPLIFY_TOLERANCE_M = 0.5


def detect_in_tile(dsm_path, dtm_path, resolution: float):
    ndsm, valid, transform = read_ndsm(dsm_path, dtm_path)
    if ndsm is None:  # DSM/DTM don't overlap at all — see read_ndsm's docstring
        return []

    candidate = valid & (ndsm > MIN_HEIGHT_M) & (ndsm < MAX_HEIGHT_M)
    candidate = ndimage.binary_opening(candidate, structure=np.ones((3, 3)))

    labeled, count = ndimage.label(candidate)
    if count == 0:
        return []

    pixel_area = resolution * resolution
    keep_labels = set()
    for region in regionprops(labeled):
        area_m2 = region.area * pixel_area
        if area_m2 < MIN_AREA_M2 or area_m2 > MAX_AREA_M2:
            continue
        if region.solidity < MIN_SOLIDITY:
            continue
        keep_labels.add(region.label)

    if not keep_labels:
        return []

    keep_mask = np.isin(labeled, list(keep_labels))
    polygons = []
    for geom, value in shapes(keep_mask.astype(np.uint8), mask=keep_mask, transform=transform):
        if value != 1:
            continue
        poly = shape(geom).simplify(SIMPLIFY_TOLERANCE_M, preserve_topology=True)
        if poly.is_valid and not poly.is_empty:
            polygons.append(poly)
    return polygons


def load_existing_structures() -> dict:
    """
    STRUCTURES_PATH lives under DATA_ROOT (your external drive) — but the
    first time this runs, that file doesn't exist yet and the real data is
    still sitting where ../pipeline/fetchStructures.ts wrote it, under the
    repo. Falls back to that exactly once; every write after this goes to
    STRUCTURES_PATH, so subsequent runs never touch the repo copy again.
    """
    if STRUCTURES_PATH.exists():
        with open(STRUCTURES_PATH, encoding="utf-8") as f:
            return json.load(f)
    if LEGACY_STRUCTURES_PATH.exists():
        print(f"Seeding from {LEGACY_STRUCTURES_PATH} — future runs will use {STRUCTURES_PATH} instead.")
        with open(LEGACY_STRUCTURES_PATH, encoding="utf-8") as f:
            return json.load(f)
    return {"type": "FeatureCollection", "features": []}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--bbox", nargs=4, type=float, metavar=("MINLON", "MINLAT", "MAXLON", "MAXLAT"))
    parser.add_argument("--resolution", type=float, default=1.0, help="Must match the resolution used in 01_generate_dsm_dtm.py")
    args = parser.parse_args()

    ensure_dirs()

    dsm_tiles = sorted(DSM_DIR.glob("*.tif"))
    pairs = [(p, DTM_DIR / p.name) for p in dsm_tiles if (DTM_DIR / p.name).exists()]
    if not pairs:
        raise SystemExit("No DSM/DTM tile pairs found — run 01_generate_dsm_dtm.py first.")

    if args.bbox:
        aoi_wgs84 = box(*args.bbox)
        aoi = gpd.GeoSeries([aoi_wgs84], crs=OUTPUT_CRS).to_crs(WORKING_CRS).iloc[0]

    all_polygons = []
    skipped = 0
    for dsm_path, dtm_path in tqdm(pairs, desc="Tiles"):
        if args.bbox:
            with rasterio.open(dsm_path) as ds:
                tile_bounds = box(*ds.bounds)
            if not tile_bounds.intersects(aoi):
                continue
        try:
            all_polygons.extend(detect_in_tile(dsm_path, dtm_path, args.resolution))
        except Exception as e:  # noqa: BLE001 -- one bad tile shouldn't lose every other tile's real detections
            skipped += 1
            print(f"Skipping {dsm_path.name}: {e}")

    if skipped:
        print(f"{skipped} tile(s) skipped due to errors — see messages above.")
    print(f"{len(all_polygons)} candidate structure(s) detected before cross-referencing")

    if not all_polygons:
        return

    candidates = gpd.GeoDataFrame(geometry=all_polygons, crs=WORKING_CRS).to_crs(OUTPUT_CRS)

    existing = load_existing_structures()
    documented_geoms = [
        shape(f["geometry"]) for f in existing["features"] if f["geometry"] is not None
    ]

    if documented_geoms:
        documented_gdf = gpd.GeoDataFrame(geometry=documented_geoms, crs=OUTPUT_CRS)
        joined = gpd.sjoin(candidates, documented_gdf, how="left", predicate="intersects")
        # A left spatial join produces one output row per *match*, not per
        # input row — a candidate overlapping several documented footprints
        # (common in a dense area with adjacent/overlapping buildings)
        # appears more than once in `joined`, so its index has duplicates
        # and is longer than `candidates`. Indexing `candidates` directly
        # with a same-shaped-looking boolean Series from `joined` breaks on
        # exactly that case (a plain length/position mismatch, not just a
        # rare edge case — it happened on every real run against downtown
        # Santa Rosa). `.isin()` against the de-duplicated set of matched
        # indices is correct regardless of how many times each one matched.
        matched_indices = joined.loc[joined["index_right"].notna()].index.unique()
        new_undocumented = candidates[~candidates.index.isin(matched_indices)]
    else:
        new_undocumented = candidates

    print(f"{len(new_undocumented)} of those don't overlap an existing documented footprint — adding as undocumented")

    for geom in new_undocumented.geometry:
        existing["features"].append(
            {
                "type": "Feature",
                "geometry": json.loads(gpd.GeoSeries([geom]).to_json())["features"][0]["geometry"],
                "properties": {"documented": False},
            }
        )

    with open(STRUCTURES_PATH, "w", encoding="utf-8") as f:
        json.dump(existing, f)

    print(f"Wrote {STRUCTURES_PATH}: {len(existing['features'])} total features")


if __name__ == "__main__":
    main()
