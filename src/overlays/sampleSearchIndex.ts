import { SONOMA_CENTER } from '../config';
import type { SearchIndex } from './searchTypes';

/**
 * Placeholder search index for exercising the search bar before the real
 * OSM-derived index (spec §16, spec §9) is on-device. The road/structure
 * entries deliberately reuse coordinates from sampleRoads.ts and
 * sampleStructures.ts so a search result actually points at the matching
 * feature already visible on the map — see searchStore.ts.
 */

const [centerLng, centerLat] = SONOMA_CENTER;

export const SAMPLE_SEARCH_INDEX: SearchIndex = [
  // Real, publicly known Sonoma County towns (place names are public
  // information — this isn't LiDAR/pipeline-derived data).
  { id: 'place:santa-rosa', name: 'Santa Rosa', kind: 'place', coordinate: [-122.7141, 38.4404] },
  { id: 'place:sebastopol', name: 'Sebastopol', kind: 'place', coordinate: [-122.8247, 38.4021] },
  { id: 'place:guerneville', name: 'Guerneville', kind: 'place', coordinate: [-122.993, 38.501] },
  { id: 'place:healdsburg', name: 'Healdsburg', kind: 'place', coordinate: [-122.8692, 38.6105] },
  { id: 'place:cazadero', name: 'Cazadero', kind: 'place', coordinate: [-123.2158, 38.5344] },

  // Matches sampleRoads.ts's public/protected-land named segments.
  {
    id: 'road:sample-county-road',
    name: 'Sample County Road',
    kind: 'road',
    coordinate: [centerLng - 0.01, centerLat - 0.006],
  },
  {
    id: 'road:sample-forest-route',
    name: 'Sample Forest Route',
    kind: 'road',
    coordinate: [centerLng + 0.002, centerLat - 0.005],
  },

  // Matches sampleStructures.ts's documented (named) structures.
  {
    id: 'poi:sample-barn',
    name: 'Sample Barn',
    kind: 'poi',
    coordinate: [centerLng - 0.006, centerLat + 0.004],
  },
  {
    id: 'poi:sample-ranch-house',
    name: 'Sample Ranch House',
    kind: 'poi',
    coordinate: [centerLng + 0.001, centerLat + 0.005],
  },
];
