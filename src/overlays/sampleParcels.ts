import { SONOMA_CENTER } from '../config';
import type { ParcelFeatureCollection } from './parcelTypes';

/**
 * Placeholder parcels near the default map center, for exercising the
 * overlay and tap-for-details interaction before the real Sonoma County GIS
 * export (spec §9) has produced tiles/overlays/parcels.geojson on-device.
 * None of these correspond to real parcels — see parcelsStore.ts.
 */

const [centerLng, centerLat] = SONOMA_CENTER;

/** A rectangular parcel `sizeDeg` wide/tall, centered on the given offset. */
function boundary(offsetLng: number, offsetLat: number, sizeDeg: number): GeoJSON.Polygon {
  const lng = centerLng + offsetLng;
  const lat = centerLat + offsetLat;
  const half = sizeDeg / 2;
  return {
    type: 'Polygon',
    coordinates: [
      [
        [lng - half, lat - half],
        [lng + half, lat - half],
        [lng + half, lat + half],
        [lng - half, lat + half],
        [lng - half, lat - half],
      ],
    ],
  };
}

export const SAMPLE_PARCELS: ParcelFeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: boundary(-0.006, 0.004, 0.0025),
      properties: { apn: '123-456-789', zoning: 'RR (Rural Residential)', acres: 4.8, resourceExtraction: false },
    },
    {
      type: 'Feature',
      geometry: boundary(-0.001, 0.0035, 0.002),
      properties: { apn: '123-456-790', zoning: 'AG (Agricultural)', acres: 2.1, resourceExtraction: false },
    },
    {
      type: 'Feature',
      geometry: boundary(0.004, 0.003, 0.003),
      properties: { apn: '123-457-101', zoning: 'TP (Timber Preserve)', acres: 38.6, resourceExtraction: true },
    },
    {
      type: 'Feature',
      geometry: boundary(-0.005, -0.003, 0.0022),
      properties: { apn: '123-460-002', zoning: 'RR (Rural Residential)', acres: 5.3, resourceExtraction: false },
    },
    {
      type: 'Feature',
      geometry: boundary(0.001, -0.004, 0.0035),
      properties: { apn: '123-461-014', zoning: 'MR (Mineral Resource)', acres: 22.9, resourceExtraction: true },
    },
  ],
};
