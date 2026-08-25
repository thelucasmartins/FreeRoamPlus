import type {
  ClassifiedRoadFeatureCollection,
  ClassifiedRoadProperties,
  RoadCategory,
  RoadFeatureCollection,
  RoadProperties,
} from './roadTypes';

/** Width bands from spec §15, in meters. */
const HIKING_TRAIL_MAX_WIDTH_M = 1;
const ATV_TRAIL_MAX_WIDTH_M = 3;

/**
 * Classifies a single road/path feature into one of the five spec render
 * categories.
 *
 * For LiDAR-detected paths with no OSM match, this is a direct application
 * of the spec §15 width bands: under 1m is a hiking trail (purple), 1–3m is
 * an ATV trail (pink), 3m/10ft+ is drivable and — lacking any OSM
 * classification by definition — falls under the spec §5 red bucket
 * ("unclassified roads with no public data").
 *
 * For OSM-tagged roads, this applies a first-pass rule for the spec §5
 * green/yellow/red split: private or unresolvable access is red; public
 * access inside national forest/protected land is yellow (protected-land
 * status takes priority over a private tag, since restricted-access rules
 * there are the more operationally relevant fact for a rider); otherwise
 * green. Spec §10 flags that OSM tagging doesn't cleanly map to
 * public/government/protected-land — this rule is a reasonable default to
 * unblock rendering, not a final answer; refine it once real OSM tag
 * coverage for Sonoma County has been reviewed.
 */
export function classifyRoad(properties: RoadProperties): RoadCategory {
  if (properties.source === 'lidar') {
    const { widthMeters } = properties;
    if (widthMeters < HIKING_TRAIL_MAX_WIDTH_M) return 'purple';
    if (widthMeters < ATV_TRAIL_MAX_WIDTH_M) return 'pink';
    return 'red';
  }

  if (properties.access === 'private' || properties.access === 'unknown') return 'red';
  if (properties.protectedLand) return 'yellow';
  return 'green';
}

function classifiedProperties(properties: RoadProperties): ClassifiedRoadProperties {
  const category = classifyRoad(properties);
  const name = properties.source === 'osm' ? properties.name : undefined;
  return name ? { category, name } : { category };
}

/** Applies classifyRoad across a whole collection, for feeding the map layer. */
export function classifyRoads(
  collection: RoadFeatureCollection,
): ClassifiedRoadFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: collection.features.map((feature) => ({
      ...feature,
      properties: classifiedProperties(feature.properties),
    })),
  };
}
