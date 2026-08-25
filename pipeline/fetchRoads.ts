/**
 * Real roads pipeline (spec §5, §9, §15) — OSM-sourced portion only.
 *
 * IMPORTANT GAP, flagged clearly rather than silently omitted: this
 * produces only the `source: "osm"` half of roads.geojson (real Sonoma
 * County road geometry + real access/protected-land classification). The
 * `source: "lidar"` half — width-based hiking/ATV trail detection from
 * LiDAR cleared-path analysis (spec §15) — needs point-cloud processing
 * (PDAL or similar) this environment doesn't have. No purple/pink trail
 * data is produced by this script.
 *
 * `protectedLand` is a real spatial join: Overpass-fetched protected-area
 * polygons (national forests, state parks, nature reserves), point-in-
 * polygon tested against each road's midpoint (pipeline/spatial.ts) — not
 * a tag lookup, since individual OSM road ways don't carry a redundant
 * "inside protected land" tag themselves. Only simple closed WAYS are
 * used for protected areas, not multipolygon RELATIONS — some larger
 * protected areas mapped as relations in OSM won't be captured. Flagged,
 * not silently dropped.
 *
 * `access` classification (spec §10's open question — this is a first-pass
 * rule, not a final answer): explicit access=private/no -> private;
 * standard vehicular highway classes with no restrictive access tag ->
 * public; anything else (tracks/paths/unclassified with no clear tag) ->
 * unknown. Refine against real reviewed tag coverage later.
 *
 * Run: npx tsx pipeline/fetchRoads.ts
 * Output: data/overlays/roads.geojson
 */
import { mkdirSync, writeFileSync } from 'fs';
import { REGION_BOUNDS } from '../src/config';
import type { OsmRoadProperties, RoadFeatureCollection } from '../src/overlays/roadTypes';
import { queryOverpass, toCoordinates, type OverpassElement } from './overpass';
import { midpoint, pointInMultiPolygon, type Ring } from './spatial';

const OUT_PATH = 'data/overlays/roads.geojson';

const PUBLIC_HIGHWAY_CLASSES = new Set([
  'motorway', 'trunk', 'primary', 'secondary', 'tertiary',
  'unclassified', 'residential', 'living_street', 'service',
]);

function bboxString(): string {
  const { sw, ne } = REGION_BOUNDS;
  // Overpass bbox order is south,west,north,east.
  return `${sw[1]},${sw[0]},${ne[1]},${ne[0]}`;
}

async function fetchProtectedAreaPolygons(): Promise<Ring[][]> {
  const query = `
    [out:json][timeout:180];
    (
      way["boundary"="protected_area"](${bboxString()});
      way["leisure"="nature_reserve"](${bboxString()});
      way["boundary"="national_park"](${bboxString()});
    );
    out geom;
  `;
  const elements = await queryOverpass(query);
  const polygons: Ring[][] = [];
  for (const el of elements) {
    if (el.type !== 'way' || !el.geometry || el.geometry.length < 4) continue;
    polygons.push([toCoordinates(el.geometry)]);
  }
  return polygons;
}

function classifyAccess(tags: Record<string, string>): OsmRoadProperties['access'] {
  const access = tags.access;
  if (access === 'private' || access === 'no') return 'private';
  const highway = tags.highway;
  if (highway && PUBLIC_HIGHWAY_CLASSES.has(highway) && access !== 'permissive' && access !== 'customers') {
    return 'public';
  }
  return 'unknown';
}

async function fetchRoadWays(): Promise<OverpassElement[]> {
  const query = `
    [out:json][timeout:180];
    way["highway"](${bboxString()});
    out geom;
  `;
  return queryOverpass(query);
}

async function main() {
  console.log('Fetching protected-area polygons...');
  const protectedPolygons = await fetchProtectedAreaPolygons();
  console.log(`  ${protectedPolygons.length} protected-area ways`);

  console.log('Fetching highway ways for the whole county bbox (this can take a while)...');
  const ways = await fetchRoadWays();
  console.log(`  ${ways.length} highway ways`);

  const features: RoadFeatureCollection['features'] = [];
  let protectedCount = 0;

  for (const way of ways) {
    if (!way.geometry || way.geometry.length < 2 || !way.tags) continue;
    const coordinates = toCoordinates(way.geometry);
    const isProtected = pointInMultiPolygon(midpoint(coordinates), protectedPolygons);
    if (isProtected) protectedCount++;

    const properties: OsmRoadProperties = {
      source: 'osm',
      access: classifyAccess(way.tags),
      protectedLand: isProtected,
      ...(way.tags.name ? { name: way.tags.name } : {}),
    };

    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates },
      properties,
    });
  }

  const collection: RoadFeatureCollection = { type: 'FeatureCollection', features };

  mkdirSync('data/overlays', { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(collection));

  const named = features.filter((f) => f.properties.source === 'osm' && f.properties.name).length;
  console.log(`Wrote ${OUT_PATH}: ${features.length} roads (${protectedCount} in protected land, ${named} named)`);
  console.log('NOTE: LiDAR-detected trail bands (purple/pink) not included — needs point-cloud processing this environment lacks.');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
