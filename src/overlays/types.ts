/**
 * Structures overlay data model (spec §4, §6, §9).
 *
 * Produced by the desktop LiDAR nDSM pipeline: building footprints cross-
 * referenced against OSM/Microsoft footprint data. `documented: true` means
 * the footprint has a public-record match; `documented: false` means LiDAR
 * flagged an elevation signature with no match — an undocumented structure.
 */
export interface StructureProperties {
  documented: boolean;
  /**
   * Public name/label, e.g. from OSM `name` or `addr:housenumber`. Only ever
   * set for documented structures — undocumented ones are never labeled with
   * identifying info (spec §6).
   */
  name?: string;
}

export type StructureFeatureCollection = GeoJSON.FeatureCollection<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  StructureProperties
>;
