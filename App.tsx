import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { Modal } from 'react-native';

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

  // Whether the map-data screen was opened deliberately from the map, as
  // opposed to being shown because there is no basemap yet. Without this the
  // screen is first-run-only: it disappears the moment sonoma.mbtiles lands
  // and takes the overlay downloads, the glyph download and the reset control
  // with it — the reset in particular exists to recover from a tile database
  // that is bad but reports itself ready, which is precisely the state in
  // which this branch would never render it.
  const [setupOpen, setSetupOpen] = useState(false);

  // Re-reads from disk rather than trusting the screen to report back: the
  // glyph download changes what getStatus() returns without touching the tile
  // database, so a caller-supplied status would silently drop it.
  const closeSetup = () => {
    setTileStatus(getStatus());
    setSetupOpen(false);
  };

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
        onOpenSetup={() => setSetupOpen(true)}
      />
    );
  } else if (useOnlineFallback) {
    content = (
      <MapScreen
        streetMapStyle={DEV_FALLBACK_STYLE_URL}
        streetMbtilesUrl={null}
        offline={false}
        glyphsUrl={null}
        onOpenSetup={() => setSetupOpen(true)}
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

      {/*
        Layered OVER the map rather than swapped for it.
        Rendering SetupScreen in `content` put a different component type in
        the same slot, so React unmounted MapScreen on every visit — and
        MapScreen holds the breadcrumb trail in useState, deliberately
        unpersisted because it is a live "path so far" rather than a saved
        track. One tap on a row sitting directly below Parcels would have
        silently discarded a trail recorded hours into the backcountry, on an
        app whose breadcrumb is the way back. It also reset the camera, the
        active route and the layer toggles, and re-parsed the 49MB roads
        overlay and 12MB search index on every return.

        A Modal keeps MapScreen mounted underneath. onRequestClose also gives
        the Android hardware back button the right behaviour here, which
        nothing else in this app currently handles.
      */}
      <Modal
        visible={setupOpen}
        animationType="slide"
        onRequestClose={closeSetup}
        presentationStyle="fullScreen"
      >
        <SetupScreen
          onTilesReady={setTileStatus}
          onUseOnlineFallback={() => setUseOnlineFallback(true)}
          onClose={closeSetup}
        />
      </Modal>

      <StatusBar style="dark" />
    </>
  );
}
