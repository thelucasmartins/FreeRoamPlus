/**
 * Road-name and place-name label layers, shared between the street base
 * style (spec §3.1) and hybrid mode — street labels over satellite or
 * LiDAR (spec §3.4) — so the two don't drift out of sync with each other.
 *
 * Confirmed reading (spec §3.1/§6): labels straight from the raw
 * OpenMapTiles `transportation_name`/`place` vector data, unfiltered by
 * this app's own private/public road classification — a private road with
 * an OSM `name` tag still shows its name here, same as real Google Maps
 * does. A road/trail *name* isn't the owner-identity information spec
 * §4/§6 actually protect (that's excluded at the schema level entirely —
 * see parcelTypes.ts). RoadsOverlay.tsx's own label layer applies the same
 * any-category-with-a-name rule, so this base layer and the roads overlay
 * are consistent with each other.
 */

import { GLYPH_FONTSTACK } from '../config';

/** Source id these layers expect: the OpenMapTiles vector source, wherever it's declared in the containing style. */
export const STREET_LABELS_SOURCE_ID = 'openmaptiles';

// Derived from GLYPH_FONTSTACK rather than repeated as a literal: it is
// also the directory name in both the download URL and the on-device
// path (glyphs.ts), so a rename that touched only one of the two would
// leave MapLibre requesting a fontstack no pack was installed under —
// silently reproducing the missing-labels defect this all exists to fix.
const FONT_REGULAR = [GLYPH_FONTSTACK];

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
