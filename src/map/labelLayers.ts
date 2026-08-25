/**
 * Road-name and place-name label layers, shared between the street base
 * style (spec §3.1) and hybrid mode — street labels over satellite or
 * LiDAR (spec §3.4) — so the two don't drift out of sync with each other.
 */

/** Source id these layers expect: the OpenMapTiles vector source, wherever it's declared in the containing style. */
export const STREET_LABELS_SOURCE_ID = 'openmaptiles';

const FONT_REGULAR = ['Noto Sans Regular'];

/**
 * Returns the label layers, or an empty array when no glyph pack is
 * on-device — callers spread this into their `layers` array unconditionally.
 */
export function buildLabelLayers(glyphsUrl: string | null): object[] {
  if (!glyphsUrl) return [];

  return [
    {
      id: 'label-road',
      type: 'symbol',
      source: STREET_LABELS_SOURCE_ID,
      'source-layer': 'transportation_name',
      minzoom: 13,
      layout: {
        'symbol-placement': 'line',
        'text-field': ['get', 'name'],
        'text-font': FONT_REGULAR,
        'text-size': 11,
      },
      paint: {
        'text-color': '#5d5347',
        'text-halo-color': '#f4f1ea',
        'text-halo-width': 1.2,
      },
    },
    {
      id: 'label-place',
      type: 'symbol',
      source: STREET_LABELS_SOURCE_ID,
      'source-layer': 'place',
      filter: ['in', ['get', 'class'], ['literal', ['city', 'town', 'village', 'hamlet']]],
      layout: {
        'text-field': ['get', 'name'],
        'text-font': FONT_REGULAR,
        'text-size': ['match', ['get', 'class'], 'city', 16, 'town', 13, 11],
      },
      paint: {
        'text-color': '#3d3a34',
        'text-halo-color': '#f4f1ea',
        'text-halo-width': 1.5,
      },
    },
  ];
}
