/**
 * Real DEM pipeline (spec §9, §13): builds dem.json from the USGS National
 * Map Elevation Point Query Service — no bulk raster download needed, just
 * one HTTP request per grid point, which fits this environment's disk
 * budget (no GDAL, no multi-GB LiDAR/DEM file).
 *
 * Run: npx tsx pipeline/fetchDem.ts
 * Output: data/overlays/dem.json
 */
import { mkdirSync, writeFileSync } from 'fs';
import { REGION_BOUNDS } from '../src/config';
import type { ElevationGrid } from '../src/elevation/types';

const COLS = 46;
const ROWS = 36;
const CONCURRENCY = 12;
const OUT_PATH = 'data/overlays/dem.json';

async function fetchElevation(lng: number, lat: number): Promise<number> {
  const url = `https://epqs.nationalmap.gov/v1/json?x=${lng}&y=${lat}&units=Meters&wkid=4326`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`EPQS HTTP ${res.status} for ${lng},${lat}`);
  const body = (await res.json()) as { value?: string };
  const value = Number(body.value);
  if (!Number.isFinite(value)) throw new Error(`EPQS returned non-numeric value for ${lng},${lat}: ${body.value}`);
  // USGS returns -1000000 (sentinel) for points outside coverage (e.g. open ocean).
  return value < -1000 ? 0 : value;
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

async function main() {
  const { sw, ne } = REGION_BOUNDS;
  const [west, south] = sw;
  const [east, north] = ne;

  const points: [number, number][] = [];
  for (let row = 0; row < ROWS; row++) {
    const lat = south + ((north - south) * row) / (ROWS - 1);
    for (let col = 0; col < COLS; col++) {
      const lng = west + ((east - west) * col) / (COLS - 1);
      points.push([lng, lat]);
    }
  }

  console.log(`Fetching ${points.length} elevation points from USGS EPQS (concurrency ${CONCURRENCY})...`);
  let done = 0;
  const elevationsMeters = await mapWithConcurrency(points, CONCURRENCY, async ([lng, lat]) => {
    const value = await fetchElevation(lng, lat);
    done++;
    if (done % 100 === 0) console.log(`  ${done}/${points.length}`);
    return value;
  });

  const grid: ElevationGrid = {
    bounds: [west, south, east, north],
    cols: COLS,
    rows: ROWS,
    elevationsMeters,
  };

  mkdirSync('data/overlays', { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(grid));
  console.log(`Wrote ${OUT_PATH} (${COLS}x${ROWS} grid, ${elevationsMeters.length} points)`);
  console.log(`Elevation range: ${Math.min(...elevationsMeters).toFixed(0)}m - ${Math.max(...elevationsMeters).toFixed(0)}m`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
