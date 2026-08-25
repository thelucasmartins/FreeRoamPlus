import { Directory } from 'expo-file-system';

import { MBTILES_FILENAME, TILE_DOWNLOAD_URL } from '../config';
import { deleteTileSet, downloadTileSet, getTileSetStatus, tilesDir } from './tileSets';

export interface TileStoreStatus {
  /** True when the MBTiles database exists on-device. */
  ready: boolean;
  /** mbtiles:// URL for use inside a MapLibre style source, if ready. */
  mbtilesUrl: string | null;
  /** file:// glyphs URL template if a font glyph pack is present, else null. */
  glyphsUrl: string | null;
  /** Size of the tile database in bytes, if ready. */
  sizeBytes: number | null;
}

function withGlyphs(status: { ready: boolean; mbtilesUrl: string | null; sizeBytes: number | null }): TileStoreStatus {
  if (!status.ready) {
    return { ...status, glyphsUrl: null };
  }

  // Symbol (text) layers need font glyphs. If a glyph pack has been placed at
  // tiles/fonts/<fontstack>/<range>.pbf, point the style at it; otherwise the
  // style builder simply omits label layers.
  const fontsDir = new Directory(tilesDir(), 'fonts');
  const glyphsUrl = fontsDir.exists
    ? `${fontsDir.uri.replace(/\/$/, '')}/{fontstack}/{range}.pbf`
    : null;

  return { ...status, glyphsUrl };
}

export function getStatus(): TileStoreStatus {
  return withGlyphs(getTileSetStatus(MBTILES_FILENAME));
}

export async function downloadTiles(url: string = TILE_DOWNLOAD_URL): Promise<TileStoreStatus> {
  return withGlyphs(await downloadTileSet(MBTILES_FILENAME, url));
}

/** Remove the on-device tile database (e.g. to re-download a newer extract). */
export function deleteTiles(): void {
  deleteTileSet(MBTILES_FILENAME);
}
