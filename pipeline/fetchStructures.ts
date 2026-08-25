/**
 * Real structures pipeline (spec §4, §9) — documented portion only.
 *
 * IMPORTANT GAP, flagged clearly: this produces only `documented: true`
 * features, from real OSM building footprints (spec §4's "Known/publicly
 * documented buildings"). The `documented: false` half — LiDAR nDSM
 * elevation-signal detection of buildings with NO public-record match —
 * needs LiDAR point-cloud processing and Lucas's existing structure-
 * detection tool (spec §1, §9: "reuses existing structure-visibility tool
 * pipeline"), neither of which this environment has access to. No
 * undocumented structures are produced by this script.
 *
 * Buildings vastly outnumber roads for the same area (Sonoma County has
 * several hundred thousand mapped building footprints), enough that a
 * single whole-county Overpass query 504-timed-out. Tiled into a grid of
 * sub-region queries instead — same total data, just fetched in chunks
 * Overpass's public instance can actually complete.
 *
 * Run: npx tsx pipeline/fetchStructures.ts
 * Output: data/overlays/structures.geojson
 */
import { mkdirSync, writeFileSync } from 'fs';
import { REGION_BOUNDS } from '../src/config';
import type { StructureFeatureCollection, StructureProperties } from '../src/overlays/types';
import { queryOverpass, toCoordinates } from './overpass';

const OUT_PATH = 'data/overlays/structures.geojson';
const GRID_COLS = 4;
const GRID_ROWS = 4;

function tileBounds(): { south: number; west: number; north: number; east: number }[] {
  const { sw, ne } = REGION_BOUNDS;
  const [west, south] = sw;
  const [east, north] = ne;
  const tiles: { south: number; west: number; north: number; east: number }[] = [];
  for (let row = 0; row < GRID_ROWS; row++) {
    const tileSouth = south + ((north - south) * row) / GRID_ROWS;
    const tileNorth = south + ((north - south) * (row + 1)) / GRID_ROWS;
    for (let col = 0; col < GRID_COLS; col++) {
      const tileWest = west + ((east - west) * col) / GRID_COLS;
      const tileEast = west + ((east - west) * (col + 1)) / GRID_COLS;
      tiles.push({ south: tileSouth, west: tileWest, north: tileNorth, east: tileEast });
    }
  }
  return tiles;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const tiles = tileBounds();
  const features: StructureFeatureCollection['features'] = [];

  for (const [i, tile] of tiles.entries()) {
    if (i > 0) await sleep(3000); // be a considerate citizen of a shared public API
    const bbox = `${tile.south},${tile.west},${tile.north},${tile.east}`;
    const query = `[out:json][timeout:180];way["building"](${bbox});out geom;`;
    console.log(`Tile ${i + 1}/${tiles.length}: fetching buildings...`);
    const ways = await queryOverpass(query);
    console.log(`  ${ways.length} building ways`);

    for (const way of ways) {
      if (!way.geometry || way.geometry.length < 4) continue;
      const coordinates = toCoordinates(way.geometry);
      const tags = way.tags ?? {};
      const name =
        tags.name ||
        (tags['addr:housenumber'] && tags['addr:street']
          ? `${tags['addr:housenumber']} ${tags['addr:street']}`
          : undefined);

      const properties: StructureProperties = { documented: true, ...(name ? { name } : {}) };
      features.push({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [coordinates] },
        properties,
      });
    }
  }

  const collection: StructureFeatureCollection = { type: 'FeatureCollection', features };

  mkdirSync('data/overlays', { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(collection));

  const named = features.filter((f) => f.properties.name).length;
  console.log(`Wrote ${OUT_PATH}: ${features.length} documented structures (${named} named)`);
  console.log('NOTE: undocumented (LiDAR-flagged) structures not included -- needs LiDAR point-cloud processing and the existing structure-detection tool this environment has no access to.');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
