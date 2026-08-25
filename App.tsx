import { StatusBar } from 'expo-status-bar';
import { useMemo, useState } from 'react';

import { DEV_FALLBACK_STYLE_URL } from './src/config';
import { buildOfflineStyle } from './src/map/style';
import { getStatus, type TileStoreStatus } from './src/offline/tileStore';
import { MapScreen } from './src/screens/MapScreen';
import { SetupScreen } from './src/screens/SetupScreen';

export default function App() {
  const [tileStatus, setTileStatus] = useState<TileStoreStatus>(() => getStatus());
  const [useOnlineFallback, setUseOnlineFallback] = useState(false);

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
      <MapScreen mapStyle={offlineStyle} offline glyphsUrl={tileStatus.glyphsUrl} />
    );
  } else if (useOnlineFallback) {
    content = (
      <MapScreen mapStyle={DEV_FALLBACK_STYLE_URL} offline={false} glyphsUrl={null} />
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
      {content}
      <StatusBar style="dark" />
    </>
  );
}
