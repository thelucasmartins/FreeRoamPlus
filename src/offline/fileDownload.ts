import { Directory, File } from 'expo-file-system';
import { Paths } from 'expo-file-system';

/**
 * Hardened one-time download of a single large file over Wi-Fi (spec §8).
 *
 * This is the shared implementation behind both the MBTiles tile databases
 * (tileSets.ts) and the overlay data files (overlayFiles.ts) — the delivery
 * mechanism is identical, only the destination directory and filename
 * differ. Keeping one copy means the hardening below can't drift between
 * the two callers.
 *
 * Hardened against the ways a multi-minute transfer fails partway through:
 * a preflight storage check (best-effort — skipped if the server won't
 * answer HEAD) so a doomed download doesn't start at all when there's
 * obviously not enough room, a stall timeout so a dead connection doesn't
 * leave the caller waiting forever, and cleanup of the partial file on any
 * failure so a failed attempt doesn't eat into the very storage budget that
 * may have caused it.
 */

/** Extra headroom required beyond the download's own size, so the device isn't left with zero free space right after. */
const DISK_SPACE_MARGIN_BYTES = 50 * 1024 * 1024;

/** Download is considered stalled (dead connection, captive portal) rather than just slow if no bytes arrive for this long. */
const STALL_TIMEOUT_MS = 30000;

export function formatBytes(bytes: number): string {
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

/** Progress callback for a download in flight, so callers can drive a determinate progress bar. */
export interface DownloadProgressInfo {
  bytesWritten: number;
  /** -1 when the server didn't report a total. */
  totalBytes: number;
}

/**
 * Downloads with a stall timeout: the timer resets on every progress event,
 * so a slow-but-moving Wi-Fi transfer is never cut off, but a connection
 * that goes dead partway through (captive portal, dropped Wi-Fi) is aborted
 * instead of leaving the caller's "Downloading…" spinner running forever.
 */
async function downloadWithStallTimeout(
  url: string,
  destination: File,
  onProgress?: (info: DownloadProgressInfo) => void,
): Promise<File> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> = setTimeout(() => controller.abort('stalled'), STALL_TIMEOUT_MS);
  const handleProgress = (info: DownloadProgressInfo) => {
    clearTimeout(timer);
    timer = setTimeout(() => controller.abort('stalled'), STALL_TIMEOUT_MS);
    onProgress?.(info);
  };

  try {
    return await File.downloadFileAsync(url, destination, {
      signal: controller.signal,
      onProgress: handleProgress,
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
 * Downloads `url` into `dir/filename`, atomically.
 *
 * Downloads to a temp name first so a half-finished transfer is never
 * mistaken for a valid file on the next launch, then moves it into place
 * only once it's known-complete and non-empty.
 */
export async function downloadFileTo(
  dir: Directory,
  filename: string,
  url: string,
  onProgress?: (info: DownloadProgressInfo) => void,
): Promise<File> {
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
    await downloadWithStallTimeout(url, partial, onProgress);
  } catch (err) {
    if (partial.exists) partial.delete();
    throw friendlyDownloadError(err);
  }

  if (!partial.exists || (partial.size ?? 0) === 0) {
    if (partial.exists) partial.delete();
    throw new Error('Download finished but produced an empty file — try again.');
  }

  const finalFile = new File(dir, filename);
  if (finalFile.exists) {
    finalFile.delete();
  }
  // `move()` is async in SDK 57 (`moveSync()` is the void variant). It must be
  // awaited: callers read `.exists`/`.size` off the destination immediately on
  // return, and an unawaited move can report a just-downloaded file as missing.
  await partial.move(finalFile);

  return new File(dir, filename);
}
