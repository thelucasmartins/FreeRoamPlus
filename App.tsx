import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';

import { DEV_FALLBACK_STYLE_URL } from './src/config';
import { buildOfflineStyle } from './src/map/style';
import { enableMetricsAutosave } from './src/offline/metricsLog';
import { getStatus, type TileStoreStatus } from './src/offline/tileStore';
import { ErrorBoundary } from './src/screens/ErrorBoundary';
import { MapScreen } from './src/screens/MapScreen';
import { SetupScreen } from './src/screens/SetupScreen';

export default function App() {
  const [tileStatus, setTileStatus] = useState<TileStoreStatus>(() => getStatus());
  const [useOnlineFallback, setUseOnlineFallback] = useState(false);

  // Overlay load timings are the only real performance data this project
  // gets, and they're produced once, on a device, during a verification pass
  // — so they have to outlive the terminal they're printed to. Persisting
  // them is what makes the roads parse-vs-classify split reviewable after
  // the fact instead of scrolling past in the Metro log.
  useEffect(() => enableMetricsAutosave(), []);

  const offlineStyle = useMemo(
    () =>
      tileStatus.ready && tileStatus.mbtilesUrl
        ? buildOfflineStyle({
            mbtilesUrl: tileStatus.mbtilesUrl,
            glyphsUrl: tileStatus.glyphsUrl,
          })
        : null,
    [tileStatus],
  );

  let content;
  if (offlineStyle) {
    content = (
      <MapScreen
        streetMapStyle={offlineStyle}
        streetMbtilesUrl={tileStatus.mbtilesUrl}
        offline
        glyphsUrl={tileStatus.glyphsUrl}
      />
    );
  } else if (useOnlineFallback) {
    content = (
      <MapScreen
        streetMapStyle={DEV_FALLBACK_STYLE_URL}
        streetMbtilesUrl={null}
        offline={false}
        glyphsUrl={null}
      />
    );
  } else {
    content = (
      <SetupScreen
        onTilesReady={setTileStatus}
        onUseOnlineFallback={() => setUseOnlineFallback(true)}
      />
    );
  }

  return (
    <>
      <ErrorBoundary>{content}</ErrorBoundary>
      <StatusBar style="dark" />
    </>
  );
}
