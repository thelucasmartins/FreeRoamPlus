import {
  GeoJSONSource,
  Layer,
  type PressEventWithFeatures,
} from '@maplibre/maplibre-react-native';
import type { NativeSyntheticEvent } from 'react-native';

import type { Waypoint } from '../waypoints/types';

interface WaypointsOverlayProps {
  waypoints: Waypoint[];
  onSelect: (waypoint: Waypoint) => void;
}

const SOURCE_ID = 'waypoints-source';
const WAYPOINT_COLOR = '#0f9b8e';

function toFeatureCollection(waypoints: Waypoint[]): GeoJSON.FeatureCollection<GeoJSON.Point, Waypoint> {
  return {
    type: 'FeatureCollection',
    features: waypoints.map((waypoint) => ({
      type: 'Feature',
      properties: waypoint,
      geometry: { type: 'Point', coordinates: waypoint.coordinate },
    })),
  };
}

/** User-dropped pins (spec §11), rendered as small teal markers distinct from every other overlay's palette. */
export function WaypointsOverlay({ waypoints, onSelect }: WaypointsOverlayProps) {
  const handlePress = (event: NativeSyntheticEvent<PressEventWithFeatures>) => {
    const feature = event.nativeEvent.features[0];
    if (!feature) return;
    event.stopPropagation();
    onSelect(feature.properties as unknown as Waypoint);
  };

  return (
    <GeoJSONSource id={SOURCE_ID} data={toFeatureCollection(waypoints)} onPress={handlePress}>
      <Layer
        id="waypoints-circle"
        type="circle"
        source={SOURCE_ID}
        paint={{
          'circle-radius': 8,
          'circle-color': WAYPOINT_COLOR,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        }}
      />
    </GeoJSONSource>
  );
}
