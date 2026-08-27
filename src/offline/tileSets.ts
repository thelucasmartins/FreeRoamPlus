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

/** Extra headroom required beyond the download's own size, so the device isn't left with zero free space right after. */
const DISK_SPACE_MARGIN_BYTES = 50 * 1024 * 1024;

/** Download is considered stalled (dead connection, captive portal) rather than just slow if no bytes arrive for this long. */
const STALL_TIMEOUT_MS = 30000;

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/** Best-effort Content-Length lookup for the preflight storage check — a HEAD failure just skips the check rather than blocking the download. */
async function fetchContentLength(url: string): Promise<number | null> {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    const header = res.headers.get('content-length');
    if (!header) return null;
    const length = parseInt(header, 10);
    return Number.isFinite(length) && length > 0 ? length : null;
  } catch {
    return null;
  }
}

/**
 * Downloads with a stall timeout: the timer resets on every progress event,
 * so a slow-but-moving Wi-Fi transfer is never cut off, but a connection
 * that goes dead partway through (captive portal, dropped Wi-Fi) is aborted
 * instead of leaving the caller's "Downloading…" spinner running forever.
 */
async function downloadWithStallTimeout(url: string, destination: File): Promise<File> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> = setTimeout(() => controller.abort('stalled'), STALL_TIMEOUT_MS);
  const resetTimer = () => {
    clearTimeout(timer);
    timer = setTimeout(() => controller.abort('stalled'), STALL_TIMEOUT_MS);
  };

  try {
    return await File.downloadFileAsync(url, destination, {
      signal: controller.signal,
      onProgress: resetTimer,
    });
  } finally {
    clearTimeout(timer);
  }
}

function friendlyDownloadError(err: unknown): Error {
  if (err instanceof Error && err.name === 'AbortError') {
    return new Error('Download stalled — no data received for 30s. Check your connection and try again.');
  }
  return err instanceof Error ? err : new Error(String(err));
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
 *
 * Hardened against the ways this can fail partway through: a preflight
 * storage check (best-effort — skipped if the server won't answer HEAD) so
 * a doomed multi-minute download doesn't start at all when there's
 * obviously not enough room, a stall timeout so a dead connection doesn't
 * leave the caller waiting forever, and cleanup of the partial file on any
 * failure so a failed attempt doesn't eat into the very storage budget that
 * may have caused it.
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

  const expectedBytes = await fetchContentLength(url);
  const available = Paths.availableDiskSpace;
  if (expectedBytes !== null && typeof available === 'number') {
    const needed = expectedBytes + DISK_SPACE_MARGIN_BYTES;
    if (available < needed) {
      throw new Error(
        `Not enough free storage: this download needs about ${formatBytes(expectedBytes)}, but only ${formatBytes(available)} is free.`,
      );
    }
  }

  try {
    await downloadWithStallTimeout(url, partial);
  } catch (err) {
    if (partial.exists) partial.delete();
    throw friendlyDownloadError(err);
  }

  if (!partial.exists || (partial.size ?? 0) === 0) {
    if (partial.exists) partial.delete();
    throw new Error('Download finished but produced an empty file — try again.');
  }

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
