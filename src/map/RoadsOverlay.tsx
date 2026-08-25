import {
  GeoJSONSource,
  Layer,
  type FilterSpecification,
} from '@maplibre/maplibre-react-native';
import type { ExpressionSpecification } from '@maplibre/maplibre-gl-style-spec';

import type { ClassifiedRoadFeatureCollection } from '../overlays/roadTypes';

interface RoadsOverlayProps {
  data: ClassifiedRoadFeatureCollection;
  /** file:// glyph template; the road-name label layer is omitted entirely when absent. */
  glyphsUrl: string | null;
}

const SOURCE_ID = 'roads-source';
const FONT_REGULAR = ['Noto Sans Regular'];

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
/**
 * Public/known roads only (green/yellow) — red (private/unclassified) is
 * deliberately excluded from labeling within this overlay, per spec §6:
 * "Private structures/roads are shown (colored/flagged) but not labeled
 * with identifying info." Purple/pink trails never carry a `name` to begin
 * with (LiDAR-sourced, spec §15), so they're excluded implicitly.
 */
const PUBLIC_NAMED_FILTER: FilterSpecification = [
  'all',
  ['in', ['get', 'category'], ['literal', ['green', 'yellow']]],
  ['has', 'name'],
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
 *
 * Public roads (green/yellow) with a `name` are labeled, matching how the
 * base street style labels named roads — spec §6. This is this overlay's
 * own label layer, independent of the base style's: it's driven by our
 * `category` classification rather than raw OSM data, so a private road
 * never gets labeled here even if OSM happens to have a name tag for it.
 */
export function RoadsOverlay({ data, glyphsUrl }: RoadsOverlayProps) {
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
      {glyphsUrl && (
        <Layer
          id="roads-public-label"
          type="symbol"
          source={SOURCE_ID}
          filter={PUBLIC_NAMED_FILTER}
          minzoom={13}
          layout={{
            'symbol-placement': 'line',
            'text-field': ['get', 'name'],
            'text-font': FONT_REGULAR,
            'text-size': 11,
          }}
          paint={{
            'text-color': '#5d5347',
            'text-halo-color': '#f4f1ea',
            'text-halo-width': 1.2,
          }}
        />
      )}
    </GeoJSONSource>
  );
}
