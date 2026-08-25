import { GeoJSONSource, Layer } from '@maplibre/maplibre-react-native';

import type { RouteResult } from '../routing/router';

interface RouteOverlayProps {
  route: RouteResult;
  destination: [number, number];
}

const ROUTE_SOURCE_ID = 'route-source';
const OFF_NETWORK_SOURCE_ID = 'route-offnetwork-source';
const DESTINATION_SOURCE_ID = 'route-destination-source';
const ROUTE_COLOR = '#2b7de9';

function lineFeature(coordinates: [number, number][]): GeoJSON.Feature<GeoJSON.LineString> {
  return { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } };
}

/**
 * Renders a computed route (src/routing/router.ts): a solid line for the
 * on-network portion, and a dashed line for any off-network leg(s) — the
 * spec §16 fallback, shown distinctly rather than blended into the route so
 * it reads as "the network doesn't reach exactly here."
 */
export function RouteOverlay({ route, destination }: RouteOverlayProps) {
  const onNetworkData: GeoJSON.FeatureCollection<GeoJSON.LineString> = {
    type: 'FeatureCollection',
    features:
      route.onNetworkCoordinates.length >= 2 ? [lineFeature(route.onNetworkCoordinates)] : [],
  };

  const offNetworkFeatures: GeoJSON.Feature<GeoJSON.LineString>[] = [];
  if (route.startOffNetwork) {
    offNetworkFeatures.push(
      lineFeature([route.startOffNetwork.from, route.startOffNetwork.to]),
    );
  }
  if (route.endOffNetwork) {
    offNetworkFeatures.push(lineFeature([route.endOffNetwork.to, route.endOffNetwork.from]));
  }
  const offNetworkData: GeoJSON.FeatureCollection<GeoJSON.LineString> = {
    type: 'FeatureCollection',
    features: offNetworkFeatures,
  };

  const destinationData: GeoJSON.FeatureCollection<GeoJSON.Point> = {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: destination } },
    ],
  };

  return (
    <>
      <GeoJSONSource id={ROUTE_SOURCE_ID} data={onNetworkData}>
        <Layer
          id="route-line"
          type="line"
          source={ROUTE_SOURCE_ID}
          layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          paint={{
            'line-color': ROUTE_COLOR,
            'line-width': ['interpolate', ['linear'], ['zoom'], 10, 3, 16, 7],
          }}
        />
      </GeoJSONSource>
      <GeoJSONSource id={OFF_NETWORK_SOURCE_ID} data={offNetworkData}>
        <Layer
          id="route-offnetwork-line"
          type="line"
          source={OFF_NETWORK_SOURCE_ID}
          layout={{ 'line-cap': 'round' }}
          paint={{
            'line-color': ROUTE_COLOR,
            'line-width': 3,
            'line-dasharray': [1.5, 1.5],
            'line-opacity': 0.7,
          }}
        />
      </GeoJSONSource>
      <GeoJSONSource id={DESTINATION_SOURCE_ID} data={destinationData}>
        <Layer
          id="route-destination-point"
          type="circle"
          source={DESTINATION_SOURCE_ID}
          paint={{
            'circle-radius': 7,
            'circle-color': ROUTE_COLOR,
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff',
          }}
        />
      </GeoJSONSource>
    </>
  );
}
