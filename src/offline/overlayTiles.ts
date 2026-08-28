import {
  PARCELS_MBTILES_DOWNLOAD_URL,
  PARCELS_MBTILES_FILENAME,
  STRUCTURES_MBTILES_DOWNLOAD_URL,
  STRUCTURES_MBTILES_FILENAME,
} from '../config';
import { type DownloadProgressInfo } from './fileDownload';
import { deleteTileSet, downloadTileSet, getTileSetStatus, type TileSetStatus } from './tileSets';

/**
 * On-device delivery of the two overlay vector-tile databases
 * (docs/DATA.md §4, §6).
 *
 * Structures (~102MB) and parcels (~58MB) are too large to parse whole into
 * a GeoJSONSource — that pattern is the suspected cause of the previous
 * project's parcel-layer failure. Pre-tiled by the desktop conversion, they
 * stream by viewport instead.
 *
 * Delivery-only: this module gets the databases onto the device and reports
 * whether they're there. Wiring the resulting mbtiles:// URL into a
 * VectorSource happens in the map style, which is owned elsewhere — the
 * split is deliberate, so the download path can be built and tested
 * independently of the rendering change.
 *
 * These are the same MBTiles shape as the basemap, so they reuse the tile
 * machinery in tileSets.ts wholesale rather than reimplementing it: they
 * land in the same tiles/ directory and get the same hardened transfer.
 */

export type OverlayTileId = 'structures' | 'parcels';

interface OverlayTileDescriptor {
  label: string;
  filename: string;
  url: string;
}

const OVERLAY_TILES: Record<OverlayTileId, OverlayTileDescriptor> = {
  structures: {
    label: 'Structures tiles',
    filename: STRUCTURES_MBTILES_FILENAME,
    url: STRUCTURES_MBTILES_DOWNLOAD_URL,
  },
  parcels: {
    label: 'Parcels tiles',
    filename: PARCELS_MBTILES_FILENAME,
    url: PARCELS_MBTILES_DOWNLOAD_URL,
  },
};

export const OVERLAY_TILE_IDS = Object.keys(OVERLAY_TILES) as OverlayTileId[];

export function overlayTileLabel(id: OverlayTileId): string {
  return OVERLAY_TILES[id].label;
}

/**
 * Whether the database is on-device, and the mbtiles:// URL to point a
 * VectorSource at when it is.
 */
export function getOverlayTileStatus(id: OverlayTileId): TileSetStatus {
  return getTileSetStatus(OVERLAY_TILES[id].filename);
}

export function getAllOverlayTileStatuses(): Record<OverlayTileId, TileSetStatus> {
  return {
    structures: getOverlayTileStatus('structures'),
    parcels: getOverlayTileStatus('parcels'),
  };
}

/** One-time download of an overlay tile database over Wi-Fi, written atomically. */
export function downloadOverlayTiles(
  id: OverlayTileId,
  onProgress?: (info: DownloadProgressInfo) => void,
): Promise<TileSetStatus> {
  const { filename, url } = OVERLAY_TILES[id];
  return downloadTileSet(filename, url, onProgress);
}

/** Remove an on-device overlay tile database (e.g. to pull a rebuilt extract). */
export function deleteOverlayTiles(id: OverlayTileId): void {
  deleteTileSet(OVERLAY_TILES[id].filename);
}
