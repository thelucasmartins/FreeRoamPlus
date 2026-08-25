/**
 * Parcels overlay data model (spec §4, §9).
 *
 * Sourced from Sonoma County GIS "Parcels Public" (owner name already
 * excluded by the county's own CPRA privacy restriction — this schema has
 * no field for it, so there's nothing to accidentally leak). `acres` comes
 * straight from the county's own acreage field rather than being computed
 * client-side from geometry, which would need a proper geodesic area
 * calculation to be trustworthy over degree coordinates.
 *
 * `resourceExtraction` is precomputed by the desktop pipeline by cross-
 * referencing the county's Zoning and Land Use layer (timber preserve,
 * mineral resource, and similar codes) against parcel boundaries — same
 * "pipeline decides, app just renders" split used for structures'
 * `documented` flag.
 */
export interface ParcelProperties {
  apn: string;
  zoning: string;
  acres: number;
  resourceExtraction: boolean;
}

export type ParcelFeatureCollection = GeoJSON.FeatureCollection<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  ParcelProperties
>;
