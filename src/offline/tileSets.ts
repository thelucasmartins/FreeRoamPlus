import { Directory, File, FileMode, Paths } from 'expo-file-system';

import { MBTILES_FILENAME, TILES_DIR_NAME } from '../config';
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
 * Floors are per-artifact, because one global number can only be sized for
 * one failure. 1MB is ~64x an empty shell and right for the overlay tile
 * sets, but useless for the basemap: a county-scale Planetiler build that
 * aborts partway — a designed outcome, since the production runner kills the
 * JVM on sustained low memory or disk — leaves a *hundreds of megabytes*
 * partial `sonoma.mbtiles` that sails past 1MB, passes the SQLite header
 * check, and reports ready. On device that renders a partial county with no
 * error anywhere, which reads as "the basemap works, Sonoma is just sparse
 * over here".
 *
 * Deliberately round numbers, not tuned ones: these separate "populated" from
 * "essentially empty", and make no attempt to judge quality.
 *
 * BE CLEAR ABOUT THE LIMIT. A size floor catches a build that died *early*.
 * It cannot catch one that died late — a basemap abandoned at 80% of a 300MB
 * build clears any floor that a legitimate small build also clears, and no
 * choice of number fixes that. This is a backstop for the cheap case, not a
 * correctness guarantee. The actual guarantee is upstream: builds publish
 * atomically, staged to a temporary path and renamed into place only on
 * success, so a partial database never appears at the served path at all.
 * See docs/DATA.md §6.
 *
 * Note the failure direction if a floor ever did reject a legitimate tileset:
 * the overlay falls back to its GeoJSON, which for structures means the
 * ~102MB parse the tiles exist to avoid. A degradation rather than a break,
 * but the reason not to raise these casually.
 */
const DEFAULT_MIN_TILE_DB_BYTES = 1024 * 1024;

/**
 * Per-artifact floors for databases whose legitimate size is known to be
 * much larger than the default.
 *
 * CALIBRATED AGAINST THE REAL ARTIFACT, not an estimate. The measured
 * Sonoma County basemap is 24,125,440 bytes (23MB, 4,230 tiles, z0–14).
 * This floor was originally set to 20MB from the docs' "tens of MB", which
 * the real build then cleared by only 15% — far too tight. A slightly
 * smaller rebuild (a narrower bbox, a lower maxzoom, a different Planetiler
 * release) would have been rejected as empty.
 *
 * That direction of failure is worse here than anywhere else in this file:
 * the overlays fall back to GeoJSON when their tiles are refused, but the
 * basemap has no fallback at all. Refusing a valid sonoma.mbtiles leaves the
 * app with no map, which is a total failure in place of the partial-render
 * this floor is guarding against.
 *
 * 5MB keeps ~4.8x headroom under the real artifact while still sitting ~300x
 * above the empty ~16KB shell, which is the case a floor can actually catch.
 */
const MIN_TILE_DB_BYTES_BY_FILE: Record<string, number> = {
  [MBTILES_FILENAME]: 5 * 1024 * 1024,
};

function minBytesFor(filename: string): number {
  return MIN_TILE_DB_BYTES_BY_FILE[filename] ?? DEFAULT_MIN_TILE_DB_BYTES;
}

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
 * DEFAULT_MIN_TILE_DB_BYTES). Reporting such a file as ready is the worst
 * available outcome: callers switch to the tile path, nothing renders, and no
 * error is raised anywhere.
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
  if (sizeBytes !== null && sizeBytes < minBytesFor(filename)) {
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
  if (size > 0 && size < minBytesFor(filename)) {
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
