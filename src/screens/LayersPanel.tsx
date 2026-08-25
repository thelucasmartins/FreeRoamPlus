import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

interface LayersPanelProps {
  structuresVisible: boolean;
  onToggleStructures: (visible: boolean) => void;
  /** True when the structures layer is showing bundled placeholder data. */
  structuresIsSample: boolean;
  roadsVisible: boolean;
  onToggleRoads: (visible: boolean) => void;
  /** True when the roads layer is showing bundled placeholder data. */
  roadsIsSample: boolean;
  parcelsVisible: boolean;
  onToggleParcels: (visible: boolean) => void;
  /** True when the parcels layer is showing bundled placeholder data. */
  parcelsIsSample: boolean;
}

/**
 * Overlay toggle panel (spec §4: "structures, roads, and parcels can all be
 * layered together"). All three toggles are in now.
 */
export function LayersPanel({
  structuresVisible,
  onToggleStructures,
  structuresIsSample,
  roadsVisible,
  onToggleRoads,
  roadsIsSample,
  parcelsVisible,
  onToggleParcels,
  parcelsIsSample,
}: LayersPanelProps) {
  return (
    <View style={styles.panel}>
      <Text style={styles.title}>Layers</Text>

      <Pressable style={styles.row} onPress={() => onToggleRoads(!roadsVisible)}>
        <Text style={styles.rowLabel}>Roads &amp; Trails</Text>
        <Switch
          value={roadsVisible}
          onValueChange={onToggleRoads}
          trackColor={{ true: '#4a6b3a', false: '#ccc4b6' }}
        />
      </Pressable>

      {roadsVisible && (
        <View style={styles.legend}>
          <View style={styles.legendRow}>
            <View style={[styles.swatch, styles.swatchGreen]} />
            <Text style={styles.legendLabel}>Public / government</Text>
          </View>
          <View style={styles.legendRow}>
            <View style={[styles.swatch, styles.swatchYellow]} />
            <Text style={styles.legendLabel}>National forest / protected</Text>
          </View>
          <View style={styles.legendRow}>
            <View style={[styles.swatch, styles.swatchRed]} />
            <Text style={styles.legendLabel}>Private / unclassified</Text>
          </View>
          <View style={styles.legendRow}>
            <View style={[styles.swatch, styles.swatchPurple]} />
            <Text style={styles.legendLabel}>Hiking trail (&lt;1m)</Text>
          </View>
          <View style={styles.legendRow}>
            <View style={[styles.swatch, styles.swatchPink]} />
            <Text style={styles.legendLabel}>ATV trail (1–3m)</Text>
          </View>
          {roadsIsSample && (
            <Text style={styles.sampleNote}>Sample data — pipeline output not installed</Text>
          )}
        </View>
      )}

      <Pressable
        style={[styles.row, styles.rowWithDivider]}
        onPress={() => onToggleStructures(!structuresVisible)}
      >
        <Text style={styles.rowLabel}>Structures</Text>
        <Switch
          value={structuresVisible}
          onValueChange={onToggleStructures}
          trackColor={{ true: '#4a6b3a', false: '#ccc4b6' }}
        />
      </Pressable>

      {structuresVisible && (
        <View style={styles.legend}>
          <View style={styles.legendRow}>
            <View style={[styles.swatch, styles.swatchDocumented]} />
            <Text style={styles.legendLabel}>Documented</Text>
          </View>
          <View style={styles.legendRow}>
            <View style={[styles.swatch, styles.swatchUndocumented]} />
            <Text style={styles.legendLabel}>Undocumented (LiDAR)</Text>
          </View>
          {structuresIsSample && (
            <Text style={styles.sampleNote}>Sample data — pipeline output not installed</Text>
          )}
        </View>
      )}

      <Pressable
        style={[styles.row, styles.rowWithDivider]}
        onPress={() => onToggleParcels(!parcelsVisible)}
      >
        <Text style={styles.rowLabel}>Parcels</Text>
        <Switch
          value={parcelsVisible}
          onValueChange={onToggleParcels}
          trackColor={{ true: '#4a6b3a', false: '#ccc4b6' }}
        />
      </Pressable>

      {parcelsVisible && (
        <View style={styles.legend}>
          <View style={styles.legendRow}>
            <View style={[styles.swatch, styles.swatchParcelStandard]} />
            <Text style={styles.legendLabel}>Standard</Text>
          </View>
          <View style={styles.legendRow}>
            <View style={[styles.swatch, styles.swatchParcelResource]} />
            <Text style={styles.legendLabel}>Resource extraction</Text>
          </View>
          <Text style={styles.hintNote}>Tap a parcel for size, zoning &amp; APN</Text>
          {parcelsIsSample && (
            <Text style={styles.sampleNote}>Sample data — pipeline output not installed</Text>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    top: 72,
    right: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    minWidth: 200,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  title: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8a7a66',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowWithDivider: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ddd4c5',
  },
  rowLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3d3a34',
  },
  legend: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ddd4c5',
    gap: 4,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  swatch: {
    width: 12,
    height: 12,
    borderRadius: 3,
  },
  swatchDocumented: {
    backgroundColor: '#3d6b9c',
  },
  swatchUndocumented: {
    backgroundColor: '#c1443a',
  },
  swatchGreen: {
    backgroundColor: '#3f9142',
  },
  swatchYellow: {
    backgroundColor: '#e0a930',
  },
  swatchRed: {
    backgroundColor: '#c1443a',
  },
  swatchPurple: {
    backgroundColor: '#8b5fbf',
  },
  swatchPink: {
    backgroundColor: '#e0559c',
  },
  swatchParcelStandard: {
    backgroundColor: '#c9bfae',
  },
  swatchParcelResource: {
    backgroundColor: '#b5541c',
  },
  legendLabel: {
    fontSize: 12,
    color: '#5d5347',
  },
  hintNote: {
    marginTop: 4,
    fontSize: 10,
    color: '#8a7a66',
  },
  sampleNote: {
    marginTop: 4,
    fontSize: 10,
    color: '#b5541c',
    fontStyle: 'italic',
  },
});
