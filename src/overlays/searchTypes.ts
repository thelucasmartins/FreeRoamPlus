/**
 * Offline search index data model (spec §16).
 *
 * Built at pipeline time from OpenStreetMap place/address/POI data for
 * Sonoma County. Deliberately flat and simple — this is a name-to-coordinate
 * lookup for jumping the camera and starting a route, not a full geocoder.
 */

export type SearchEntryKind = 'place' | 'road' | 'poi';

export interface SearchEntry {
  id: string;
  name: string;
  kind: SearchEntryKind;
  coordinate: [number, number];
}

export type SearchIndex = SearchEntry[];
