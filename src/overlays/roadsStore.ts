import { File, Paths } from 'expo-file-system';

import { OVERLAYS_DIR_NAME, ROADS_FILENAME } from '../config';
import { recordLoadMetric, startTimer } from './loadMetrics';
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

function sampleResult(elapsed: () => number, parseMs: number): RoadsResult {
  const postStart = Date.now();
  const data = classifyRoads(SAMPLE_ROADS);
  recordLoadMetric({
    id: 'roads',
    fileSizeBytes: null,
    parseMs,
    postProcessMs: Date.now() - postStart,
    totalMs: elapsed(),
    mode: 'sample',
    featureCount: data.features?.length ?? null,
  });
  return { data, isSample: true };
}

/**
 * Loads the roads/trails overlay: real pipeline output if it's been placed
 * on-device at overlays/roads.geojson, otherwise the bundled sample data.
 * Either way, classification (spec §5, §15) is applied here rather than
 * trusted from the file, so the rule lives in one place.
 *
 * Roads stays a full in-memory GeoJSON load rather than moving to vector
 * tiles like structures and parcels: MapScreen feeds this same object into
 * buildRoutingGraph(), and a viewport-streamed VectorSource cannot yield a
 * complete routing graph. Parse and classification time are recorded
 * separately (see loadMetrics.ts) because classification walks every
 * feature and is a plausible stall source in its own right at real scale.
 */
export async function loadRoads(): Promise<RoadsResult> {
  const elapsed = startTimer();
  try {
    const file = roadsFile();
    if (!file.exists) {
      return sampleResult(elapsed, 0);
    }
    const fileSizeBytes = file.size ?? null;
    const parseStart = Date.now();
    const raw = (await file.json()) as RoadFeatureCollection;
    const parseMs = Date.now() - parseStart;

    const postStart = Date.now();
    const data = classifyRoads(raw);
    const postProcessMs = Date.now() - postStart;

    recordLoadMetric({
      id: 'roads',
      fileSizeBytes,
      parseMs,
      postProcessMs,
      totalMs: elapsed(),
      mode: 'file',
      featureCount: data.features?.length ?? null,
    });
    return { data, isSample: false };
  } catch {
    // Missing, malformed, or unreadable on-device file — fall back rather
    // than breaking the map (also covers a native fs error from `.exists`
    // itself, not just a JSON parse failure).
    return sampleResult(elapsed, 0);
  }
}
