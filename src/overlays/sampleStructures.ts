import { SONOMA_CENTER } from '../config';
import type { StructureFeatureCollection } from './types';

/**
 * Placeholder structures scattered near the default map center, for
 * exercising the overlay before the real desktop LiDAR/nDSM pipeline (spec
 * §9) has produced tiles/overlays/structures.geojson on-device. None of
 * these correspond to real buildings — swap in real pipeline output to
 * replace this file's role, see structuresStore.ts.
 */

const [centerLng, centerLat] = SONOMA_CENTER;

/** A small square footprint, `sizeDeg` wide, centered on the given offset from SONOMA_CENTER. */
function footprint(offsetLng: number, offsetLat: number, sizeDeg = 0.0003): GeoJSON.Polygon {
  const lng = centerLng + offsetLng;
  const lat = centerLat + offsetLat;
  const half = sizeDeg / 2;
  return {
    type: 'Polygon',
    coordinates: [
      [
        [lng - half, lat - half],
        [lng + half, lat - half],
        [lng + half, lat + half],
        [lng - half, lat + half],
        [lng - half, lat - half],
      ],
    ],
  };
}

export const SAMPLE_STRUCTURES: StructureFeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: footprint(-0.006, 0.004),
      properties: { documented: true, name: 'Sample Barn' },
    },
    {
      type: 'Feature',
      geometry: footprint(-0.003, 0.006),
      properties: { documented: true },
    },
    {
      type: 'Feature',
      geometry: footprint(0.001, 0.005),
      properties: { documented: true, name: 'Sample Ranch House' },
    },
    {
      type: 'Feature',
      geometry: footprint(0.004, 0.002),
      properties: { documented: true },
    },
    {
      type: 'Feature',
      geometry: footprint(0.002, -0.003),
      properties: { documented: true },
    },
    {
      type: 'Feature',
      geometry: footprint(-0.004, -0.002, 0.00025),
      properties: { documented: false },
    },
    {
      type: 'Feature',
      geometry: footprint(0.005, -0.005, 0.0004),
      properties: { documented: false },
    },
    {
      type: 'Feature',
      geometry: footprint(-0.001, 0.001, 0.0002),
      properties: { documented: false },
    },
  ],
};
