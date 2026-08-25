/** Geometry helpers for routing: distances, bearings, and segment projection. */

const EARTH_RADIUS_M = 6371000;

/** Great-circle distance in meters between two [lng, lat] points. */
export function haversineMeters(a: [number, number], b: [number, number]): number {
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const dPhi = ((lat2 - lat1) * Math.PI) / 180;
  const dLambda = ((lng2 - lng1) * Math.PI) / 180;
  const sinDPhi = Math.sin(dPhi / 2);
  const sinDLambda = Math.sin(dLambda / 2);
  const h = sinDPhi * sinDPhi + Math.cos(phi1) * Math.cos(phi2) * sinDLambda * sinDLambda;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial compass bearing in degrees (0-360, 0 = north) from `a` to `b`. */
export function bearingDegrees(a: [number, number], b: [number, number]): number {
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const dLambda = ((lng2 - lng1) * Math.PI) / 180;
  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  const theta = Math.atan2(y, x);
  return ((theta * 180) / Math.PI + 360) % 360;
}

const COMPASS_POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

/** Rounds a bearing to one of the 8 primary compass directions. */
export function compassLabel(bearing: number): string {
  return COMPASS_POINTS[Math.round(bearing / 45) % 8];
}

export interface SegmentProjection {
  point: [number, number];
  distanceMeters: number;
  /** 0 = at `a`, 1 = at `b`, clamped to the segment. */
  t: number;
}

/**
 * Nearest point on segment a-b to point p, using a local equirectangular
 * projection around `a`. Accurate for road-segment-scale distances (tens to
 * low thousands of meters); not meant for continental spans, which the
 * haversine-based callers here use instead.
 */
export function nearestPointOnSegment(
  p: [number, number],
  a: [number, number],
  b: [number, number],
): SegmentProjection {
  const latRad = (a[1] * Math.PI) / 180;
  const metersPerDegreeLng = 111320 * Math.cos(latRad);
  const metersPerDegreeLat = 110540;

  const toXY = (pt: [number, number]): [number, number] => [
    (pt[0] - a[0]) * metersPerDegreeLng,
    (pt[1] - a[1]) * metersPerDegreeLat,
  ];

  const [bx, by] = toXY(b);
  const [px, py] = toXY(p);

  const lenSq = bx * bx + by * by;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, (px * bx + py * by) / lenSq));

  const projX = t * bx;
  const projY = t * by;
  const dx = px - projX;
  const dy = py - projY;

  return {
    point: [a[0] + projX / metersPerDegreeLng, a[1] + projY / metersPerDegreeLat],
    distanceMeters: Math.sqrt(dx * dx + dy * dy),
    t,
  };
}
