import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { GLYPH_RANGES, TILE_DOWNLOAD_URL } from '../config';
import { deleteLidarTiles, deleteSatelliteTiles } from '../offline/baseLayerTiles';
import { deleteGlyphs, downloadGlyphs, getGlyphsStatus } from '../offline/glyphs';
import {
  deleteOverlay,
  downloadOverlays,
  overlayLabel,
  OVERLAY_IDS,
  type OverlayId,
} from '../offline/overlayFiles';
import {
  deleteOverlayTiles,
  downloadOverlayTiles,
  overlayTileLabel,
  OVERLAY_TILE_IDS,
} from '../offline/overlayTiles';
import { deleteTiles, downloadTiles, type TileStoreStatus } from '../offline/tileStore';

interface SetupScreenProps {
  onTilesReady: (status: TileStoreStatus) => void;
  onUseOnlineFallback: () => void;
  /**
   * Returns to the map. Present only when this screen was opened from the
   * map (Layers → Map data); absent on the first-run path, where there is no
   * map to go back to yet.
   */
  onClose?: () => void;
}

/**
 * Shown when no offline tile database is on the device yet. Offers the
 * one-time Wi-Fi download (spec §8), or an online fallback for development.
 */
export function SetupScreen({ onTilesReady, onUseOnlineFallback, onClose }: SetupScreenProps) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overlayBusy, setOverlayBusy] = useState(false);
  const [overlayProgress, setOverlayProgress] = useState<string | null>(null);
  const [overlayResult, setOverlayResult] = useState<string | null>(null);
  const [tilesBusy, setTilesBusy] = useState(false);
  const [tileProgress, setTileProgress] = useState<string | null>(null);
  const [tileResult, setTileResult] = useState<string | null>(null);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetResult, setResetResult] = useState<string | null>(null);
  const [glyphsBusy, setGlyphsBusy] = useState(false);
  const [glyphsProgress, setGlyphsProgress] = useState<string | null>(null);
  const [glyphsStatus, setGlyphsStatus] = useState(() => getGlyphsStatus());
  const [glyphsResult, setGlyphsResult] = useState<string | null>(null);

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

  /**
   * Vector tiles for the two large overlays. Separate from the GeoJSON
   * download above because they replace it rather than supplement it: once
   * a tile database is on-device the store resolves to it and never reads
   * the corresponding .geojson, which is the point of the migration — the
   * county-scale structures file is ~102MB and parsing it stalls the map.
   *
   * Failures here are non-fatal by design. Each store falls back to the
   * GeoJSON, and then to bundled samples, so a device that can't fetch
   * tiles still renders.
   */
  const runTileDownload = async () => {
    setTilesBusy(true);
    setTileResult(null);
    const failures: string[] = [];
    let installed = 0;

    for (const id of OVERLAY_TILE_IDS) {
      setTileProgress(overlayTileLabel(id));
      try {
        const status = await downloadOverlayTiles(id, (info) => {
          const pct =
            info.totalBytes && info.totalBytes > 0
              ? ` ${Math.round((info.bytesWritten / info.totalBytes) * 100)}%`
              : '';
          setTileProgress(`${overlayTileLabel(id)}${pct}`);
        });
        if (status.ready) {
          installed += 1;
        } else {
          // Reachable when the file arrives but fails the plausibility
          // floor — e.g. a build still in progress on the desktop.
          failures.push(`${overlayTileLabel(id)}: incomplete database`);
        }
      } catch (e) {
        failures.push(`${overlayTileLabel(id)}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    setTileProgress(null);
    setTilesBusy(false);
    setTileResult(
      failures.length === 0
        ? `${installed}/${OVERLAY_TILE_IDS.length} tile sets installed.`
        : `${installed}/${OVERLAY_TILE_IDS.length} installed — ${failures.join('; ')}`,
    );
  };

  /**
   * Font glyphs for map labels.
   *
   * Not cosmetic: MapLibre Native cannot draw a symbol layer without SDF
   * glyph PBFs and has no system-font fallback for Latin script, so with no
   * pack installed the style drops every label layer and the map renders
   * with no road or place names at all — a failure that looks exactly like a
   * finished map, which is how it survived until an audit found it.
   *
   * Small enough (tens of KB per range) that this is a separate, cheap
   * button rather than part of the 220MB overlay transfer.
   */
  const runGlyphDownload = async () => {
    setGlyphsBusy(true);
    setGlyphsResult(null);
    setGlyphsProgress('Starting…');

    const { status, failures } = await downloadGlyphs((range, info) => {
      const pct =
        info.totalBytes && info.totalBytes > 0
          ? ` ${Math.round((info.bytesWritten / info.totalBytes) * 100)}%`
          : '';
      setGlyphsProgress(`Range ${range}${pct}`);
    });

    setGlyphsProgress(null);
    setGlyphsBusy(false);
    setGlyphsStatus(status);
    setGlyphsResult(
      failures.length === 0
        ? 'Labels installed — restart the app to see road and place names.'
        : `${status.installedRanges.length}/${GLYPH_RANGES.length} ranges installed — ${failures
            .map((f) => `${f.range}: ${f.error}`)
            .join('; ')}`,
    );
  };

  /**
   * Clears every downloaded file so a bad one can be replaced.
   *
   * This is the recovery path for the failure no guard can catch. The size
   * floor in tileSets.ts rejects a truncated database, but nothing can
   * distinguish a *partial large* tile set from a complete smaller one by
   * size alone — so a build aborted late lands looking healthy, and the
   * stores resolve tiles-first and never fall back to the GeoJSON that
   * would have saved them. Without a reset the device is simply stuck
   * rendering a partial county with no error anywhere.
   *
   * Deleting is safe by construction: every store falls back to its
   * GeoJSON and then to bundled sample data, so the worst case after a
   * reset is the app as it shipped.
   */
  const handleResetDownloads = async () => {
    setResetBusy(true);
    setResetResult(null);
    try {
      OVERLAY_TILE_IDS.forEach(deleteOverlayTiles);
      OVERLAY_IDS.forEach(deleteOverlay);
      deleteTiles();
      // Satellite and LiDAR hillshade are downloaded from MapScreen, so they
      // have to be cleared here too — otherwise "reset" leaves exactly the
      // stuck state this control exists to escape, just on a different layer.
      deleteSatelliteTiles();
      deleteLidarTiles();
      deleteGlyphs();
      setGlyphsStatus(getGlyphsStatus());
      setGlyphsResult(null);
      setOverlayResult(null);
      setTileResult(null);
      setError(null);
      setResetResult('All downloaded data removed. Download again to retry.');
    } catch (e) {
      setResetResult(e instanceof Error ? e.message : String(e));
    } finally {
      setResetBusy(false);
    }
  };

  // Every guard below reads this rather than re-listing the flags. The reset
  // guard already drifted once: it enumerated four of the five busy states and
  // omitted glyphsBusy, so resetting mid-glyph-download deleted tiles/fonts
  // while the loop was still writing into it — the loop recreated the
  // directory, and reset reported "All downloaded data removed" over a
  // partial pack that could never report ready.
  const busy = downloading || overlayBusy || tilesBusy || glyphsBusy || resetBusy;

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <Text style={styles.title}>FreeRoam+</Text>
      <Text style={styles.subtitle}>
        {onClose ? 'Map data' : 'Offline map data not installed'}
      </Text>
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

      {tilesBusy ? (
        <View style={styles.progressRow}>
          <ActivityIndicator color="#4a6b3a" />
          <Text style={styles.progressText}>{tileProgress ?? 'Working…'}</Text>
        </View>
      ) : (
        <Pressable style={styles.secondaryButton} onPress={runTileDownload}>
          <Text style={styles.secondaryButtonText}>
            Download structures &amp; parcels as vector tiles
          </Text>
        </Pressable>
      )}

      {tileResult && <Text style={styles.body}>{tileResult}</Text>}

      {/* Labels are the difference between a map and a picture of one. This
          is deliberately its own control: it is a few hundred KB, it is the
          single most visible thing missing without it, and burying it in the
          220MB overlay transfer would mean a failed overlay download also
          costs you every street name. */}
      {glyphsBusy ? (
        <View style={styles.progressRow}>
          <ActivityIndicator color="#4a6b3a" />
          <Text style={styles.progressText}>{glyphsProgress ?? 'Working…'}</Text>
        </View>
      ) : (
        <Pressable style={styles.secondaryButton} onPress={runGlyphDownload}>
          <Text style={styles.secondaryButtonText}>
            {glyphsStatus.ready
              ? 'Map labels installed — re-download'
              : 'Download map labels (road & place names)'}
          </Text>
        </Pressable>
      )}

      {glyphsResult && <Text style={styles.body}>{glyphsResult}</Text>}

      {/* Recovery path. A tile database that is bad but plausibly sized
          passes every guard and is never fallen back from — this is the
          only way out of that state from inside the app. */}
      <Pressable
        style={styles.secondaryButton}
        onPress={handleResetDownloads}
        disabled={busy}
      >
        <Text style={styles.secondaryButtonText}>
          {resetBusy ? 'Removing…' : 'Reset all downloaded data'}
        </Text>
      </Pressable>

      {resetResult && <Text style={styles.body}>{resetResult}</Text>}

      {onClose ? (
        // Leaving mid-transfer strands the writer: the busy flags are
        // per-mount, so re-entering would offer an idle download button and an
        // enabled reset over a download that is still running.
        <Pressable
          style={[styles.primaryButton, busy && styles.buttonDisabled]}
          onPress={onClose}
          disabled={busy}
        >
          <Text style={styles.primaryButtonText}>
            {busy ? 'Downloading…' : 'Back to map'}
          </Text>
        </Pressable>
      ) : (
        <Pressable style={styles.secondaryButton} onPress={onUseOnlineFallback}>
          <Text style={styles.secondaryButtonText}>
            Continue with online fallback (dev only)
          </Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: '#f4f1ea',
  },
  // flexGrow rather than flex so the content still centres when it fits, but
  // scrolls instead of overflowing when it does not. This screen gained three
  // controls and had no scroll view at all — on a short device the lower
  // ones, including the reset, were simply unreachable.
  container: {
    flexGrow: 1,
    backgroundColor: '#f4f1ea',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    paddingBottom: 48,
  },
  buttonDisabled: {
    opacity: 0.5,
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
