import { Directory, File, FileMode, Paths } from 'expo-file-system';

import { TILES_DIR_NAME } from '../config';
import { downloadFileTo, type DownloadProgressInfo } from './fileDownload';

/** Every SQLite database — and so every MBTiles file — starts with these 16 bytes. */
const SQLITE_MAGIC = 'SQLite format 3\0';

/**
 * Smallest size we'll accept for a tile database.
 *
 * The magic-header check below catches truncation-to-garbage and wrong-format
 * downloads, but not the one shape it can't distinguish: a structurally
 * valid, completely empty SQLite file. GDAL's MBTiles writer creates exactly
 * that — it opens the real file as a ~16KB empty shell at startup and only
 * flushes tiles into it at the end of the conversion, accumulating in a
 * sidecar .temp.db meanwhile. Downloaded mid-build, such a file passes every
 * structural check, reports ready, and renders a blank layer with no error.
 *
 * 1MB is ~64x the empty shell and still an order of magnitude below any real
 * tileset here — the basemap and the county-scale overlays all run to tens of
 * megabytes. Deliberately a round number rather than a tuned one: it is not
 * trying to distinguish a good tileset from a slightly worse one, only a
 * populated database from an essentially empty one.
 *
 * This is a heuristic backstop, not a correctness guarantee. The actual
 * guarantee is that builds publish atomically — built to a staging path and
 * renamed into place only on success — so a partial file never appears at the
 * served path at all. See docs/DATA.md §6.
 *
 * Note the failure direction if this ever did reject a legitimately tiny
 * tileset: the overlay falls back to its GeoJSON, which for structures means
 * the ~102MB parse the tiles exist to avoid. That's a degradation, not a
 * break, but it's the reason not to raise this threshold casually.
 */
const MIN_TILE_DB_BYTES = 1024 * 1024;

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

/**
 * Whether a tile database is on-device AND usable.
 *
 * Existence alone is not evidence of usability. A database can be present,
 * be a structurally valid SQLite file, and still contain no tiles — that is
 * exactly what an in-progress GDAL build looks like on disk (see
 * MIN_TILE_DB_BYTES). Reporting such a file as ready is the worst available
 * outcome: callers switch to the tile path, nothing renders, and no error is
 * raised anywhere.
 *
 * So a suspiciously small database resolves to not-ready, which sends the
 * overlay stores down their GeoJSON/sample fallback instead. A visibly stale
 * or sample layer is a far better failure than a silently blank one.
 */
export function getTileSetStatus(filename: string): TileSetStatus {
  const db = tileSetFile(filename);
  if (!db.exists) {
    return { ready: false, mbtilesUrl: null, sizeBytes: null };
  }

  const sizeBytes = db.size ?? null;
  if (sizeBytes !== null && sizeBytes < MIN_TILE_DB_BYTES) {
    return { ready: false, mbtilesUrl: null, sizeBytes };
  }

  return { ready: true, mbtilesUrl: toMbtilesUrl(db.uri), sizeBytes };
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
 * Why a freshly downloaded tile database should be rejected, or null to
 * accept it. Both checks exist to turn a silent blank layer into a visible,
 * actionable error.
 */
function rejectionReason(file: File, filename: string): string | null {
  if (looksLikeSqlite(file) === false) {
    return `Downloaded ${filename} is not a valid tile database — the transfer may have been interrupted, or the server returned an error page. Try again.`;
  }

  // Deliberately after the header check, so a genuinely corrupt file gets the
  // more accurate message above rather than being reported as merely small.
  const size = file.size ?? 0;
  if (size > 0 && size < MIN_TILE_DB_BYTES) {
    return `Downloaded ${filename} is a valid but empty tile database (${Math.round(size / 1024)}KB) — it was most likely still being generated when it was fetched. Wait for the build to finish and try again.`;
  }

  return null;
}

/**
 * One-time download of a tile database over Wi-Fi (spec §8), written
 * atomically so a half-finished transfer is never mistaken for a valid
 * database on the next launch, then validated so a truncated, non-SQLite,
 * or structurally-valid-but-empty response fails loudly instead of
 * rendering an empty map.
 */
export async function downloadTileSet(
  filename: string,
  url: string,
  onProgress?: (info: DownloadProgressInfo) => void,
): Promise<TileSetStatus> {
  await downloadFileTo(tilesDir(), filename, url, onProgress);

  const file = tileSetFile(filename);
  const rejection = rejectionReason(file, filename);
  if (rejection) {
    // Don't leave it on disk: it would report `ready` on the next launch and
    // silently render nothing.
    try {
      file.delete();
    } catch {
      // Best-effort — the thrown error below is the important part.
    }
    throw new Error(rejection);
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
