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
 * For OSM-tagged roads, this applies the confirmed spec §5 green/yellow/red
 * split, in priority order: private (or unresolvable access) is red; failing
 * that, national forest/protected land is yellow; otherwise green. Private
 * beats protected-land beats public — restricted-access rules on private
 * land are the more operationally relevant fact for a rider than the
 * protected-land designation. This priority order is settled.
 *
 * What's still open (spec §10) is upstream of this function: which raw OSM
 * tags actually populate `access`/`protectedLand` for a given Sonoma County
 * road. That mapping is a pipeline concern (see docs/DATA.md) — once it's
 * resolved, this function's inputs get more accurate without this function
 * itself needing to change.
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
