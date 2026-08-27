"""
Detects LiDAR-only trail/track segments from the nDSM clearance signal
(spec §5, §9, §15) — cleared, roughly flat linear paths with no OSM match,
carrying a measured width so the app's existing width bands
(src/overlays/roadClassification.ts) can classify them as a hiking trail
(<1m) or ATV trail (1-3m) without needing an OSM tag at all.

Algorithm, per DSM/DTM tile pair:
  1. nDSM = DSM - DTM, same as 02_detect_structures.py.
  2. "Clearance" mask: nDSM close to ground level (below LOW_VEG_THRESHOLD_M)
     — bare ground, dirt, gravel; not canopy. This also matches open fields,
     driveways, courtyards, and parking lots.
  3. Skeletonize the clearance mask (medial axis) and use the distance
     transform to get each skeleton pixel's local corridor width.
  4. Drop any skeleton pixel wider than MAX_TRAIL_WIDTH_M. A trail's medial
     axis stays close to both its edges everywhere along its length, so its
     width stays near-constant and small. A field's medial axis runs through
     the middle of open space, tens of meters from any edge — deleting wide
     pixels strips a field's *interior* down to nothing.
  5. THE SECOND KEY FILTER, and the one the width check alone misses:
     require the *local* clearance shape around each surviving skeleton
     pixel to be elongated — major/minor axis ratio at least
     MIN_CLEARANCE_ELONGATION, measured over just the clearance pixels
     within a small window centered on that pixel, restricted to the same
     connected clearance region. Width-filtering alone still lets through
     the *edge* of a compact blob — a driveway apron, a courtyard, a
     loading dock — wherever that edge happens to taper down through
     MAX_TRAIL_WIDTH_M for ≥MIN_TRAIL_LENGTH_M, since a real trail's whole
     length is narrow but a blob's edge is only narrow locally. Confirmed
     against a real batch of false positives (all in a dense urban test
     area, all within ~20m of buildings): each one's local width sat within
     a couple of discrete distance-transform steps of the cap for nearly
     its whole length, and the parent clearance blob's *overall* aspect
     ratio ranged from 1.05 (a nearly circular courtyard-like shape) to
     7.59 (a plausibly real elongated feature) — the width filter alone
     couldn't tell those apart, but shape could. This is done *locally*,
     per pixel, rather than once per whole connected component, so a real
     trail that opens into a wider clearing at one end only loses the
     clearing-adjacent stretch, not its entire length — see below for why
     an earlier, whole-component version of this same filter didn't have
     that property.

     The window radius itself scales with each pixel's own local width
     (elongation_window_radius_px) rather than using one fixed size for
     every pixel — see ELONGATION_RADIUS_TO_WIDTH_RATIO's comment for how
     that's calibrated, and "Why an adaptive radius" below for why a fixed
     one was worse. MIN_CLEARANCE_ELONGATION itself isn't fitted to the
     false-positive data above — it's the geometric floor implied by the
     two thresholds already in place: a bare-minimum valid trail
     (MIN_TRAIL_LENGTH_M long, just under MAX_TRAIL_WIDTH_M wide) has an
     aspect ratio of about 15/4 ≈ 3.75, so a real trail should clear it by
     construction, while a compact or moderately-round paved area
     shouldn't.
  6. Decompose the width- and elongation-filtered skeleton into individual
     branches with skan (a proper skeleton-to-graph library — hand-rolling
     this correctly, with junctions and endpoints, is easy to get subtly
     wrong). Because the elongation filter already ran per-pixel in step 5
     rather than per-branch, a trail that transitions from ribbon-shaped
     into blob-shaped partway along its length has already been split at
     that transition by the time skan sees it — skan just finds whatever
     ribbon-shaped fragments are left, the same as it would for any other
     gap in the skeleton. Keep fragments long enough and narrow enough to
     plausibly be a real trail — including rejecting any fragment whose
     *median* width is pinned at the width cap (CAP_PINNED_WIDTH_M), the
     confirmed signature of a wider cleared area's edge rather than a
     trail; see that constant's comment for the real-data evidence.
  7. Drop any branch that mostly overlaps an existing OSM road/track
     (../pipeline/fetchRoads.ts output) — already known, don't duplicate.
  8. Append survivors to roads.geojson as {source: "lidar", widthMeters}.

IMPORTANT — same caveat as 02_detect_structures.py, more so: this is a
heuristic over open ground, not a trail classifier. Expect false positives
on drainage ditches, fence lines, vineyard access rows, and elongated
paved areas narrow enough to pass both filters, and false negatives under
thick canopy where LiDAR can't resolve ground clearance well. Load the
output in QGIS over aerial imagery before trusting it, and expect to tune
the constants below for what you're actually seeing in Sonoma County
terrain — in particular, test against a real rural/wildland area with
actual trails, not just an urban area where every candidate is
necessarily a false positive by construction (there's nothing real to
find there).

Why local rather than whole-component: an earlier version of this filter
measured elongation once per whole connected clearance region a branch
belonged to. That's simpler, but it meant a genuinely narrow trail that
opens directly (no gap) into a wider clearing — a trailhead lot, a yard —
shared one connected component with that clearing, and the clearing's
bulk could pull the *combined* shape's aspect ratio down below
MIN_CLEARANCE_ELONGATION even though the trail itself was perfectly
trail-shaped, rejecting the whole thing. Measuring elongation in a small
window around each pixel instead means only the clearing-adjacent stretch
of such a trail fails the check — the rest, still locally ribbon-shaped,
survives as its own (possibly shorter) segment as long as what's left
still clears MIN_TRAIL_LENGTH_M.

Why an adaptive radius, not a fixed one: a fixed window radius has to be
sized for the worst case — a straight trail at the full MAX_TRAIL_WIDTH_M
— since a window too small relative to a candidate's own width measures
even a genuinely straight corridor as "not elongated enough" (confirmed
directly: a 6m fixed radius measured a synthetic straight 4m ribbon at
elongation 3.35, under the 4.0 threshold, purely from viewing it through
too small a window — nothing to do with any actual blob). But that
worst-case size is much larger than most real trails need: spec's own
width bands put hiking trails under 1m and ATV under 3m, with
MAX_TRAIL_WIDTH_M's 4m only meant to allow occasional double-track slop,
not describe the typical case. A fixed radius sized for 4m-wide trails
trims that same, unnecessarily large fringe near *every* transition, even
for a trail that's actually 1m wide. Scaling the radius to each pixel's
own local width instead means only candidates actually near the width cap
pay the larger fringe cost — a typical narrower trail's fringe shrinks
proportionally, directly reducing how much real trail length is lost near
a genuine clearing transition for the common case. This doesn't eliminate
the trade-off (a wide, cap-adjacent trail still costs a real fringe, and
still could lose a short segment entirely near a clearing), but it
substantially narrows how often that trade-off actually bites.

The three constants this depends on were calibrated against a fine sweep
(every 0.05m from 0.3m to MAX_TRAIL_WIDTH_M, not a handful of spot
checks — spot checks alone missed real dips in how well pixel-discretized
windows measure elongation at specific width/radius combinations) rather
than picked once and trusted: see ELONGATION_RADIUS_TO_WIDTH_RATIO's
comment for the margin that sweep confirmed. Re-run it (or something like
it) if you change MAX_TRAIL_WIDTH_M, MIN_CLEARANCE_ELONGATION, or the
resolution passed to 01_generate_dsm_dtm.py.

What was tried and didn't help, so the next person doesn't re-try it
blind — a real trail merging directly into a real, substantially-sized
clearing (a true trailhead lot) still costs a real, bounded fringe (tested
synthetically: roughly 15m near a 14m-diameter merged clearing, regardless
of how long the trail itself is) and can still be lost entirely if what's
left after trimming doesn't clear MIN_TRAIL_LENGTH_M. Things that did not
reduce this further, each checked against real data, not assumed:
  - Smoothing local width with a minimum filter before sizing the window
    (to resist the width reading itself rising as a pixel approaches a
    real opening): only marginal (15m -> 16m survived in the synthetic
    test) — the widening near a genuine transition is gradual over a real
    distance, not noise a modest filter footprint can outrun.
  - One shared radius per branch (from a robust/low-percentile width
    across the whole branch, instead of each pixel's own): no improvement
    over per-pixel — the transition zone still gets the same window size
    as the true corridor, since both derive from the same one estimate.
  - Skeleton topology (skan branch_type / junction degree, on the theory
    that a blob's medial axis usually branches while a corridor's
    doesn't): checked directly against the real elongated (kept) and
    compact (rejected) candidates from actual county data, before *and*
    after width-filtering — both were simple single branches with no
    junctions either way. Not a useful signal for the compact shapes this
    dataset actually produces.
  - Excluding real building footprints (structures.geojson) from the
    clearance mask before skeletonizing: doesn't touch this problem at
    all — checked directly, and neither the elongated nor the compact
    real candidate's own clearance blob overlaps a mapped building. The
    false-positive pavement here is *near* buildings, not building roofs
    misread as ground clearance.
  - Modulating MIN_CLEARANCE_ELONGATION by distance to the nearest mapped
    building (relaxed far from development, strict near it, on the theory
    that the confirmed false positives were all within 20m of a building):
    checked directly — the one real candidate that should stay *relaxed*
    (the elongated, kept one) sits at almost the identical distance
    (~20m) as the one that should stay *strict* (the compact, rejected
    one, ~21.5m). Proximity to a mapped building doesn't distinguish them.
  A different kind of signal — not just a different window/statistic over
  the same clearance-shape data — would be needed to close this specific
  gap further; see docs/DATA.md-style honesty: this is a real, bounded,
  mechanistically-understood residual, not a currently-unknown bug.

Run: python 03_detect_trails.py [--bbox MINLON MINLAT MAXLON MAXLAT]
Output: overwrites ROADS_PATH (common.py) — DATA_ROOT\overlays\
roads.geojson (OSM-sourced features untouched, new lidar-sourced ones
appended; seeded from the repo's copy on first run — see README.md).
"""
import argparse
import json

