import { File, Paths } from 'expo-file-system';

import { OVERLAYS_DIR_NAME, PARCELS_FILENAME } from '../config';
import { recordLoadMetric, startTimer } from './loadMetrics';
import type { ParcelFeatureCollection } from './parcelTypes';
import { SAMPLE_PARCELS } from './sampleParcels';

export interface ParcelsResult {
  data: ParcelFeatureCollection;
  /** True when this is the bundled placeholder set, not real GIS data. */
  isSample: boolean;
}

function parcelsFile(): File {
  return new File(Paths.document, OVERLAYS_DIR_NAME, PARCELS_FILENAME);
}

function sampleResult(elapsed: () => number): ParcelsResult {
  recordLoadMetric({
    id: 'parcels',
    fileSizeBytes: null,
    parseMs: 0,
    postProcessMs: null,
    totalMs: elapsed(),
    isSample: true,
    featureCount: SAMPLE_PARCELS.features?.length ?? null,
  });
  return { data: SAMPLE_PARCELS, isSample: true };
}

/**
 * Loads the parcels overlay: real county GIS export if it's been placed
 * on-device at overlays/parcels.geojson, otherwise the bundled sample data.
 *
 * Spec §10 flags that this layer previously failed to load/render reliably.
 * At true Sonoma County scale (100k+ parcels), a flat GeoJSON file parsed
 * synchronously in JS is the likely failure mode — see docs/DATA.md for the
 * vector-tile approach now being adopted. This loader is correct and safe
 * for a moderate-sized export (a sub-region, or this bundled sample) and
 * degrades to the sample set rather than crashing if the on-device file is
 * missing or malformed.
 */
export async function loadParcels(): Promise<ParcelsResult> {
  const elapsed = startTimer();
  try {
    const file = parcelsFile();
    if (!file.exists) {
      return sampleResult(elapsed);
    }
    const fileSizeBytes = file.size ?? null;
    const parseStart = Date.now();
    const data = (await file.json()) as ParcelFeatureCollection;
    const parseMs = Date.now() - parseStart;

    recordLoadMetric({
      id: 'parcels',
      fileSizeBytes,
      parseMs,
      postProcessMs: null,
      totalMs: elapsed(),
      isSample: false,
      featureCount: data.features?.length ?? null,
    });
    return { data, isSample: false };
  } catch {
    // Also covers a native fs error from `.exists` itself, not just a JSON
    // parse failure.
    return sampleResult(elapsed);
  }
}
