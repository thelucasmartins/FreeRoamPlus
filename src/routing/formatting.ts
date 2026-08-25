const METERS_PER_MILE = 1609.344;
const METERS_PER_FOOT = 0.3048;

/** Formats a distance in meters as feet (under ~0.1mi) or miles, US convention. */
export function formatDistance(meters: number): string {
  const miles = meters / METERS_PER_MILE;
  if (miles < 0.1) {
    const feet = Math.round(meters / METERS_PER_FOOT);
    return `${feet} ft`;
  }
  return `${miles.toFixed(1)} mi`;
}