import geopandas as gpd
import numpy as np
import rasterio
from scipy import ndimage
from shapely.geometry import LineString, box, shape
from shapely.ops import unary_union
from skan import Skeleton
from skimage.morphology import skeletonize
from tqdm import tqdm

from common import (
    DSM_DIR,
    DTM_DIR,
    LEGACY_ROADS_PATH,
    OUTPUT_CRS,
    ROADS_PATH,
    WORKING_CRS,
    ensure_dirs,
    read_ndsm,
    verify_blas_works,
)

LOW_VEG_THRESHOLD_M = 0.4
CLEARANCE_NOISE_TOLERANCE_M = 0.3  # allow slightly-negative nDSM noise without excluding real ground
MAX_TRAIL_WIDTH_M = 4.0  # generous upper bound past the 3m ATV band, to allow some double-track slop
# Reject any segment whose *median* width is pinned at the cap. Evidence
# from both real test areas (downtown Santa Rosa and the Sonoma Mountain
# foothills / Rohnert Park flats): every confirmed false positive — 4 of 5
# downtown, and all 95 added in the foothills run — reported median width
# exactly 4.0m, the cap itself. That's the signature of the *edge of a
# wider cleared area* (parking, farmyard, field margin): the only skeleton
# pixels that survive the width filter there are the ones grazing the cap,
# so the surviving fragment's median sits at the cap by construction. A
# genuine trail can't produce it — a real sub-3m trail's median lands in
# its own band well below the cap, and even a true 4m double-track at the
# cap is indistinguishable from this failure mode at this resolution, so
# it's excluded as the price of killing the dominant false-positive class
# (the purple/pink <3m bands this script exists to find are unaffected).
CAP_PINNED_WIDTH_M = 3.9
MIN_TRAIL_LENGTH_M = 15.0
MIN_CLEARANCE_ELONGATION = 4.0  # local major/minor axis ratio required — see module docstring
# The local elongation window scales with each pixel's own local width
# (2*dist_m at that pixel) rather than using one fixed radius sized for
# the worst case (MAX_TRAIL_WIDTH_M) everywhere. Most real trails are far
# narrower than the cap — spec's own bands put hiking under 1m and ATV
# under 3m, with the cap only meant to allow occasional double-track slop
# — so scaling the window down for narrower candidates directly shrinks
# the trim fringe near a real trail/clearing transition for the common
# case, without weakening rejection of an actually-wide blob (which still
# gets the larger window its own width demands).
#
# ELONGATION_RADIUS_TO_WIDTH_RATIO / _BUFFER_PX / _FLOOR_M are calibrated
# empirically against synthetic straight ribbons at every width from 0.3m
# to MAX_TRAIL_WIDTH_M in 0.05m steps (a fine sweep, not a few spot
# checks — the relationship is not smooth/monotonic at the pixel level,
# so spot checks alone missed real dips): this combination keeps the
# measured elongation at least 22% above MIN_CLEARANCE_ELONGATION for a
# perfectly straight ribbon at *every* width in that range, the worst
# real case (a narrower or straighter trail only measures more elongated,
# never less). Re-run that sweep if either constant changes.
ELONGATION_RADIUS_TO_WIDTH_RATIO = 3.0
ELONGATION_RADIUS_BUFFER_PX = 3
ELONGATION_RADIUS_FLOOR_M = 4.0
EXISTING_ROAD_BUFFER_M = 5.0  # LiDAR-vs-OSM alignment tolerance
OVERLAP_SKIP_FRACTION = 0.5  # skip a candidate if at least half its length already coincides with a known road


