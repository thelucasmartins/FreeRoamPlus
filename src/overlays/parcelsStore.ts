import { File, Paths } from 'expo-file-system';

import { OVERLAYS_DIR_NAME, PARCELS_FILENAME } from '../config';
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

/**
 * Loads the parcels overlay: real county GIS export if it's been placed
 * on-device at overlays/parcels.geojson, otherwise the bundled sample data.
 *
 * Spec §10 flags that this layer previously failed to load/render reliably.
 * At true Sonoma County scale (100k+ parcels), a flat GeoJSON file parsed
 * synchronously in JS is the likely failure mode — see docs/DATA.md for the
 * vector-tile approach to use once a real county-wide export exists. This
 * loader is correct and safe for a moderate-sized export (a sub-region, or
 * this bundled sample) and degrades to the sample set rather than crashing
 * if the on-device file is missing or malformed.
 */
export async function loadParcels(): Promise<ParcelsResult> {
  const file = parcelsFile();
  if (!file.exists) {
    return { data: SAMPLE_PARCELS, isSample: true };
  }

  try {
    const data = (await file.json()) as ParcelFeatureCollection;
    return { data, isSample: false };
  } catch {
    return { data: SAMPLE_PARCELS, isSample: true };
  }
}
