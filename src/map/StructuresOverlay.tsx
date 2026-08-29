import {
  GeoJSONSource,
  Layer,
  VectorSource,
  type FilterSpecification,
} from '@maplibre/maplibre-react-native';

import type { OverlaySource } from '../overlays/overlaySource';
import type { StructureFeatureCollection } from '../overlays/types';
import { GLYPH_FONTSTACK } from '../config';

interface StructuresOverlayProps {
  source: OverlaySource<StructureFeatureCollection>;
  /** file:// glyph template; label layer is omitted entirely when absent. */
  glyphsUrl: string | null;
}

const SOURCE_ID = 'structures-source';
// Derived from GLYPH_FONTSTACK rather than repeated as a literal: it is
// also the directory name in both the download URL and the on-device
// path (glyphs.ts), so a rename that touched only one of the two would
// leave MapLibre requesting a fontstack no pack was installed under —
// silently reproducing the missing-labels defect this all exists to fix.
const FONT_REGULAR = [GLYPH_FONTSTACK];

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
export function StructuresOverlay({ source, glyphsUrl }: StructuresOverlayProps) {
  // Vector-tile layers must name the layer inside the tile; GeoJSON layers
  // must not. Note the key is the hyphenated `source-layer` from the style
  // spec — the camelCase form only exists on a deprecated prop path and
  // silently won't apply here.
  const sourceLayerProp: { 'source-layer'?: string } =
    source.mode === 'tiles' ? { 'source-layer': source.sourceLayer } : {};

  const layers = (
    <>
      <Layer
        id="structures-documented-fill"
        type="fill"
        source={SOURCE_ID}
        {...sourceLayerProp}
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
        {...sourceLayerProp}
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
        {...sourceLayerProp}
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
          {...sourceLayerProp}
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
    </>
  );

  // Same layers either way — only the source differs. Vector tiles stream by
  // viewport (no parse); GeoJSON holds the whole collection in memory, which
  // is fine for the bundled sample but is exactly what the tiles path exists
  // to avoid for the real ~102MB dataset.
  if (source.mode === 'tiles') {
    return (
      <VectorSource id={SOURCE_ID} url={source.tileUrl}>
        {layers}
      </VectorSource>
    );
  }

  return (
    <GeoJSONSource id={SOURCE_ID} data={source.data}>
      {layers}
    </GeoJSONSource>
  );
}