def local_elongation(component_mask, row: int, col: int, window_radius_px: int) -> float:
    """
    Major/minor axis ratio of the connected clearance region within a
    square window centered at (row, col) — the same second-moment
    computation skimage's regionprops uses for a whole region
    (major/minor axis length ∝ sqrt of the covariance eigenvalues), just
    over a small local crop instead of the whole component, and computed
    directly here rather than via regionprops since there's no separate
    region to label per window — see module docstring for why local
    rather than whole-component.
    """
    r0, r1 = max(0, row - window_radius_px), row + window_radius_px + 1
    c0, c1 = max(0, col - window_radius_px), col + window_radius_px + 1
    local = component_mask[r0:r1, c0:c1]
    ys, xs = np.nonzero(local)
    if len(ys) < 6:  # not enough pixels in the window for a meaningful shape estimate
        return 0.0

    coords = np.stack([ys, xs], axis=1).astype(float)
    coords -= coords.mean(axis=0)
    eigenvalues = np.linalg.eigvalsh(np.cov(coords, rowvar=False))  # ascending: [minor, major] variance
    minor_var, major_var = eigenvalues[0], eigenvalues[1]
    if minor_var <= 1e-9:
        return float("inf")
    return (major_var / minor_var) ** 0.5


def elongation_window_radius_px(local_width_m: float, resolution: float) -> int:
    """
    Window radius for one pixel, scaled to that pixel's own local width
    (2*dist_m there) rather than a single fixed size — see
    ELONGATION_RADIUS_TO_WIDTH_RATIO's comment for the calibration this
    is based on.
    """
    radius_m = max(ELONGATION_RADIUS_FLOOR_M, ELONGATION_RADIUS_TO_WIDTH_RATIO * local_width_m)
    return max(2, round(radius_m / resolution) + ELONGATION_RADIUS_BUFFER_PX)


