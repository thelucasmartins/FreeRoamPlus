import { Directory, File, Paths } from 'expo-file-system';

import {
  DEM_DOWNLOAD_URL,
  DEM_FILENAME,
  OVERLAYS_DIR_NAME,
  PARCELS_DOWNLOAD_URL,
  PARCELS_FILENAME,
  ROADS_DOWNLOAD_URL,
  ROADS_FILENAME,
  SEARCH_INDEX_DOWNLOAD_URL,
  SEARCH_INDEX_FILENAME,
  STRUCTURES_DOWNLOAD_URL,
  STRUCTURES_FILENAME,
} from '../config';
import { downloadFileTo, formatBytes, type DownloadProgressInfo } from './fileDownload';

/**
 * On-device delivery of the overlay data files (spec §8, §9).
 *
 * The overlay stores in src/overlays/ each read a single file out of the
 * app's document dir and fall back to bundled sample data when it isn't
 * there. This module is the other half of that contract: the thing that
 * actually puts the real pipeline output on the device. Without it the
 * stores can only ever serve samples, however good the desktop data is.
 *
 * Transfer hardening (disk-space preflight, stall timeout, atomic
 * partial-file handling, friendly errors) is shared with the MBTiles
 * downloader — see fileDownload.ts.
 */

export type OverlayId = 'structures' | 'roads' | 'parcels' | 'searchIndex' | 'dem';

interface OverlayDescriptor {
  /** Human-readable name for progress/error UI. */
  label: string;
  filename: string;
  url: string;
}

const OVERLAYS: Record<OverlayId, OverlayDescriptor> = {
  structures: { label: 'Structures', filename: STRUCTURES_FILENAME, url: STRUCTURES_DOWNLOAD_URL },
  roads: { label: 'Roads & trails', filename: ROADS_FILENAME, url: ROADS_DOWNLOAD_URL },
  parcels: { label: 'Parcels', filename: PARCELS_FILENAME, url: PARCELS_DOWNLOAD_URL },
  searchIndex: { label: 'Search index', filename: SEARCH_INDEX_FILENAME, url: SEARCH_INDEX_DOWNLOAD_URL },
  dem: { label: 'Elevation grid', filename: DEM_FILENAME, url: DEM_DOWNLOAD_URL },
};

export const OVERLAY_IDS = Object.keys(OVERLAYS) as OverlayId[];

export function overlayLabel(id: OverlayId): string {
  return OVERLAYS[id].label;
}

/** Directory (under the app's document dir) where the overlay stores look for real data. */
export function overlaysDir(): Directory {
  return new Directory(Paths.document, OVERLAYS_DIR_NAME);
}

function overlayFile(id: OverlayId): File {
  return new File(overlaysDir(), OVERLAYS[id].filename);
}

export interface OverlayFileStatus {
  id: OverlayId;
  label: string;
  /** True when the real file is present on-device — i.e. the store will stop serving samples. */
  ready: boolean;
  sizeBytes: number | null;
  /** Human-readable size, or null when not present. */
  sizeLabel: string | null;
}

export function getOverlayStatus(id: OverlayId): OverlayFileStatus {
  const { label } = OVERLAYS[id];
  const file = overlayFile(id);
  // `.exists` can throw on a native fs error; treat that as "not present"
  // rather than letting a status check break the caller's screen.
  try {
    if (!file.exists) {
      return { id, label, ready: false, sizeBytes: null, sizeLabel: null };
    }
    const sizeBytes = file.size ?? null;
    return { id, label, ready: true, sizeBytes, sizeLabel: sizeBytes === null ? null : formatBytes(sizeBytes) };
  } catch {
    return { id, label, ready: false, sizeBytes: null, sizeLabel: null };
  }
}

export function getAllOverlayStatuses(): OverlayFileStatus[] {
  return OVERLAY_IDS.map(getOverlayStatus);
}

/**
 * Downloads one overlay file over Wi-Fi into the document dir, where the
 * corresponding store will find it on next load.
 *
 * Throws on failure (with a message fit to show the user) rather than
 * silently leaving the sample data in place — the caller is an explicit
 * user-initiated "download data" action, so a silent no-op would be
 * indistinguishable from success.
 */
export async function downloadOverlay(
  id: OverlayId,
  onProgress?: (info: DownloadProgressInfo) => void,
): Promise<OverlayFileStatus> {
  const { filename, url } = OVERLAYS[id];
  await downloadFileTo(overlaysDir(), filename, url, onProgress);
  return getOverlayStatus(id);
}

/** Per-file outcome from a bulk download — one failure doesn't abort the rest. */
export interface OverlayDownloadOutcome {
  id: OverlayId;
  label: string;
  ok: boolean;
  status: OverlayFileStatus;
  error: string | null;
}

/**
 * Downloads several overlays in sequence, continuing past failures.
 *
 * Sequential rather than parallel on purpose: these are 12–100MB files over
 * a phone's Wi-Fi, and running them concurrently mainly serves to make each
 * one slower, more likely to trip the stall timeout, and harder to show
 * meaningful progress for.
 */
export async function downloadOverlays(
  ids: OverlayId[] = OVERLAY_IDS,
  onProgress?: (id: OverlayId, info: DownloadProgressInfo) => void,
): Promise<OverlayDownloadOutcome[]> {
  const outcomes: OverlayDownloadOutcome[] = [];
  for (const id of ids) {
    try {
      const status = await downloadOverlay(id, (info) => onProgress?.(id, info));
      outcomes.push({ id, label: overlayLabel(id), ok: true, status, error: null });
    } catch (err) {
      outcomes.push({
        id,
        label: overlayLabel(id),
        ok: false,
        status: getOverlayStatus(id),
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return outcomes;
}

/** Remove an on-device overlay file — the store reverts to bundled sample data on next load. */
export function deleteOverlay(id: OverlayId): void {
  const file = overlayFile(id);
  try {
    if (file.exists) {
      file.delete();
    }
  } catch {
    // Nothing useful to do if the delete fails; the store still works either way.
  }
}
