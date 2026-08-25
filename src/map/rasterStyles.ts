/**
 * Satellite (spec §3.2) and LiDAR hillshade (spec §3.3) base styles, plus
 * hybrid mode (spec §3.4: "street labels over satellite or LiDAR") — built
 * by adding the same label layers from labelLayers.ts on top of a raster
 * (or raster-dem) base, referencing the street vector source only for
 * those label layers, not for any of its usual road/building/water fills.
 */

import type { StyleSpecification } from '@maplibre/maplibre-react-native';

import { buildLabelLayers, STREET_LABELS_SOURCE_ID } from './labelLayers';

interface HybridLabelOptions {
  /**
   * mbtiles:// URL of the street vector database, needed only to draw
   * labels on top of imagery/hillshade. Omit (or pass null) to leave the
   * base layer unlabeled — spec §3.2/3.3's "raw" imagery/terrain view.
   */
  streetMbtilesUrl: string | null;
  glyphsUrl: string | null;
}

function labelSourcesAndLayers({ streetMbtilesUrl, glyphsUrl }: HybridLabelOptions) {
  if (!streetMbtilesUrl) return { sources: {}, layers: [] as object[] };
  return {
    sources: { [STREET_LABELS_SOURCE_ID]: { type: 'vector', url: streetMbtilesUrl } },
    layers: buildLabelLayers(glyphsUrl),
  };
}

const SATELLITE_SOURCE = 'satellite';

interface SatelliteStyleOptions extends HybridLabelOptions {
  /** mbtiles:// URL of the satellite raster tile database. */
  satelliteMbtilesUrl: string;
}

/** Spec §3.2: raw satellite imagery, no overlays — plus optional hybrid labels. */
export function buildSatelliteStyle({
  satelliteMbtilesUrl,
  streetMbtilesUrl,
  glyphsUrl,
}: SatelliteStyleOptions): StyleSpecification {
  const labels = labelSourcesAndLayers({ streetMbtilesUrl, glyphsUrl });

  return {
    version: 8,
    name: 'FreeRoam+ Satellite',
    ...(glyphsUrl && streetMbtilesUrl ? { glyphs: glyphsUrl } : {}),
    sources: {
      [SATELLITE_SOURCE]: { type: 'raster', url: satelliteMbtilesUrl, tileSize: 256 },
      ...labels.sources,
    },
    layers: [
      { id: 'satellite-raster', type: 'raster', source: SATELLITE_SOURCE },
      ...labels.layers,
    ],
  } as StyleSpecification;
}

const LIDAR_SOURCE = 'lidar-dem';

interface LidarStyleOptions extends HybridLabelOptions {
  /** mbtiles:// URL of the LiDAR raster-dem (Terrain-RGB) tile database. */
  lidarMbtilesUrl: string;
}

/**
 * Spec §3.3: raw LiDAR-derived terrain view (hillshade/nDSM). MapLibre
 * shades a Terrain-RGB raster-dem source on-device via a `hillshade` layer
 * — no separate pre-rendered hillshade image needed, just the encoded
 * elevation tiles (see docs/DATA.md for how those get produced).
 */
export function buildLidarStyle({
  lidarMbtilesUrl,
  streetMbtilesUrl,
  glyphsUrl,
}: LidarStyleOptions): StyleSpecification {
  const labels = labelSourcesAndLayers({ streetMbtilesUrl, glyphsUrl });

  return {
    version: 8,
    name: 'FreeRoam+ LiDAR Hillshade',
    ...(glyphsUrl && streetMbtilesUrl ? { glyphs: glyphsUrl } : {}),
    sources: {
      [LIDAR_SOURCE]: {
        type: 'raster-dem',
        url: lidarMbtilesUrl,
        tileSize: 256,
        encoding: 'terrarium',
      },
      ...labels.sources,
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#3d3a34' } },
      {
        id: 'lidar-hillshade',
        type: 'hillshade',
        source: LIDAR_SOURCE,
        paint: {
          'hillshade-shadow-color': '#2a2620',
          'hillshade-highlight-color': '#f4f1ea',
          'hillshade-accent-color': '#5d5347',
          'hillshade-exaggeration': 0.6,
        },
      },
      ...labels.layers,
    ],
  } as StyleSpecification;
}