def compute_elongation_ok(candidate_mask, clearance_labels, dist_m, resolution: float):
    """
    For each True pixel in candidate_mask (already width-filtered skeleton
    pixels — the only ones worth checking), tests local_elongation against
    MIN_CLEARANCE_ELONGATION using a window sized to that pixel's own
    local width, restricted to that pixel's own connected clearance region
    so a nearby-but-disconnected separate blob can't leak into the window.
    Grouped by label to avoid recomputing the same full-tile boolean mask
    per pixel.
    """
    elongation_ok = np.zeros_like(candidate_mask, dtype=bool)

    rows, cols = np.nonzero(candidate_mask)
    labels_at_candidates = clearance_labels[rows, cols]
    for label in np.unique(labels_at_candidates):
        if label == 0:
            continue
        component_mask = clearance_labels == label
        for row, col in zip(rows[labels_at_candidates == label], cols[labels_at_candidates == label]):
            local_width_m = 2 * dist_m[row, col]
            window_radius_px = elongation_window_radius_px(local_width_m, resolution)
            if local_elongation(component_mask, row, col, window_radius_px) >= MIN_CLEARANCE_ELONGATION:
                elongation_ok[row, col] = True

    return elongation_ok


def detect_in_tile(dsm_path, dtm_path, resolution: float):
    ndsm, valid, transform = read_ndsm(dsm_path, dtm_path)
    if ndsm is None:  # DSM/DTM don't overlap at all — see read_ndsm's docstring
        return []

    clearance = valid & (ndsm < LOW_VEG_THRESHOLD_M) & (ndsm > -CLEARANCE_NOISE_TOLERANCE_M)
    clearance = ndimage.binary_opening(clearance, structure=np.ones((3, 3)))
    if not clearance.any():
        return []

    # Labeled before any filtering so the elongation check below can
    # restrict each pixel's local window to its own connected clearance
    # region — see MIN_CLEARANCE_ELONGATION in the module docstring.
    clearance_labels, _ = ndimage.label(clearance)

    dist_m = ndimage.distance_transform_edt(clearance) * resolution
    skeleton = skeletonize(clearance)

    # The width filter: strip out skeleton pixels wider than a trail could
    # be (see module docstring).
    width_ok = skeleton & (dist_m * 2 <= MAX_TRAIL_WIDTH_M)
    if not width_ok.any():
        return []

    # The elongation filter: strip out skeleton pixels whose *local*
    # surroundings look blob-like rather than corridor-like — applied
    # per-pixel, before skan ever sees the skeleton, so a trail that only
    # turns blob-shaped partway along its length gets split there rather
    # than rejected as a whole (see module docstring).
    elongation_ok = compute_elongation_ok(width_ok, clearance_labels, dist_m, resolution)
    final_mask = width_ok & elongation_ok
    if not final_mask.any():
        return []

    skel_obj = Skeleton(final_mask, spacing=resolution)
    lengths = skel_obj.path_lengths()

    segments = []
    for i in range(skel_obj.n_paths):
        length_m = lengths[i]
        if length_m < MIN_TRAIL_LENGTH_M:
            continue

        coords = skel_obj.path_coordinates(i)  # (row, col) pixel coordinates, in order
        widths = [2 * dist_m[int(round(r)), int(round(c))] for r, c in coords]
        median_width_m = float(np.median(widths))
        if median_width_m <= 0 or median_width_m >= CAP_PINNED_WIDTH_M:
            # >= CAP_PINNED_WIDTH_M: the cap-pinned-median false-positive
            # signature — see that constant's comment for the evidence.
            continue

        world_coords = [transform * (c, r) for r, c in coords]
        if len(world_coords) < 2:
            continue
        segments.append((LineString(world_coords), median_width_m))

    return segments


