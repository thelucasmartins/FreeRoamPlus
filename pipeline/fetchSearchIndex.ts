/**
 * Real search index pipeline (spec §16) — place/POI names from OSM, plus
 * named roads and structures merged in from this pipeline's own
 * roads.geojson/structures.geojson output (run fetchRoads.ts and
 * fetchStructures.ts first) — the same "reuse the same named features
 * already on the map" approach the bundled sample data used.
 *
 * Run: npx tsx pipeline/fetchRoads.ts && npx tsx pipeline/fetchStructures.ts && npx tsx pipeline/fetchSearchIndex.ts
 * Output: data/overlays/search-index.json
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { REGION_BOUNDS } from '../src/config';
import type { RoadFeatureCollection } from '../src/overlays/roadTypes';
import type { StructureFeatureCollection } from '../src/overlays/types';
import type { SearchEntry, SearchEntryKind, SearchIndex } from '../src/overlays/searchTypes';
import { queryOverpass } from './overpass';

const OUT_PATH = 'data/overlays/search-index.json';
const ROADS_PATH = 'data/overlays/roads.geojson';
const STRUCTURES_PATH = 'data/overlays/structures.geojson';

function bboxString(): string {
  const { sw, ne } = REGION_BOUNDS;
  return `${sw[1]},${sw[0]},${ne[1]},${ne[0]}`;
}

function centerOf(el: { lat?: number; lon?: number; geometry?: { lat: number; lon: number }[] }): [number, number] | null {
  if (el.lat !== undefined && el.lon !== undefined) return [el.lon, el.lat];
  if (el.geometry && el.geometry.length > 0) {
    const mid = el.geometry[Math.floor(el.geometry.length / 2)];
    return [mid.lon, mid.lat];
  }
  return null;
}

async function fetchPlacesAndPois(): Promise<SearchEntry[]> {
  const query = `
    [out:json][timeout:180];
    (
      node["place"~"^(city|town|village|hamlet)$"](${bboxString()});
      node["tourism"](${bboxString()});
      node["amenity"~"^(campground|hospital|fire_station|police)$"](${bboxString()});
      node["leisure"="park"](${bboxString()});
      way["leisure"="park"](${bboxString()});
    );
    out center;
  `;
  console.log('Fetching places/POIs for the whole county bbox...');
  const elements = await queryOverpass(query);
  console.log(`  ${elements.length} elements`);

  const entries: SearchEntry[] = [];
  const seenIds = new Set<string>();
  for (const el of elements) {
    const name = el.tags?.name;
    if (!name) continue;
    const coordinate = centerOf(el as { lat?: number; lon?: number; geometry?: { lat: number; lon: number }[] });
    if (!coordinate) continue;
    const id = `${el.type}:${el.id}`;
    if (seenIds.has(id)) continue;
    seenIds.add(id);
    const kind: SearchEntryKind = el.tags?.place ? 'place' : 'poi';
    entries.push({ id, name, kind, coordinate });
  }
  return entries;
}

function loadNamedRoads(): SearchEntry[] {
  if (!existsSync(ROADS_PATH)) {
    console.log(`  ${ROADS_PATH} not found -- run fetchRoads.ts first for named roads. Skipping.`);
    return [];
  }
  const roads = JSON.parse(readFileSync(ROADS_PATH, 'utf8')) as RoadFeatureCollection;
  const entries: SearchEntry[] = [];
  let index = 0;
  for (const f of roads.features) {
    if (f.properties.source !== 'osm' || !f.properties.name) continue;
    const coords = f.geometry.coordinates;
    const [lng, lat] = coords[Math.floor(coords.length / 2)];
    entries.push({ id: `road:${index++}`, name: f.properties.name, kind: 'road', coordinate: [lng, lat] });
  }
  return entries;
}

function loadNamedStructures(): SearchEntry[] {
  if (!existsSync(STRUCTURES_PATH)) {
    console.log(`  ${STRUCTURES_PATH} not found -- run fetchStructures.ts first for named structures. Skipping.`);
    return [];
  }
  const structures = JSON.parse(readFileSync(STRUCTURES_PATH, 'utf8')) as StructureFeatureCollection;
  const entries: SearchEntry[] = [];
  let index = 0;
  for (const f of structures.features) {
    if (!f.properties.name) continue;
    const ring = f.geometry.type === 'Polygon' ? f.geometry.coordinates[0] : f.geometry.coordinates[0][0];
    const centroid = ring
      .slice(0, -1)
      .reduce<[number, number]>((acc, [lng, lat]) => [acc[0] + lng, acc[1] + lat], [0, 0])
      .map((sum) => sum / (ring.length - 1)) as [number, number];
    entries.push({ id: `poi:structure:${index++}`, name: f.properties.name, kind: 'poi', coordinate: centroid });
  }
  return entries;
}

async function main() {
  const placesAndPois = await fetchPlacesAndPois();
  const namedRoads = loadNamedRoads();
  const namedStructures = loadNamedStructures();

  const index: SearchIndex = [...placesAndPois, ...namedRoads, ...namedStructures];

  mkdirSync('data/overlays', { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(index));
  console.log(
    `Wrote ${OUT_PATH}: ${index.length} entries (${placesAndPois.length} places/POIs, ${namedRoads.length} named roads, ${namedStructures.length} named structures)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
