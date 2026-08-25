import { haversineMeters } from '../routing/geo';
import type { ElevationGrid, ElevationProfile, ElevationProfilePoint } from './types';

export interface ElevationChartBar {
  /** 0-1, this bar's elevation normalized to the profile's min/max range. */
  heightFraction: number;
  /** Grade magnitude approaching this bar from the previous one, as a percentage. */
  gradePercent: number;
}

/**
 * Bilinear-interpolated elevation at an arbitrary point. Returns null when
 * the point falls outside the grid's coverage — callers skip those points
 * rather than guessing, so a route that runs off the edge of a regional DEM
 * extract degrades gracefully instead of showing a fabricated profile.
 */
export function sampleElevation(grid: ElevationGrid, point: [number, number]): number | null {
  const [west, south, east, north] = grid.bounds;
  const [lng, lat] = point;
  if (lng < west || lng > east || lat < south || lat > north) return null;
  if (grid.cols < 2 || grid.rows < 2) return null;

  const fx = ((lng - west) / (east - west)) * (grid.cols - 1);
  const fy = ((lat - south) / (north - south)) * (grid.rows - 1);

  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(grid.cols - 1, x0 + 1);
  const y1 = Math.min(grid.rows - 1, y0 + 1);
  const tx = fx - x0;
  const ty = fy - y0;

  const at = (col: number, row: number) => grid.elevationsMeters[row * grid.cols + col];

  const top = at(x0, y0) + (at(x1, y0) - at(x0, y0)) * tx;
  const bottom = at(x0, y1) + (at(x1, y1) - at(x0, y1)) * tx;
  return top + (bottom - top) * ty;
}

/**
 * Builds an elevation profile along a path (typically a computed route's
 * on-network coordinates), for the spec §13 grade indicator: "Lets Lucas
 * see incline/steepness of a road or route ahead before committing to it."
 * Points outside the DEM's coverage are skipped rather than breaking the
 * whole profile. Returns null if fewer than two in-coverage points exist —
 * not enough to show a meaningful profile.
 */
export function buildElevationProfile(
  grid: ElevationGrid,
  coordinates: [number, number][],
): ElevationProfile | null {
  const points: ElevationProfilePoint[] = [];
  let cumulativeDistance = 0;
  let totalGain = 0;
  let totalLoss = 0;
  let maxGradePercent = 0;
  let prevCoord: [number, number] | null = null;
  let prevElevation: number | null = null;

  for (const coord of coordinates) {
    const elevation = sampleElevation(grid, coord);
    if (elevation === null) continue;

    if (prevCoord && prevElevation !== null) {
      const runMeters = haversineMeters(prevCoord, coord);
      cumulativeDistance += runMeters;

      const riseMeters = elevation - prevElevation;
      if (riseMeters > 0) totalGain += riseMeters;
      else totalLoss += -riseMeters;

      if (runMeters > 0) {
        const gradePercent = (Math.abs(riseMeters) / runMeters) * 100;
        if (gradePercent > maxGradePercent) maxGradePercent = gradePercent;
      }
    }

    points.push({ distanceMeters: cumulativeDistance, elevationMeters: elevation });
    prevCoord = coord;
    prevElevation = elevation;
  }

  if (points.length < 2) return null;

  const elevations = points.map((p) => p.elevationMeters);
  return {
    points,
    minElevationMeters: Math.min(...elevations),
    maxElevationMeters: Math.max(...elevations),
    totalGainMeters: totalGain,
    totalLossMeters: totalLoss,
    maxGradePercent,
  };
}

/** Elevation at an arbitrary distance along a profile, linearly interpolated between its points. */
function elevationAtDistance(profile: ElevationProfile, distanceMeters: number): number {
  const { points } = profile;
  if (distanceMeters <= points[0].distanceMeters) return points[0].elevationMeters;

  for (let i = 1; i < points.length; i++) {
    if (distanceMeters <= points[i].distanceMeters) {
      const a = points[i - 1];
      const b = points[i];
      const span = b.distanceMeters - a.distanceMeters;
      const t = span === 0 ? 0 : (distanceMeters - a.distanceMeters) / span;
      return a.elevationMeters + (b.elevationMeters - a.elevationMeters) * t;
    }
  }
  return points[points.length - 1].elevationMeters;
}

/**
 * Downsamples a profile into evenly-spaced bars for a sparkline-style
 * chart, each carrying the local grade approaching it — the UI colors bars
 * by steepness rather than relying on a single figure for the whole route.
 */
export function sampleProfileForChart(profile: ElevationProfile, barCount: number): ElevationChartBar[] {
  const { points, minElevationMeters, maxElevationMeters } = profile;
  const totalDistance = points[points.length - 1].distanceMeters;
  const range = maxElevationMeters - minElevationMeters;

  const bars: ElevationChartBar[] = [];
  let prevDistance = 0;
  let prevElevation = elevationAtDistance(profile, 0);

  for (let i = 0; i < barCount; i++) {
    const distance = (totalDistance * (i + 1)) / barCount;
    const elevation = elevationAtDistance(profile, distance);
    const heightFraction = range === 0 ? 0.5 : (elevation - minElevationMeters) / range;
    const run = distance - prevDistance;
    const gradePercent = run > 0 ? (Math.abs(elevation - prevElevation) / run) * 100 : 0;

    bars.push({ heightFraction, gradePercent });
    prevDistance = distance;
    prevElevation = elevation;
  }

  return bars;
}