def load_existing_roads() -> dict:
    """
    Same one-time fallback as 02_detect_structures.py's
    load_existing_structures() — see its docstring.
    """
    if ROADS_PATH.exists():
        with open(ROADS_PATH, encoding="utf-8") as f:
            return json.load(f)
    if LEGACY_ROADS_PATH.exists():
        print(f"Seeding from {LEGACY_ROADS_PATH} — future runs will use {ROADS_PATH} instead.")
        with open(LEGACY_ROADS_PATH, encoding="utf-8") as f:
            return json.load(f)
    return {"type": "FeatureCollection", "features": []}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--bbox", nargs=4, type=float, metavar=("MINLON", "MINLAT", "MAXLON", "MAXLAT"))
    parser.add_argument("--resolution", type=float, default=1.0, help="Must match the resolution used in 01_generate_dsm_dtm.py")
    args = parser.parse_args()

    ensure_dirs()
    # This script's elongation filter makes the pipeline's first actual BLAS
    # call (np.cov) — the one operation that dies natively, with no error
    # message at all, if the environment's DLLs aren't resolvable. Probe for
    # that up front so a broken setup fails loudly here, not silently at
    # some arbitrary tile. See verify_blas_works's docstring.
    verify_blas_works()

    dsm_tiles = sorted(DSM_DIR.glob("*.tif"))
    pairs = [(p, DTM_DIR / p.name) for p in dsm_tiles if (DTM_DIR / p.name).exists()]
    if not pairs:
        raise SystemExit("No DSM/DTM tile pairs found — run 01_generate_dsm_dtm.py first.")

    if args.bbox:
        aoi_wgs84 = box(*args.bbox)
        aoi = gpd.GeoSeries([aoi_wgs84], crs=OUTPUT_CRS).to_crs(WORKING_CRS).iloc[0]

    all_segments = []
    skipped = 0
    for dsm_path, dtm_path in tqdm(pairs, desc="Tiles"):
        if args.bbox:
            with rasterio.open(dsm_path) as ds:
                tile_bounds = box(*ds.bounds)
            if not tile_bounds.intersects(aoi):
                continue
        try:
            all_segments.extend(detect_in_tile(dsm_path, dtm_path, args.resolution))
        except Exception as e:  # noqa: BLE001 -- one bad tile shouldn't lose every other tile's real detections
            skipped += 1
            print(f"Skipping {dsm_path.name}: {e}")

    if skipped:
        print(f"{skipped} tile(s) skipped due to errors — see messages above.")
    print(f"{len(all_segments)} candidate trail segment(s) detected before cross-referencing")
    if not all_segments:
        return

    candidates_gdf = gpd.GeoDataFrame(
        {"width_m": [w for _, w in all_segments]},
        geometry=[line for line, _ in all_segments],
        crs=WORKING_CRS,
    )

    existing = load_existing_roads()
    # Only cross-reference against OSM roads actually near this run's
    # candidates — roads.geojson is county-wide (119,000+ features once
    # seeded from the real pipeline output), and buffering + unary_union-ing
    # all of it regardless of how small --bbox is turns a test run against
    # a handful of tiles into a multi-minute, multi-GB operation. A cheap
    # bounding-box-ish intersects() check per feature (no reprojection, no
    # buffering) before doing anything expensive fixes that.
    relevant_area = (
        gpd.GeoSeries([box(*candidates_gdf.total_bounds)], crs=WORKING_CRS)
        .to_crs(OUTPUT_CRS)
        .iloc[0]
        .buffer(EXISTING_ROAD_BUFFER_M / 111000)  # buffer in WGS84 degrees, generous for a meters-scale tolerance
    )
    existing_lines = []
    for f in existing["features"]:
        if f["geometry"] is None:
            continue
        geom = shape(f["geometry"])
        if geom.intersects(relevant_area):
            existing_lines.append(geom)

    if existing_lines:
        existing_gdf = gpd.GeoDataFrame(geometry=existing_lines, crs=OUTPUT_CRS).to_crs(WORKING_CRS)
        existing_buffer = unary_union(existing_gdf.geometry.buffer(EXISTING_ROAD_BUFFER_M))

        def is_mostly_new(line: LineString) -> bool:
            overlap = line.intersection(existing_buffer)
            overlap_length = overlap.length if not overlap.is_empty else 0.0
            return (overlap_length / line.length) < OVERLAP_SKIP_FRACTION

        keep_mask = candidates_gdf.geometry.apply(is_mostly_new)
        new_segments = candidates_gdf[keep_mask]
    else:
        new_segments = candidates_gdf

    print(f"{len(new_segments)} of those don't already coincide with a known OSM road — adding as lidar-sourced")

    new_segments_wgs84 = new_segments.to_crs(OUTPUT_CRS)
    for geom, width_m in zip(new_segments_wgs84.geometry, new_segments_wgs84["width_m"]):
        existing["features"].append(
            {
                "type": "Feature",
                "geometry": json.loads(gpd.GeoSeries([geom]).to_json())["features"][0]["geometry"],
                "properties": {"source": "lidar", "widthMeters": round(float(width_m), 2)},
            }
        )

    with open(ROADS_PATH, "w", encoding="utf-8") as f:
        json.dump(existing, f)

    print(f"Wrote {ROADS_PATH}: {len(existing['features'])} total features")


if __name__ == "__main__":
    main()
