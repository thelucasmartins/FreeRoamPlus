/**
 * Road-name and place-name label layers, shared between the street base
 * style (spec §3.1) and hybrid mode — street labels over satellite or
 * LiDAR (spec §3.4) — so the two don't drift out of sync with each other.
 *
 * Judgment call worth flagging explicitly: this labels straight from the
 * raw OpenMapTiles `transportation_name`/`place` vector data, unfiltered by
 * this app's own private/public road classification (roadClassification.ts)
 * — a private road that happens to carry an OSM `name` tag (common in
 * reality: many gated/private roads and driveways are named in OSM) will
 * still show its name here. That's read as consistent with spec §3.1's own
 * framing ("standard vector/road map view, labeled like Google Maps ...
 * using OpenStreetMap data") — real Google Maps/OSM renderers label named
 * private roads too, since a road *name* isn't the owner-identity
 * information spec §4/§6 are actually protecting (see the parcels schema,
 * which excludes owner name entirely but keeps APN/zoning/acreage as
 * public record). The roads *overlay* (RoadsOverlay.tsx) is the one place
 * that applies this app's own red/private classification to labeling, and
 * it deliberately never labels a red-category road regardless of what OSM
 * calls it. If the neutral base-layer behavior here should instead
 * suppress names on roads this app has classified as private, that's a
 * one-line change: filter buildLabelLayers' `label-road` layer by
 * cross-referencing roads-source, the same way RoadsOverlay's own label
 * layer already does — flag it if that's the intended reading.
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
