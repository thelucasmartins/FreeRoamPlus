import { File, Paths } from 'expo-file-system';

import { DEM_FILENAME, OVERLAYS_DIR_NAME } from '../config';
import { SAMPLE_DEM } from './sampleDem';
import type { ElevationGrid } from './types';

export interface DemResult {
  grid: ElevationGrid;
  /** True when this is the synthetic placeholder grid, not real DEM data. */
  isSample: boolean;
}

function demFile(): File {
  return new File(Paths.document, OVERLAYS_DIR_NAME, DEM_FILENAME);
}

/**
 * Loads the elevation grid: real DEM export if it's been placed on-device
 * at overlays/dem.json, otherwise the bundled synthetic grid.
 */
export async function loadDem(): Promise<DemResult> {
  const file = demFile();
  if (!file.exists) {
    return { grid: SAMPLE_DEM, isSample: true };
  }

  try {
    const grid = (await file.json()) as ElevationGrid;
    return { grid, isSample: false };
  } catch {
    return { grid: SAMPLE_DEM, isSample: true };
  }
}
