import { SONOMA_CENTER } from '../config';
import type { RoadFeatureCollection } from './roadTypes';

/**
 * Placeholder roads/trails near the default map center, covering all five
 * spec categories, for exercising the overlay before the desktop pipeline
 * (spec §9) has produced tiles/overlays/roads.geojson on-device. None of
 * these correspond to real roads — see roadsStore.ts.
 */

const [centerLng, centerLat] = SONOMA_CENTER;

function line(...offsets: Array<[number, number]>): GeoJSON.LineString {
  return {
    type: 'LineString',
    coordinates: offsets.map(([dLng, dLat]) => [centerLng + dLng, centerLat + dLat]),
  };
}

export const SAMPLE_ROADS: RoadFeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      // Public, government-maintained — green.
      type: 'Feature',
      geometry: line([-0.01, -0.006], [-0.004, -0.004], [0.002, -0.005]),
      properties: { source: 'osm', access: 'public', protectedLand: false, name: 'Sample County Road' },
    },
    {
      // Public but inside national forest / protected land — yellow.
      type: 'Feature',
      geometry: line([-0.008, 0.007], [-0.003, 0.008], [0.002, 0.0075]),
      properties: { source: 'osm', access: 'public', protectedLand: true, name: 'Sample Forest Route' },
    },
    {
      // Private — red.
      type: 'Feature',
      geometry: line([0.003, 0.001], [0.007, 0.002], [0.01, 0.001]),
      properties: { source: 'osm', access: 'private', protectedLand: false },
    },
    {
      // LiDAR-detected, drivable width (4m), no OSM match — red (spec §5's
      // "unclassified roads with no public data").
      type: 'Feature',
      geometry: line([-0.002, -0.008], [0.001, -0.009], [0.005, -0.0085]),
      properties: { source: 'lidar', widthMeters: 4 },
    },
    {
      // LiDAR-detected, ATV width (2m) — pink.
      type: 'Feature',
      geometry: line([0.004, 0.004], [0.006, 0.005], [0.008, 0.0045]),
      properties: { source: 'lidar', widthMeters: 2 },
    },
    {
      // LiDAR-detected, hiking width (0.6m) — purple.
      type: 'Feature',
      geometry: line([-0.006, -0.001], [-0.004, 0.0005], [-0.0015, 0.0015]),
      properties: { source: 'lidar', widthMeters: 0.6 },
    },
  ],
};
