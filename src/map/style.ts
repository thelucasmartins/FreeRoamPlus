/**
 * MapLibre style for the offline street basemap.
 *
 * Expects vector tiles in the OpenMapTiles schema (the Planetiler default —
 * see docs/DATA.md), read from a local MBTiles database via mbtiles://.
 *
 * This is the neutral "street map" base layer (spec §3.1). The green/yellow/
 * red road-classification coloring from spec §5, and the purple/pink hiking-
 * and ATV-trail width bands from spec §15, are a separate overlay coming in
 * build-order step 3 — they do not belong in this base style.
 */

import type { StyleSpecification } from '@maplibre/maplibre-react-native';

import { buildLabelLayers, STREET_LABELS_SOURCE_ID } from './labelLayers';

interface OfflineStyleOptions {
  /** mbtiles:// URL of the on-device tile database. */
  mbtilesUrl: string;
  /**
   * file:// glyph URL template ("…/{fontstack}/{range}.pbf") if a font pack
   * is on-device. When null, all text layers are omitted — the map still
   * renders, just unlabeled.
   */
  glyphsUrl: string | null;
}

const SOURCE = STREET_LABELS_SOURCE_ID;

export function buildOfflineStyle({
  mbtilesUrl,
  glyphsUrl,
}: OfflineStyleOptions): StyleSpecification {
  const layers: object[] = [
    {
      id: 'background',
      type: 'background',
      paint: { 'background-color': '#f4f1ea' },
    },
    {
      id: 'landcover-wood',
      type: 'fill',
      source: SOURCE,
      'source-layer': 'landcover',
      filter: ['in', ['get', 'class'], ['literal', ['wood', 'forest']]],
      paint: { 'fill-color': '#d5e3c8', 'fill-opacity': 0.7 },
    },
    {
      id: 'landcover-grass',
      type: 'fill',
      source: SOURCE,
      'source-layer': 'landcover',
      filter: ['in', ['get', 'class'], ['literal', ['grass', 'farmland']]],
      paint: { 'fill-color': '#e4ecd7', 'fill-opacity': 0.6 },
    },
    {
      id: 'park',
      type: 'fill',
      source: SOURCE,
      'source-layer': 'park',
      paint: { 'fill-color': '#cadfb0', 'fill-opacity': 0.6 },
    },
    {
      id: 'water',
      type: 'fill',
      source: SOURCE,
      'source-layer': 'water',
      paint: { 'fill-color': '#a6c4e0' },
    },
    {
      id: 'waterway',
      type: 'line',
      source: SOURCE,
      'source-layer': 'waterway',
      paint: {
        'line-color': '#a6c4e0',
        'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.5, 14, 2],
      },
    },
    {
      id: 'building',
      type: 'fill',
      source: SOURCE,
      'source-layer': 'building',
      minzoom: 13,
      paint: { 'fill-color': '#d9d0c9', 'fill-outline-color': '#c5b9af' },
    },
    // Unpaved tracks and trails — first-class citizens in an off-road app.
    {
      id: 'road-track-path',
      type: 'line',
      source: SOURCE,
      'source-layer': 'transportation',
      filter: ['in', ['get', 'class'], ['literal', ['track', 'path']]],
      paint: {
        'line-color': '#8a7a66',
        'line-dasharray': [3, 2],
        'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.6, 16, 2.5],
      },
    },
    {
      id: 'road-minor',
      type: 'line',
      source: SOURCE,
      'source-layer': 'transportation',
      filter: ['in', ['get', 'class'], ['literal', ['minor', 'service']]],
      paint: {
        'line-color': '#ffffff',
        'line-width': ['interpolate', ['linear'], ['zoom'], 11, 0.8, 16, 5],
      },
    },
    {
      id: 'road-secondary-casing',
      type: 'line',
      source: SOURCE,
      'source-layer': 'transportation',
      filter: ['in', ['get', 'class'], ['literal', ['secondary', 'tertiary']]],
      paint: {
        'line-color': '#c9bfae',
        'line-gap-width': ['interpolate', ['linear'], ['zoom'], 9, 1, 16, 6],
        'line-width': 1,
      },
    },
    {
      id: 'road-secondary',
      type: 'line',
      source: SOURCE,
      'source-layer': 'transportation',
      filter: ['in', ['get', 'class'], ['literal', ['secondary', 'tertiary']]],
      paint: {
        'line-color': '#fdf6e0',
        'line-width': ['interpolate', ['linear'], ['zoom'], 9, 1, 16, 6],
      },
    },
    {
      id: 'road-major-casing',
      type: 'line',
      source: SOURCE,
      'source-layer': 'transportation',
      filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary']]],
      paint: {
        'line-color': '#c9a87c',
        'line-gap-width': ['interpolate', ['linear'], ['zoom'], 7, 1.2, 16, 8],
        'line-width': 1,
      },
    },
    {
      id: 'road-major',
      type: 'line',
      source: SOURCE,
      'source-layer': 'transportation',
      filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary']]],
      paint: {
        'line-color': '#fbe3a5',
        'line-width': ['interpolate', ['linear'], ['zoom'], 7, 1.2, 16, 8],
      },
    },
    {
      id: 'boundary-county',
      type: 'line',
      source: SOURCE,
      'source-layer': 'boundary',
      filter: ['<=', ['get', 'admin_level'], 6],
      paint: {
        'line-color': '#9a8fa5',
        'line-dasharray': [4, 3],
        'line-width': 1,
      },
    },
  ];

  layers.push(...buildLabelLayers(glyphsUrl));

  return {
    version: 8,
    name: 'FreeRoam+ Offline Streets',
    ...(glyphsUrl ? { glyphs: glyphsUrl } : {}),
    sources: {
      [SOURCE]: {
        type: 'vector',
        url: mbtilesUrl,
      },
    },
    layers,
  } as StyleSpecification;
}
