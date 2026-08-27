import { File, Paths } from 'expo-file-system';

import { OVERLAYS_DIR_NAME, ROADS_FILENAME } from '../config';
import { classifyRoads } from './roadClassification';
import { SAMPLE_ROADS } from './sampleRoads';
import type { ClassifiedRoadFeatureCollection, RoadFeatureCollection } from './roadTypes';

export interface RoadsResult {
  data: ClassifiedRoadFeatureCollection;
  /** True when this is the bundled placeholder set, not real pipeline output. */
  isSample: boolean;
}

function roadsFile(): File {
  return new File(Paths.document, OVERLAYS_DIR_NAME, ROADS_FILENAME);
}

/**
 * Loads the roads/trails overlay: real pipeline output if it's been placed
 * on-device at overlays/roads.geojson, otherwise the bundled sample data.
 * Either way, classification (spec §5, §15) is applied here rather than
 * trusted from the file, so the rule lives in one place.
 */
export async function loadRoads(): Promise<RoadsResult> {
  try {
    const file = roadsFile();
    if (!file.exists) {
      return { data: classifyRoads(SAMPLE_ROADS), isSample: true };
    }
    const raw = (await file.json()) as RoadFeatureCollection;
    return { data: classifyRoads(raw), isSample: false };
  } catch {
    // Missing, malformed, or unreadable on-device file — fall back rather
    // than breaking the map (also covers a native fs error from `.exists`
    // itself, not just a JSON parse failure).
    return { data: classifyRoads(SAMPLE_ROADS), isSample: true };
  }
}
