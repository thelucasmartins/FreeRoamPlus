import { File, Paths } from 'expo-file-system';

import { OVERLAYS_DIR_NAME, STRUCTURES_FILENAME, STRUCTURES_SOURCE_LAYER } from '../config';
import { getOverlayTileStatus } from '../offline/overlayTiles';
import { recordLoadMetric, startTimer } from './loadMetrics';
import { SAMPLE_STRUCTURES } from './sampleStructures';
import type { StructureFeatureCollection } from './types';
import type { OverlaySource } from './overlaySource';

function structuresFile(): File {
  return new File(Paths.document, OVERLAYS_DIR_NAME, STRUCTURES_FILENAME);
}

function sampleResult(elapsed: () => number): OverlaySource<StructureFeatureCollection> {
  recordLoadMetric({
    id: 'structures',
    mode: 'sample',
    fileSizeBytes: null,
    parseMs: 0,
    postProcessMs: null,
    totalMs: elapsed(),
    featureCount: SAMPLE_STRUCTURES.features?.length ?? null,
  });
  return { mode: 'sample', data: SAMPLE_STRUCTURES };
}

/**
 * Loads the structures overlay (spec §4, §9), resolving tiles first.
 *
 * Order matters and is the entire point of this function: if
 * structures.mbtiles is on-device we return immediately WITHOUT reading
 * structures.geojson at all. At county scale that file is ~102MB — the
 * largest overlay — and parsing it whole is the pattern docs/DATA.md §6
 * identifies as the likely cause of the previous project's failure.
 * Rendering from tiles while still parsing the GeoJSON would keep the stall
 * and fix nothing, so the early return is load-bearing, not an optimisation.
 *
 * Falls back to the real GeoJSON when no tiles exist, and to bundled sample
 * data when neither does, so a missing or half-transferred file degrades
 * instead of breaking the map.
 */
export async function loadStructures(): Promise<OverlaySource<StructureFeatureCollection>> {
  const elapsed = startTimer();

  try {
    const tiles = getOverlayTileStatus('structures');
    if (tiles.ready && tiles.mbtilesUrl) {
      recordLoadMetric({
        id: 'structures',
        mode: 'tiles',
        fileSizeBytes: tiles.sizeBytes,
        parseMs: 0,
        postProcessMs: null,
        totalMs: elapsed(),
        featureCount: null,
      });
      return { mode: 'tiles', tileUrl: tiles.mbtilesUrl, sourceLayer: STRUCTURES_SOURCE_LAYER };
    }
  } catch {
    // A native fs error checking for the tile database shouldn't strand the
    // overlay — fall through to the GeoJSON/sample paths below.
  }

  try {
    const file = structuresFile();
    if (!file.exists) {
      return sampleResult(elapsed);
    }
    const fileSizeBytes = file.size ?? null;
    const parseStart = Date.now();
    const data = (await file.json()) as StructureFeatureCollection;
    const parseMs = Date.now() - parseStart;

    recordLoadMetric({
      id: 'structures',
      mode: 'file',
      fileSizeBytes,
      parseMs,
      postProcessMs: null,
      totalMs: elapsed(),
      featureCount: data.features?.length ?? null,
    });
    return { mode: 'file', data };
  } catch {
    // Missing, malformed, or unreadable on-device file — fall back rather
    // than breaking the map (also covers a native fs error from `.exists`
    // itself, not just a JSON parse failure).
    return sampleResult(elapsed);
  }
}
