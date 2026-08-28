import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { TILE_DOWNLOAD_URL } from '../config';
import {
  downloadOverlays,
  overlayLabel,
  type OverlayId,
} from '../offline/overlayFiles';
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
  const [overlayBusy, setOverlayBusy] = useState(false);
  const [overlayProgress, setOverlayProgress] = useState<string | null>(null);
  const [overlayResult, setOverlayResult] = useState<string | null>(null);

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

  /**
   * Overlay data is a separate transfer from the basemap and doesn't gate
   * entry to the map — the stores fall back to sample data when a file is
   * missing, so a partial or failed overlay download still leaves a usable
   * app. `downloadOverlays` reports per-file outcomes instead of throwing,
   * so one failure can't strand this screen.
   */
  const runOverlayDownload = async (ids?: OverlayId[]) => {
    setOverlayBusy(true);
    setOverlayResult(null);
    setOverlayProgress('Starting…');
    const outcomes = await downloadOverlays(ids, (id, info) => {
      const pct =
        info.totalBytes && info.totalBytes > 0
          ? ` ${Math.round((info.bytesWritten / info.totalBytes) * 100)}%`
          : '';
      setOverlayProgress(`${overlayLabel(id)}${pct}`);
    });
    setOverlayProgress(null);
    setOverlayBusy(false);

    const failed = outcomes.filter((o) => !o.ok);
    const okCount = outcomes.length - failed.length;
    setOverlayResult(
      failed.length === 0
        ? `${okCount}/${outcomes.length} installed.`
        : `${okCount}/${outcomes.length} installed — ${failed
            .map((f) => `${f.label}: ${f.error}`)
            .join('; ')}`,
    );
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

      <View style={styles.divider} />

      <Text style={styles.body}>
        Overlay data (structures, roads, parcels, search, elevation) downloads
        separately — about 220MB. The map works without it using sample data.
      </Text>

      {overlayBusy ? (
        <View style={styles.progressRow}>
          <ActivityIndicator color="#4a6b3a" />
          <Text style={styles.progressText}>{overlayProgress ?? 'Working…'}</Text>
        </View>
      ) : (
        <>
          <Pressable
            style={styles.primaryButton}
            onPress={() => runOverlayDownload()}
          >
            <Text style={styles.primaryButtonText}>Download overlay data</Text>
          </Pressable>
          {/* 18KB — proves the whole LAN path (URL, firewall, disk, write)
              in a second, before committing to a 220MB transfer. */}
          <Pressable
            style={styles.secondaryButton}
            onPress={() => runOverlayDownload(['dem'])}
          >
            <Text style={styles.secondaryButtonText}>
              Test connection only (18KB)
            </Text>
          </Pressable>
        </>
      )}

      {overlayResult && <Text style={styles.body}>{overlayResult}</Text>}

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
  divider: {
    height: 1,
    alignSelf: 'stretch',
    backgroundColor: '#ddd5c7',
    marginTop: 28,
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
