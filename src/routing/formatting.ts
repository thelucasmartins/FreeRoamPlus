const METERS_PER_MILE = 1609.344;
const METERS_PER_FOOT = 0.3048;

/** Formats a distance in meters as feet, US convention — always feet, for figures (like elevation gain) that shouldn't switch to miles. */
export function formatFeet(meters: number): string {
  return `${Math.round(meters / METERS_PER_FOOT)} ft`;
}

/** Formats a distance in meters as feet (under ~0.1mi) or miles, US convention. */
export function formatDistance(meters: number): string {
  const miles = meters / METERS_PER_MILE;
  if (miles < 0.1) {
    return formatFeet(meters);
  }
  return `${miles.toFixed(1)} mi`;
}
