import {
  GeoJSONSource,
  Layer,
  type FilterSpecification,
} from '@maplibre/maplibre-react-native';
import type { ExpressionSpecification } from '@maplibre/maplibre-gl-style-spec';

import type { ClassifiedRoadFeatureCollection } from '../overlays/roadTypes';
import { GLYPH_FONTSTACK } from '../config';

interface RoadsOverlayProps {
  data: ClassifiedRoadFeatureCollection;
  /** file:// glyph template; the road-name label layer is omitted entirely when absent. */
  glyphsUrl: string | null;
}

const SOURCE_ID = 'roads-source';
// Derived from GLYPH_FONTSTACK rather than repeated as a literal: it is
// also the directory name in both the download URL and the on-device
// path (glyphs.ts), so a rename that touched only one of the two would
// leave MapLibre requesting a fontstack no pack was installed under —
// silently reproducing the missing-labels defect this all exists to fix.
const FONT_REGULAR = [GLYPH_FONTSTACK];

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
 * Any category with a `name` gets labeled — including red (private/
 * unclassified). Confirmed reading of spec §6/§3.1: same as the base
 * street layer (labelLayers.ts), a road's *name* isn't the owner-identity
 * information the spec is protecting (that's excluded at the schema level
 * — see roadTypes.ts and parcelTypes.ts), so this matches how Google Maps
 * itself labels named private roads and trails. Purple/pink trails never
 * carry a `name` under the current schema (LiDAR-sourced, spec §15, no
 * `name` field on LidarRoadProperties) so this filter has no effect on
 * them today, but doesn't artificially exclude them either if that
 * changes.
 */
const NAMED_FILTER: FilterSpecification = ['has', 'name'];

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
 * Any road/trail with a `name` is labeled, regardless of category —
 * consistent with the base street layer and with how Google Maps itself
 * labels named private roads and trails (spec §3.1/§6; see the confirmed
 * reasoning at NAMED_FILTER above).
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
          id="roads-name-label"
          type="symbol"
          source={SOURCE_ID}
          filter={NAMED_FILTER}
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
