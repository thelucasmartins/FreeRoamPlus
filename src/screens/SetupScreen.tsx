import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { TILE_DOWNLOAD_URL } from '../config';
import { downloadTiles, type TileStoreStatus } from '../offline/tileStore';

interface SetupScreenProps {
  onTilesReady: (status: TileStoreStatus) => void;
  onUseOnlineFallback: () => void;
}

/**
 * Shown when no offline tile database is on the device yet. Offers the
 * one-time Wi-Fi download (spec §8), or an online fallback for development.
 */
export function SetupScreen({ onTilesReady, onUseOnlineFallback }: SetupScreenProps) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDownload = async () => {
    setDownloading(true);
    setError(null);
    try {
      const status = await downloadTiles();
      if (status.ready) {
        onTilesReady(status);
      } else {
        setError('Download finished but the tile database was not found.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>FreeRoam+</Text>
      <Text style={styles.subtitle}>Offline map data not installed</Text>
      <Text style={styles.body}>
        The Sonoma County tile database (sonoma.mbtiles) is not on this device
        yet. Download it once over Wi-Fi — after that the map works with no
        signal at all.
      </Text>
      <Text style={styles.url}>Source: {TILE_DOWNLOAD_URL}</Text>

      {downloading ? (
        <View style={styles.progressRow}>
          <ActivityIndicator color="#4a6b3a" />
          <Text style={styles.progressText}>Downloading tiles…</Text>
        </View>
      ) : (
        <Pressable style={styles.primaryButton} onPress={handleDownload}>
          <Text style={styles.primaryButtonText}>Download tiles</Text>
        </Pressable>
      )}

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable style={styles.secondaryButton} onPress={onUseOnlineFallback}>
        <Text style={styles.secondaryButtonText}>
          Continue with online fallback (dev only)
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f4f1ea',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#3d3a34',
  },
  subtitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#b5541c',
    marginTop: 8,
  },
  body: {
    fontSize: 14,
    color: '#5d5347',
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 20,
  },
  url: {
    fontSize: 12,
    color: '#8a7a66',
    marginTop: 8,
  },
  primaryButton: {
    backgroundColor: '#4a6b3a',
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    marginTop: 24,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 24,
  },
  progressText: {
    fontSize: 14,
    color: '#4a6b3a',
  },
  error: {
    color: '#a02c2c',
    fontSize: 13,
    marginTop: 12,
    textAlign: 'center',
  },
  secondaryButton: {
    marginTop: 28,
  },
  secondaryButtonText: {
    color: '#8a7a66',
    fontSize: 13,
    textDecorationLine: 'underline',
  },
});
