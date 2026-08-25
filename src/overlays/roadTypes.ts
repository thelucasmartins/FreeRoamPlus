/**
 * Roads/trails overlay data model (spec §5, §9, §15).
 *
 * Two kinds of raw input, matching how the desktop pipeline produces them:
 *
 * - OSM-tagged roads: cross-referenced against public/private ownership and
 *   protected-land boundaries (nDSM pipeline step 3, spec §9).
 * - LiDAR-detected paths with no OSM match: carry only a measured cleared
 *   width, which the width bands in spec §15 classify into a trail or road.
 *
 * `classifyRoad` (roadClassification.ts) turns either shape into one of the
 * five render categories.
 */

export interface OsmRoadProperties {
  source: 'osm';
  /**
   * 'public' = government-maintained public road. 'private' = private road.
   * 'unknown' = present in OSM but without a resolvable access tag —
   * spec §5 buckets this with private under "no public data".
   */
  access: 'public' | 'private' | 'unknown';
  /** True when the road falls within national forest / protected land. */
  protectedLand: boolean;
  /** Public/known roads only — never set for private/unclassified ones (spec §6). */
  name?: string;
}

export interface LidarRoadProperties {
  source: 'lidar';
  /** Cleared-path width in meters, as measured from the LiDAR nDSM signal. */
  widthMeters: number;
}

export type RoadProperties = OsmRoadProperties | LidarRoadProperties;

export type RoadFeatureCollection = GeoJSON.FeatureCollection<GeoJSON.LineString, RoadProperties>;

/** The five on-map render categories from spec §5 and §15. */
export type RoadCategory = 'green' | 'yellow' | 'red' | 'purple' | 'pink';

export interface ClassifiedRoadProperties {
  category: RoadCategory;
  name?: string;
}

export type ClassifiedRoadFeatureCollection = GeoJSON.FeatureCollection<
  GeoJSON.LineString,
  ClassifiedRoadProperties
>;
