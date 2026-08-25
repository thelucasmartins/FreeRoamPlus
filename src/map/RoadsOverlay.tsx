import {
  GeoJSONSource,
  Layer,
  type FilterSpecification,
} from '@maplibre/maplibre-react-native';
import type { ExpressionSpecification } from '@maplibre/maplibre-gl-style-spec';

import type { ClassifiedRoadFeatureCollection } from '../overlays/roadTypes';

interface RoadsOverlayProps {
  data: ClassifiedRoadFeatureCollection;
}

const SOURCE_ID = 'roads-source';

const DRIVABLE_FILTER: FilterSpecification = [
  'in',
  ['get', 'category'],
  ['literal', ['green', 'yellow', 'red']],
];
const TRAIL_FILTER: FilterSpecification = [
  'in',
  ['get', 'category'],
  ['literal', ['purple', 'pink']],
];

/** Green/government, yellow/protected-land, red/private-or-unclassified (spec §5). */
const DRIVABLE_COLOR: ExpressionSpecification = [
  'match',
  ['get', 'category'],
  'green',
  '#3f9142',
  'yellow',
  '#e0a930',
  /* red */ '#c1443a',
];

/** Purple/hiking, pink/ATV (spec §15) — not part of the vehicle-routing network. */
const TRAIL_COLOR: ExpressionSpecification = [
  'match',
  ['get', 'category'],
  'purple',
  '#8b5fbf',
  /* pink */ '#e0559c',
];

/**
 * Roads/trails overlay (spec §5, §15): classified road lines in green/
 * yellow/red, plus LiDAR-detected trails too narrow to be drivable in
 * purple (hiking, <1m) and pink (ATV, 1–3m), rendered dashed to read as
 * distinct from the vehicle-routable road network. Classification itself
 * happens in roadClassification.ts before this component ever sees the
 * data — this just paints the `category` property already on each feature.
 */
export function RoadsOverlay({ data }: RoadsOverlayProps) {
  return (
    <GeoJSONSource id={SOURCE_ID} data={data}>
      <Layer
        id="roads-drivable"
        type="line"
        source={SOURCE_ID}
        filter={DRIVABLE_FILTER}
        minzoom={9}
        layout={{ 'line-cap': 'round', 'line-join': 'round' }}
        paint={{
          'line-color': DRIVABLE_COLOR,
          'line-width': ['interpolate', ['linear'], ['zoom'], 9, 1.5, 16, 6],
        }}
      />
      <Layer
        id="roads-trails"
        type="line"
        source={SOURCE_ID}
        filter={TRAIL_FILTER}
        minzoom={11}
        layout={{ 'line-cap': 'round', 'line-join': 'round' }}
        paint={{
          'line-color': TRAIL_COLOR,
          'line-width': ['interpolate', ['linear'], ['zoom'], 11, 1, 16, 2.5],
          'line-dasharray': [2, 1.5],
        }}
      />
    </GeoJSONSource>
  );
}
