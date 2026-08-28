import { File, Paths } from 'expo-file-system';

import { OVERLAYS_DIR_NAME, STRUCTURES_FILENAME } from '../config';
import { recordLoadMetric, startTimer } from './loadMetrics';
import { SAMPLE_STRUCTURES } from './sampleStructures';
import type { StructureFeatureCollection } from './types';

export interface StructuresResult {
  data: StructureFeatureCollection;
  /** True when this is the bundled placeholder set, not real pipeline output. */
  isSample: boolean;
}

function structuresFile(): File {
  return new File(Paths.document, OVERLAYS_DIR_NAME, STRUCTURES_FILENAME);
}

function sampleResult(elapsed: () => number): StructuresResult {
  recordLoadMetric({
    id: 'structures',
    fileSizeBytes: null,
    parseMs: 0,
    postProcessMs: null,
    totalMs: elapsed(),
    isSample: true,
    featureCount: SAMPLE_STRUCTURES.features?.length ?? null,
  });
  return { data: SAMPLE_STRUCTURES, isSample: true };
}

/**
 * Loads the structures overlay: real pipeline output if it's been placed
 * on-device at overlays/structures.geojson, otherwise the bundled sample
 * data so the overlay/toggle is exercisable before the full LiDAR pipeline
 * (spec §9) has run.
 *
 * At real county scale this file is ~100MB — the largest of the overlays —
 * and this whole-file parse is the exact pattern docs/DATA.md §6 flags as
 * the likely cause of the previous project's failure. Rendering is moving
 * to a VectorSource over structures.mbtiles; this loader stays as the
 * fallback path and as the honest measurement of what the GeoJSON route
 * actually costs (see loadMetrics.ts).
 */
export async function loadStructures(): Promise<StructuresResult> {
  const elapsed = startTimer();
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
      fileSizeBytes,
      parseMs,
      postProcessMs: null,
      totalMs: elapsed(),
      isSample: false,
      featureCount: data.features?.length ?? null,
    });
    return { data, isSample: false };
  } catch {
    // Missing, malformed, or unreadable on-device file — fall back rather
    // than breaking the map (also covers a native fs error from `.exists`
    // itself, not just a JSON parse failure).
    return sampleResult(elapsed);
  }
}
