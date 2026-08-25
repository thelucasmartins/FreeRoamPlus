import {
  LIDAR_MBTILES_FILENAME,
  LIDAR_TILE_DOWNLOAD_URL,
  SATELLITE_MBTILES_FILENAME,
  SATELLITE_TILE_DOWNLOAD_URL,
} from '../config';
import { deleteTileSet, downloadTileSet, getTileSetStatus, type TileSetStatus } from './tileSets';

/**
 * Satellite (spec §3.2) and LiDAR hillshade (spec §3.3) base layers, each a
 * separate raster MBTiles file — optional enhancements on top of the
 * required street basemap (tileStore.ts), so their absence never blocks
 * using the app, only that one base-layer choice.
 */

export function getSatelliteStatus(): TileSetStatus {
  return getTileSetStatus(SATELLITE_MBTILES_FILENAME);
}

export function downloadSatelliteTiles(url: string = SATELLITE_TILE_DOWNLOAD_URL): Promise<TileSetStatus> {
  return downloadTileSet(SATELLITE_MBTILES_FILENAME, url);
}

export function deleteSatelliteTiles(): void {
  deleteTileSet(SATELLITE_MBTILES_FILENAME);
}

export function getLidarStatus(): TileSetStatus {
  return getTileSetStatus(LIDAR_MBTILES_FILENAME);
}

export function downloadLidarTiles(url: string = LIDAR_TILE_DOWNLOAD_URL): Promise<TileSetStatus> {
  return downloadTileSet(LIDAR_MBTILES_FILENAME, url);
}

export function deleteLidarTiles(): void {
  deleteTileSet(LIDAR_MBTILES_FILENAME);
}
