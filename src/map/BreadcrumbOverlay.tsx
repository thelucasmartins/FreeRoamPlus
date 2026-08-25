import { GeoJSONSource, Layer } from '@maplibre/maplibre-react-native';

interface BreadcrumbOverlayProps {
  points: [number, number][];
}

const SOURCE_ID = 'breadcrumb-source';
const TRAIL_COLOR = '#4a5c8a';

/**
 * The current session's ridden path (spec §12) — deliberately understated
 * (thin, dotted, muted color) since it's a reference trail for
 * backtracking, not something competing visually with the route or road
 * overlays.
 */
export function BreadcrumbOverlay({ points }: BreadcrumbOverlayProps) {
  const data: GeoJSON.FeatureCollection<GeoJSON.LineString> = {
    type: 'FeatureCollection',
    features:
      points.length >= 2
        ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: points } }]
        : [],
  };

  return (
    <GeoJSONSource id={SOURCE_ID} data={data}>
      <Layer
        id="breadcrumb-line"
        type="line"
        source={SOURCE_ID}
        layout={{ 'line-cap': 'round' }}
        paint={{
          'line-color': TRAIL_COLOR,
          'line-width': 3,
          'line-dasharray': [1, 2],
          'line-opacity': 0.85,
        }}
      />
    </GeoJSONSource>
  );
}
