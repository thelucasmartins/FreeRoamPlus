/**
 * Minimal pure-JS spatial helpers for the pipeline scripts — no GDAL/turf
 * dependency, just what's needed for a point-in-polygon protected-land
 * cross-reference (spec §9 step 3).
 */

export type Ring = [number, number][];

/** Standard ray-casting point-in-polygon test against a single ring. */
function pointInRing(point: [number, number], ring: Ring): boolean {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** Point-in-polygon for a GeoJSON Polygon (first ring = outer, rest = holes). */
export function pointInPolygon(point: [number, number], polygon: Ring[]): boolean {
  if (polygon.length === 0) return false;
  if (!pointInRing(point, polygon[0])) return false;
  for (let i = 1; i < polygon.length; i++) {
    if (pointInRing(point, polygon[i])) return false; // inside a hole
  }
  return true;
}

export function pointInMultiPolygon(point: [number, number], polygons: Ring[][]): boolean {
  return polygons.some((polygon) => pointInPolygon(point, polygon));
}

/** Midpoint of a coordinate sequence, by path position (not geodesic) — fine for a coarse containment test. */
export function midpoint(coordinates: [number, number][]): [number, number] {
  const mid = coordinates[Math.floor(coordinates.length / 2)];
  return mid;
}
