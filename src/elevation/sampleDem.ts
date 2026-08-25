import { SONOMA_CENTER } from '../config';
import type { ElevationGrid } from './types';

/**
 * A synthetic rolling-hills elevation grid covering the area the other
 * sample overlays use, for exercising the elevation profile before real
 * LiDAR/DEM data (spec §13) is on-device. Not derived from anything real —
 * just two overlapping sine waves kept within a plausible Sonoma County
 * elevation range (roughly 10-220m).
 */

const [centerLng, centerLat] = SONOMA_CENTER;
const HALF_SPAN_DEG = 0.03;
const GRID_SIZE = 21;

function syntheticElevationMeters(lng: number, lat: number): number {
  const dx = (lng - centerLng) * 200;
  const dy = (lat - centerLat) * 200;
  const base = 80;
  const ridge = 90 * Math.sin(dx * 0.6) * Math.cos(dy * 0.4);
  const rolling = 40 * Math.sin(dx * 1.3 + dy * 0.9);
  return Math.max(10, base + ridge + rolling);
}

function buildSampleDem(): ElevationGrid {
  const bounds: [number, number, number, number] = [
    centerLng - HALF_SPAN_DEG,
    centerLat - HALF_SPAN_DEG,
    centerLng + HALF_SPAN_DEG,
    centerLat + HALF_SPAN_DEG,
  ];
  const [west, south, east, north] = bounds;

  const elevationsMeters: number[] = [];
  for (let row = 0; row < GRID_SIZE; row++) {
    const lat = south + ((north - south) * row) / (GRID_SIZE - 1);
    for (let col = 0; col < GRID_SIZE; col++) {
      const lng = west + ((east - west) * col) / (GRID_SIZE - 1);
      elevationsMeters.push(syntheticElevationMeters(lng, lat));
    }
  }

  return { bounds, cols: GRID_SIZE, rows: GRID_SIZE, elevationsMeters };
}

export const SAMPLE_DEM: ElevationGrid = buildSampleDem();
