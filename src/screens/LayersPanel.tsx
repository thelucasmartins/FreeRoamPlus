import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

interface LayersPanelProps {
  structuresVisible: boolean;
  onToggleStructures: (visible: boolean) => void;
  /** True when the structures layer is showing bundled placeholder data. */
  structuresIsSample: boolean;
}

/**
 * Overlay toggle panel (spec §4: "structures, roads, and parcels can all be
 * layered together"). Only the structures toggle exists so far — roads and
 * parcels join this panel in later build-order steps.
 */
export function LayersPanel({
  structuresVisible,
  onToggleStructures,
  structuresIsSample,
}: LayersPanelProps) {
  return (
    <View style={styles.panel}>
      <Text style={styles.title}>Layers</Text>

      <Pressable
        style={styles.row}
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
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    top: 60,
    right: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    minWidth: 190,
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
  legendLabel: {
    fontSize: 12,
    color: '#5d5347',
  },
  sampleNote: {
    marginTop: 4,
    fontSize: 10,
    color: '#b5541c',
    fontStyle: 'italic',
  },
});
