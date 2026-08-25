import { Directory, File, Paths } from 'expo-file-system';

import { TILES_DIR_NAME } from '../config';

export interface TileSetStatus {
  /** True when the MBTiles database exists on-device. */
  ready: boolean;
  /** mbtiles:// URL for use inside a MapLibre style source, if ready. */
  mbtilesUrl: string | null;
  /** Size of the tile database in bytes, if ready. */
  sizeBytes: number | null;
}

/**
 * Generic on-device management for a single named MBTiles file under
 * tiles/ — the street basemap (tileStore.ts, which also handles glyphs)
 * and the satellite/LiDAR base layers (baseLayerTiles.ts) are all just
 * this, parameterized by filename and download URL.
 */
export function tilesDir(): Directory {
  return new Directory(Paths.document, TILES_DIR_NAME);
}

function tileSetFile(filename: string): File {
  return new File(tilesDir(), filename);
}

/**
 * MapLibre Native reads local MBTiles databases through the mbtiles:// URL
 * scheme; expo-file-system hands back file:// URIs, so swap the scheme.
 */
function toMbtilesUrl(fileUri: string): string {
  return fileUri.replace(/^file:\/\//, 'mbtiles://');
}

export function getTileSetStatus(filename: string): TileSetStatus {
  const db = tileSetFile(filename);
  if (!db.exists) {
    return { ready: false, mbtilesUrl: null, sizeBytes: null };
  }
  return { ready: true, mbtilesUrl: toMbtilesUrl(db.uri), sizeBytes: db.size ?? null };
}

/**
 * One-time download of a tile database over Wi-Fi (spec §8). Downloads to a
 * temp name first so a half-finished transfer is never mistaken for a valid
 * database on the next launch.
 */
export async function downloadTileSet(filename: string, url: string): Promise<TileSetStatus> {
  const dir = tilesDir();
  if (!dir.exists) {
    dir.create({ intermediates: true });
  }

  const partial = new File(dir, `${filename}.download`);
  if (partial.exists) {
    partial.delete();
  }

  await File.downloadFileAsync(url, partial);

  const finalFile = tileSetFile(filename);
  if (finalFile.exists) {
    finalFile.delete();
  }
  partial.move(finalFile);

  return getTileSetStatus(filename);
}

/** Remove an on-device tile database (e.g. to re-download a newer extract, or free up space). */
export function deleteTileSet(filename: string): void {
  const db = tileSetFile(filename);
  if (db.exists) {
    db.delete();
  }
}
