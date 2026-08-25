import {
  GeoJSONSource,
  Layer,
  type FilterSpecification,
} from '@maplibre/maplibre-react-native';

import type { StructureFeatureCollection } from '../overlays/types';

interface StructuresOverlayProps {
  data: StructureFeatureCollection;
  /** file:// glyph template; label layer is omitted entirely when absent. */
  glyphsUrl: string | null;
}

const SOURCE_ID = 'structures-source';
const FONT_REGULAR = ['Noto Sans Regular'];

const DOCUMENTED_FILTER: FilterSpecification = ['==', ['get', 'documented'], true];
const UNDOCUMENTED_FILTER: FilterSpecification = ['==', ['get', 'documented'], false];
const DOCUMENTED_NAMED_FILTER: FilterSpecification = [
  'all',
  DOCUMENTED_FILTER,
  ['has', 'name'],
];

/**
 * Structures overlay (spec §4, §6): known/documented building footprints in
 * neutral blue, LiDAR-flagged undocumented ones in alert red with a bold
 * dashed outline so they visually stand out. Only documented structures with
 * a `name` are labeled — undocumented ones never carry identifying info.
 */
export function StructuresOverlay({ data, glyphsUrl }: StructuresOverlayProps) {
  return (
    <GeoJSONSource id={SOURCE_ID} data={data}>
      <Layer
        id="structures-documented-fill"
        type="fill"
        source={SOURCE_ID}
        filter={DOCUMENTED_FILTER}
        minzoom={11}
        paint={{
          'fill-color': '#3d6b9c',
          'fill-opacity': 0.35,
          'fill-outline-color': '#2c4f73',
        }}
      />
      <Layer
        id="structures-undocumented-fill"
        type="fill"
        source={SOURCE_ID}
        filter={UNDOCUMENTED_FILTER}
        minzoom={11}
        paint={{
          'fill-color': '#c1443a',
          'fill-opacity': 0.45,
        }}
      />
      <Layer
        id="structures-undocumented-outline"
        type="line"
        source={SOURCE_ID}
        filter={UNDOCUMENTED_FILTER}
        minzoom={11}
        paint={{
          'line-color': '#8a1f17',
          'line-width': 2,
          'line-dasharray': [2, 1.5],
        }}
      />
      {glyphsUrl && (
        <Layer
          id="structures-documented-label"
          type="symbol"
          source={SOURCE_ID}
          filter={DOCUMENTED_NAMED_FILTER}
          minzoom={14}
          layout={{
            'text-field': ['get', 'name'],
            'text-font': FONT_REGULAR,
            'text-size': 11,
          }}
          paint={{
            'text-color': '#1f3b57',
            'text-halo-color': '#ffffff',
            'text-halo-width': 1.2,
          }}
        />
      )}
    </GeoJSONSource>
  );
}
