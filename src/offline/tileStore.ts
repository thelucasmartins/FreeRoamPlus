import { Directory, File, Paths } from 'expo-file-system';

import { MBTILES_FILENAME, TILES_DIR_NAME, TILE_DOWNLOAD_URL } from '../config';

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

function tilesDir(): Directory {
  return new Directory(Paths.document, TILES_DIR_NAME);
}

function mbtilesFile(): File {
  return new File(tilesDir(), MBTILES_FILENAME);
}

/**
 * MapLibre Native reads local MBTiles databases through the mbtiles:// URL
 * scheme; expo-file-system hands back file:// URIs, so swap the scheme.
 */
function toMbtilesUrl(fileUri: string): string {
  return fileUri.replace(/^file:\/\//, 'mbtiles://');
}

export function getStatus(): TileStoreStatus {
  const db = mbtilesFile();
  if (!db.exists) {
    return { ready: false, mbtilesUrl: null, glyphsUrl: null, sizeBytes: null };
  }

  // Symbol (text) layers need font glyphs. If a glyph pack has been placed at
  // tiles/fonts/<fontstack>/<range>.pbf, point the style at it; otherwise the
  // style builder simply omits label layers.
  const fontsDir = new Directory(tilesDir(), 'fonts');
  const glyphsUrl = fontsDir.exists
    ? `${fontsDir.uri.replace(/\/$/, '')}/{fontstack}/{range}.pbf`
    : null;

  return {
    ready: true,
    mbtilesUrl: toMbtilesUrl(db.uri),
    glyphsUrl,
    sizeBytes: db.size ?? null,
  };
}

/**
 * One-time download of the tile database over Wi-Fi (spec §8). Downloads to a
 * temp name first so a half-finished transfer is never mistaken for a valid
 * database on the next launch.
 */
export async function downloadTiles(
  url: string = TILE_DOWNLOAD_URL,
): Promise<TileStoreStatus> {
  const dir = tilesDir();
  if (!dir.exists) {
    dir.create({ intermediates: true });
  }

  const partial = new File(dir, `${MBTILES_FILENAME}.download`);
  if (partial.exists) {
    partial.delete();
  }

  await File.downloadFileAsync(url, partial);

  const finalFile = mbtilesFile();
  if (finalFile.exists) {
    finalFile.delete();
  }
  partial.move(finalFile);

  return getStatus();
}

/** Remove the on-device tile database (e.g. to re-download a newer extract). */
export function deleteTiles(): void {
  const db = mbtilesFile();
  if (db.exists) {
    db.delete();
  }
}
