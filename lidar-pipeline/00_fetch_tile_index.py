"""
Downloads OpenTopography's tile index for the Sonoma County LiDAR survey
and saves it as a local GeoJSON (WGS84) for the other scripts to filter
against by bounding box.

The tile index is a zipped shapefile — one row per LAZ tile, with columns
Filename/MinX/MinY/MaxX/MaxY/URL (URL points at the actual point-cloud file
on OpenTopography's S3-compatible storage). This is OpenTopography's own
documented mechanism for programmatic access, not a scrape — see
https://github.com/OpenTopography/OT_Tile_Index_Search and README.md here
for how OT_DATASET_ALTERNATE_NAME / OT_TILE_INDEX_URL were confirmed.

Run: python 00_fetch_tile_index.py
Output: TILE_INDEX_PATH (common.py) — DATA_ROOT\lidar\tile_index.geojson,
i.e. D:\FreeRoam-lidar-data\lidar\tile_index.geojson by default.
"""
import zipfile
from io import BytesIO

import geopandas as gpd
import requests

from common import LIDAR_DIR, OT_TILE_INDEX_URL, TILE_INDEX_PATH, ensure_dirs


def main() -> None:
    ensure_dirs()

    print(f"Downloading tile index from {OT_TILE_INDEX_URL}")
    response = requests.get(OT_TILE_INDEX_URL, timeout=60)
    response.raise_for_status()

    extract_dir = LIDAR_DIR / "tile_index_shapefile"
    extract_dir.mkdir(exist_ok=True)
    with zipfile.ZipFile(BytesIO(response.content)) as zf:
        zf.extractall(extract_dir)

    shapefiles = list(extract_dir.glob("*.shp"))
    if not shapefiles:
        raise RuntimeError(f"No .shp file found in downloaded tile index at {extract_dir}")

    gdf = gpd.read_file(shapefiles[0])
    gdf = gdf.to_crs("EPSG:4326")

    gdf.to_file(TILE_INDEX_PATH, driver="GeoJSON")
    print(f"Wrote {TILE_INDEX_PATH}: {len(gdf)} tiles")


if __name__ == "__main__":
    main()
