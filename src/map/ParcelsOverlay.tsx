import {
  GeoJSONSource,
  Layer,
  type FilterSpecification,
  type PressEventWithFeatures,
} from '@maplibre/maplibre-react-native';
import type { NativeSyntheticEvent } from 'react-native';

import type { ParcelFeatureCollection, ParcelProperties } from '../overlays/parcelTypes';

interface ParcelsOverlayProps {
  data: ParcelFeatureCollection;
  onSelect: (parcel: ParcelProperties) => void;
}

const SOURCE_ID = 'parcels-source';

const RESOURCE_EXTRACTION_FILTER: FilterSpecification = ['==', ['get', 'resourceExtraction'], true];
const STANDARD_FILTER: FilterSpecification = ['==', ['get', 'resourceExtraction'], false];

/**
 * Parcel boundaries (spec §4): rendered under roads/structures since they're
 * ground-level property lines, not features on top of the terrain. Kept as
 * a plain GeoJSONSource at a fairly high minzoom to bound how much renders
 * at once — see docs/DATA.md for why that matters here specifically (spec
 * §10: this overlay previously failed to load/render reliably) and the
 * vector-tile path to take once a full-county export exists.
 *
 * Resource-extraction parcels (timber/mining/milling, spec §4) get a bolder
 * fill and dashed outline so they stand out; regular parcels stay subtle so
 * they don't compete visually with roads and structures on top of them.
 * Tapping either kind reports its properties via onSelect — never owner
 * identity, which isn't part of this schema at all.
 */
export function ParcelsOverlay({ data, onSelect }: ParcelsOverlayProps) {
  const handlePress = (event: NativeSyntheticEvent<PressEventWithFeatures>) => {
    const feature = event.nativeEvent.features[0];
    if (!feature) return;
    event.stopPropagation();
    onSelect(feature.properties as ParcelProperties);
  };

  return (
    <GeoJSONSource id={SOURCE_ID} data={data} onPress={handlePress}>
      <Layer
        id="parcels-standard-fill"
        type="fill"
        source={SOURCE_ID}
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
        filter={RESOURCE_EXTRACTION_FILTER}
        minzoom={13}
        paint={{
          'line-color': '#8a3d12',
          'line-width': 2,
          'line-dasharray': [3, 1.5],
        }}
      />
    </GeoJSONSource>
  );
}
