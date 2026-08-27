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

/**
 * Stitches open way segments into closed rings — what an OSM multipolygon
 * relation's members need before they're usable as polygons (each member
 * way is an arbitrary fragment of the boundary; consecutive fragments
 * share an endpoint node, possibly with opposite orientation).
 *
 * Endpoint matching is by exact coordinate value: fragments of one OSM
 * relation share literal nodes, so their serialized coordinates are
 * bit-identical — no tolerance needed. A fragment chain that never closes
 * (a broken relation in OSM) is dropped rather than emitted as a bogus
 * open "ring"; callers count what came back vs. went in if they want to
 * report that.
 */
export function stitchSegmentsIntoRings(segments: Ring[]): Ring[] {
  const remaining = segments.filter((s) => s.length >= 2).map((s) => [...s]);
  const rings: Ring[] = [];

  const key = (p: [number, number]) => `${p[0]},${p[1]}`;

  while (remaining.length > 0) {
    const ring = remaining.shift() as Ring;

    let extended = true;
    while (extended && key(ring[0]) !== key(ring[ring.length - 1])) {
      extended = false;
      const tail = key(ring[ring.length - 1]);
      for (let i = 0; i < remaining.length; i++) {
        const seg = remaining[i];
        if (key(seg[0]) === tail) {
          ring.push(...seg.slice(1));
        } else if (key(seg[seg.length - 1]) === tail) {
          ring.push(...seg.slice(0, -1).reverse());
        } else {
          continue;
        }
        remaining.splice(i, 1);
        extended = true;
        break;
      }
    }

    if (ring.length >= 4 && key(ring[0]) === key(ring[ring.length - 1])) {
      rings.push(ring);
    }
  }

  return rings;
}
