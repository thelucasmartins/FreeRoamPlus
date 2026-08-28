import {
  GeoJSONSource,
  Layer,
  VectorSource,
  type FilterSpecification,
  type PressEventWithFeatures,
} from '@maplibre/maplibre-react-native';
import type { NativeSyntheticEvent } from 'react-native';

import type { OverlaySource } from '../overlays/overlaySource';
import type { ParcelFeatureCollection, ParcelProperties } from '../overlays/parcelTypes';

interface ParcelsOverlayProps {
  source: OverlaySource<ParcelFeatureCollection>;
  onSelect: (parcel: ParcelProperties) => void;
}

const SOURCE_ID = 'parcels-source';

const RESOURCE_EXTRACTION_FILTER: FilterSpecification = ['==', ['get', 'resourceExtraction'], true];
const STANDARD_FILTER: FilterSpecification = ['==', ['get', 'resourceExtraction'], false];

/**
 * Parcel boundaries (spec §4): rendered under roads/structures since they're
 * ground-level property lines, not features on top of the terrain.
 *
 * Renders from vector tiles when a parcels MBTiles is on the device, and
 * from GeoJSON otherwise. That distinction is the fix for spec §10's
 * "previously failed to load/render reliably" — the full-county export is
 * ~58MB of GeoJSON, and parsing it into a single source is what stalls the
 * device (docs/DATA.md §6). Tap-to-inspect survives the switch: both source
 * types extend the same PressableSourceProps, so `onPress` and its event
 * shape are identical — verified against the installed
 * @maplibre/maplibre-react-native types, not assumed.
 *
 * Resource-extraction parcels (timber/mining/milling, spec §4) get a bolder
 * fill and dashed outline so they stand out; regular parcels stay subtle so
 * they don't compete visually with roads and structures on top of them.
 * Tapping either kind reports its properties via onSelect — never owner
 * identity, which isn't part of this schema at all.
 */
export function ParcelsOverlay({ source, onSelect }: ParcelsOverlayProps) {
  const handlePress = (event: NativeSyntheticEvent<PressEventWithFeatures>) => {
    const feature = event.nativeEvent.features[0];
    if (!feature) return;
    event.stopPropagation();
    onSelect(feature.properties as ParcelProperties);
  };

  // Hyphenated `source-layer` per the style spec — the camelCase form only
  // exists on a deprecated prop path and would silently not apply.
  const sourceLayerProp: { 'source-layer'?: string } =
    source.mode === 'tiles' ? { 'source-layer': source.sourceLayer } : {};

  const layers = (
    <>
      <Layer
        id="parcels-standard-fill"
        type="fill"
        source={SOURCE_ID}
        {...sourceLayerProp}
        filter={STANDARD_FILTER}
        minzoom={13}
        paint={{
          'fill-color': '#c9bfae',
          'fill-opacity': 0.15,
          'fill-outline-color': '#8a7a66',
        }}
      />
      <Layer
        id="parcels-resource-extraction-fill"
        type="fill"
        source={SOURCE_ID}
        {...sourceLayerProp}
        filter={RESOURCE_EXTRACTION_FILTER}
        minzoom={13}
        paint={{
          'fill-color': '#b5541c',
          'fill-opacity': 0.25,
        }}
      />
      <Layer
        id="parcels-resource-extraction-outline"
        type="line"
        source={SOURCE_ID}
        {...sourceLayerProp}
        filter={RESOURCE_EXTRACTION_FILTER}
        minzoom={13}
        paint={{
          'line-color': '#8a3d12',
          'line-width': 2,
          'line-dasharray': [3, 1.5],
        }}
      />
    </>
  );

  if (source.mode === 'tiles') {
    return (
      <VectorSource id={SOURCE_ID} url={source.tileUrl} onPress={handlePress}>
        {layers}
      </VectorSource>
    );
  }

  return (
    <GeoJSONSource id={SOURCE_ID} data={source.data} onPress={handlePress}>
      {layers}
    </GeoJSONSource>
  );
}
