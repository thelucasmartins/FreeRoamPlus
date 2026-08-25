import { Directory, File, Paths } from 'expo-file-system';

import { OVERLAYS_DIR_NAME, STRUCTURES_FILENAME } from '../config';
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

/**
 * Loads the structures overlay: real pipeline output if it's been placed
 * on-device at overlays/structures.geojson, otherwise the bundled sample
 * data so the overlay/toggle is exercisable before the full LiDAR pipeline
 * (spec §9) has run.
 */
export async function loadStructures(): Promise<StructuresResult> {
  const file = structuresFile();
  if (!file.exists) {
    return { data: SAMPLE_STRUCTURES, isSample: true };
  }

  try {
    const data = (await file.json()) as StructureFeatureCollection;
    return { data, isSample: false };
  } catch {
    // Malformed on-device file — fall back rather than breaking the map.
    return { data: SAMPLE_STRUCTURES, isSample: true };
  }
}
