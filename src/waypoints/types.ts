/**
 * Waypoint (spec §11): a user-dropped pin marking something of interest
 * (structure found, road condition, campsite, etc.), with an optional
 * note. Saved to on-device storage only — never synced, never sent
 * anywhere (spec §11: "not synced to cloud automatically").
 */
export interface Waypoint {
  id: string;
  coordinate: [number, number];
  /** Empty string when no note was added — not optional, so callers don't need an extra null check. */
  note: string;
  createdAt: number;
}
