/**
 * Elevation/DEM data model (spec §13): "Sourced from the same LiDAR/DEM
 * data already being processed for the nDSM layer — no separate live data
 * needed, works offline."
 *
 * A coarse regular grid rather than raster tiles: this app only needs
 * elevation *values* at points along a route, not a rendered terrain
 * surface (that's the separate LiDAR hillshade base layer, spec §3.3) — a
 * lightweight JSON grid with bilinear interpolation is enough, and avoids
 * needing a raster/PNG decoder in the app.
 */
export interface ElevationGrid {
  /** [west, south, east, north] in WGS84 degrees. */
  bounds: [number, number, number, number];
  cols: number;
  rows: number;
  /**
   * Row-major, `elevationsMeters[row * cols + col]`. Row 0 is the south
   * edge of `bounds`, row `rows - 1` is the north edge; col 0 is west,
   * col `cols - 1` is east.
   */
  elevationsMeters: number[];
}

export interface ElevationProfilePoint {
  /** Cumulative distance from the start of the sampled path, in meters. */
  distanceMeters: number;
  elevationMeters: number;
}

export interface ElevationProfile {
  points: ElevationProfilePoint[];
  minElevationMeters: number;
  maxElevationMeters: number;
  /** Sum of positive elevation change across the path. */
  totalGainMeters: number;
  /** Sum of negative elevation change across the path (positive number). */
  totalLossMeters: number;
  /** Steepest single-segment grade along the path, as a percentage. */
  maxGradePercent: number;
}
