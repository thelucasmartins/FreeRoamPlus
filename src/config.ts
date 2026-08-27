/**
 * Region + offline data configuration.
 *
 * Scoped to Sonoma County per the project spec. Widen REGION_BOUNDS and
 * regenerate the MBTiles extract if coverage ever expands.
 */

/** [longitude, latitude] — Santa Rosa, roughly the county center. */
export const SONOMA_CENTER: [number, number] = [-122.71, 38.44];

export const DEFAULT_ZOOM = 10;
export const MIN_ZOOM = 7;
export const MAX_ZOOM = 16;

/** Zoom level the camera snaps to when the user engages GPS follow mode. */
export const FOLLOW_ZOOM = 15;

/** Approximate Sonoma County bounding box (WGS84). */
export const REGION_BOUNDS = {
  sw: [-123.65, 38.05] as [number, number],
  ne: [-122.3, 38.9] as [number, number],
};

/** Directory (under the app's document dir) where offline data lives. */
export const TILES_DIR_NAME = 'tiles';

/** Filename of the street-basemap vector tile database. */
export const MBTILES_FILENAME = 'sonoma.mbtiles';

/**
 * One-time download source for the tile database (spec §8: "bundled with the
 * app or downloaded once over Wi-Fi"). During development, run a static file
 * server on your desktop from the folder containing sonoma.mbtiles, e.g.:
 *
 *   npx serve --cors -l 8080 data
 *
 * then set this to http://<your-desktop-LAN-IP>:8080/sonoma.mbtiles.
 */
export const TILE_DOWNLOAD_URL = 'http://10.0.0.150:8080/sonoma.mbtiles';

/**
 * Online style used only as a development fallback when no offline tiles are
 * on the device yet. Never used once the MBTiles file is present.
 */
export const DEV_FALLBACK_STYLE_URL = 'https://demotiles.maplibre.org/style.json';

/**
 * Filename of the satellite base layer (spec §3.2): raw aerial/satellite
 * imagery, no overlays. A raster MBTiles file, same delivery mechanism as
 * the street database — see docs/DATA.md.
 */
export const SATELLITE_MBTILES_FILENAME = 'satellite.mbtiles';

/** One-time download source for the satellite tile database — see TILE_DOWNLOAD_URL for the dev-serving pattern. */
export const SATELLITE_TILE_DOWNLOAD_URL = 'http://10.0.0.150:8080/satellite.mbtiles';

/**
 * Filename of the LiDAR hillshade base layer (spec §3.3): a raster-dem
 * (Terrain-RGB-encoded) MBTiles file derived from the same LiDAR/DEM data
 * as the nDSM and elevation-grid layers. MapLibre decodes and shades this
 * on-device via a `hillshade` layer — no separate pre-rendered hillshade
 * image needed.
 */
export const LIDAR_MBTILES_FILENAME = 'lidar-hillshade.mbtiles';

/** One-time download source for the LiDAR hillshade tile database. */
export const LIDAR_TILE_DOWNLOAD_URL = 'http://10.0.0.150:8080/lidar-hillshade.mbtiles';

/** Directory (under the app's document dir) where overlay GeoJSON lives. */
export const OVERLAYS_DIR_NAME = 'overlays';

/**
 * Filename of the structures overlay (spec §4, §9): building footprints
 * classified as documented (known, from OSM/Microsoft footprints) or
 * undocumented (LiDAR-flagged, no public record), exported by the desktop
 * nDSM pipeline.
 */
export const STRUCTURES_FILENAME = 'structures.geojson';

/**
 * Filename of the roads/trails overlay (spec §5, §9, §15): OSM-classified
 * roads plus LiDAR-detected paths, exported by the desktop pipeline. The app
 * applies the green/yellow/red and width-band classification rules itself —
 * see src/overlays/roadClassification.ts — so this file carries the raw
 * cross-reference fields, not a precomputed color.
 */
export const ROADS_FILENAME = 'roads.geojson';

/**
 * Filename of the parcels overlay (spec §4, §9): Sonoma County GIS "Parcels
 * Public" boundaries, cross-referenced against Zoning and Land Use data for
 * the resource-extraction flag. Owner name is excluded at the source (spec
 * §4) and isn't part of this app's schema at all.
 */
export const PARCELS_FILENAME = 'parcels.geojson';

/**
 * Filename of the offline search index (spec §16): place names, road names,
 * and POI names for Sonoma County, built from OSM data at pipeline time.
 * Only ever contains publicly known/named things — private/unclassified
 * roads and undocumented structures never get a `name` in the first place
 * (spec §6), so there's nothing extra to filter out here.
 */
export const SEARCH_INDEX_FILENAME = 'search-index.json';

/**
 * Filename of the elevation grid (spec §13): a coarse regular DEM grid
 * sourced from the same LiDAR/DEM data as the nDSM layer, for computing
 * grade/steepness along a route. See src/elevation/types.ts for the schema.
 */
export const DEM_FILENAME = 'dem.json';

/** Directory (under the app's document dir) for user-generated data — not pipeline output, so kept separate from overlays/. */
export const USER_DATA_DIR_NAME = 'user-data';

/** Filename of the on-device waypoints/pins store (spec §11). */
export const WAYPOINTS_FILENAME = 'waypoints.json';
