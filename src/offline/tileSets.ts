import { Directory, File, FileMode, Paths } from 'expo-file-system';

import { TILES_DIR_NAME } from '../config';
import { downloadFileTo, type DownloadProgressInfo } from './fileDownload';

/** Every SQLite database — and so every MBTiles file — starts with these 16 bytes. */
const SQLITE_MAGIC = 'SQLite format 3\0';

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
 *
 * The hardened transfer itself (disk-space preflight, stall timeout,
 * partial-file cleanup, friendly error mapping) lives in fileDownload.ts,
 * shared with the overlay data files.
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
 * Cheap sanity check that a downloaded file is actually a SQLite database,
 * by reading its 16-byte magic header.
 *
 * Returns `null` when the check itself couldn't run (platform quirk, no read
 * access) — deliberately tri-state, so an unreadable header is treated as
 * "unknown, carry on" rather than condemning a good download. Only a
 * positive mismatch rejects.
 *
 * This exists because the failure it catches is silent. A truncated or
 * HTML-error-page "database" is not zero bytes, so it passes the empty-file
 * check, gets reported ready, and then renders an empty layer with no error
 * anywhere — which is exactly the symptom the parcels layer died of before
 * (docs/DATA.md §6). It is also a live risk during development: the desktop
 * conversion writes these files in place while the dev file server is
 * serving that same directory, so a download can catch one mid-write.
 */
function looksLikeSqlite(file: File): boolean | null {
  let handle: ReturnType<File['open']> | undefined;
  try {
    handle = file.open(FileMode.ReadOnly);
    const bytes = handle.readBytes(SQLITE_MAGIC.length);
    if (bytes.length < SQLITE_MAGIC.length) {
      return false;
    }
    let header = '';
    for (let i = 0; i < SQLITE_MAGIC.length; i += 1) {
      header += String.fromCharCode(bytes[i]);
    }
    return header === SQLITE_MAGIC;
  } catch {
    return null;
  } finally {
    try {
      handle?.close();
    } catch {
      // A close failure tells us nothing about the file's validity.
    }
  }
}

/**
 * One-time download of a tile database over Wi-Fi (spec §8), written
 * atomically so a half-finished transfer is never mistaken for a valid
 * database on the next launch, then header-checked so a truncated or
 * non-SQLite response fails loudly instead of rendering an empty map.
 */
export async function downloadTileSet(
  filename: string,
  url: string,
  onProgress?: (info: DownloadProgressInfo) => void,
): Promise<TileSetStatus> {
  await downloadFileTo(tilesDir(), filename, url, onProgress);

  const file = tileSetFile(filename);
  if (looksLikeSqlite(file) === false) {
    // Don't leave it on disk: it would report `ready` on the next launch and
    // silently render nothing.
    try {
      file.delete();
    } catch {
      // Best-effort — the thrown error below is the important part.
    }
    throw new Error(
      `Downloaded ${filename} is not a valid tile database — the transfer may have been interrupted, or the file was still being written. Try again.`,
    );
  }

  return getTileSetStatus(filename);
}

/** Remove an on-device tile database (e.g. to re-download a newer extract, or free up space). */
export function deleteTileSet(filename: string): void {
  const db = tileSetFile(filename);
  if (db.exists) {
    db.delete();
  }
}
