import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

export type BaseLayerId = 'street' | 'satellite' | 'lidar';

interface BaseLayerSelectorProps {
  active: BaseLayerId;
  onSelect: (id: BaseLayerId) => void;
  satelliteReady: boolean;
  satelliteDownloading: boolean;
  onDownloadSatellite: () => void;
  lidarReady: boolean;
  lidarDownloading: boolean;
  onDownloadLidar: () => void;
  labelsEnabled: boolean;
  onToggleLabels: (enabled: boolean) => void;
}

interface SegmentProps {
  label: string;
  active: boolean;
  ready: boolean;
  downloading: boolean;
  onPress: () => void;
}

function Segment({ label, active, ready, downloading, onPress }: SegmentProps) {
  return (
    <Pressable
      style={[styles.segment, active && styles.segmentActive]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={ready ? label : `${label}, not installed, tap to download`}
    >
      <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
        {downloading ? '…' : ready ? label : `${label} ↓`}
      </Text>
    </Pressable>
  );
}

/**
 * Base map layer picker (spec §3): Street (always available, spec §3.1),
 * Satellite (§3.2) and LiDAR hillshade (§3.3) as optional raster layers
 * downloaded on demand, and a Labels toggle for hybrid mode (§3.4: "street
 * labels over satellite or LiDAR") — shown only when it applies, since
 * Street already always has labels.
 */
export function BaseLayerSelector({
  active,
  onSelect,
  satelliteReady,
  satelliteDownloading,
  onDownloadSatellite,
  lidarReady,
  lidarDownloading,
  onDownloadLidar,
  labelsEnabled,
  onToggleLabels,
}: BaseLayerSelectorProps) {
  const handlePress = (id: BaseLayerId, ready: boolean, downloading: boolean, download: () => void) => {
    if (downloading) return;
    if (ready) {
      onSelect(id);
    } else {
      download();
    }
  };

  return (
    <View style={styles.wrapper}>
      {active !== 'street' && (
        <View style={styles.labelsRow}>
          <Text style={styles.labelsText}>Labels</Text>
          <Switch
            value={labelsEnabled}
            onValueChange={onToggleLabels}
            trackColor={{ true: '#4a6b3a', false: '#ccc4b6' }}
          />
        </View>
      )}
      <View style={styles.pill}>
        <Segment
          label="Street"
          active={active === 'street'}
          ready
          downloading={false}
          onPress={() => onSelect('street')}
        />
        <Segment
          label="Satellite"
          active={active === 'satellite'}
          ready={satelliteReady}
          downloading={satelliteDownloading}
          onPress={() => handlePress('satellite', satelliteReady, satelliteDownloading, onDownloadSatellite)}
        />
        <Segment
          label="LiDAR"
          active={active === 'lidar'}
          ready={lidarReady}
          downloading={lidarDownloading}
          onPress={() => handlePress('lidar', lidarReady, lidarDownloading, onDownloadLidar)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 12,
    bottom: 24,
    alignItems: 'flex-start',
  },
  labelsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 6,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  labelsText: {
    fontSize: 12,
    color: '#5d5347',
  },
  pill: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    borderRadius: 10,
    padding: 3,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  segment: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
  },
  segmentActive: {
    backgroundColor: '#4a6b3a',
  },
  segmentText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#5d5347',
  },
  segmentTextActive: {
    color: '#ffffff',
  },
});
