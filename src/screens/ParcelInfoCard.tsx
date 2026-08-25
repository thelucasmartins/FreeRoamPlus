import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ParcelProperties } from '../overlays/parcelTypes';

interface ParcelInfoCardProps {
  parcel: ParcelProperties;
  onDismiss: () => void;
}

/**
 * Tap-to-inspect card (spec §4): boundary size, zoning, and APN — never
 * owner name/identity, which isn't part of the parcel schema to begin with.
 */
export function ParcelInfoCard({ parcel, onDismiss }: ParcelInfoCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.apn}>APN {parcel.apn}</Text>
        <Pressable onPress={onDismiss} hitSlop={8} accessibilityLabel="Close parcel details">
          <Text style={styles.close}>×</Text>
        </Pressable>
      </View>

      {parcel.resourceExtraction && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Resource-extraction land</Text>
        </View>
      )}

      <View style={styles.row}>
        <Text style={styles.label}>Size</Text>
        <Text style={styles.value}>{parcel.acres.toFixed(1)} acres</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Zoning</Text>
        <Text style={styles.value}>{parcel.zoning}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.97)',
    borderRadius: 12,
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  apn: {
    fontSize: 15,
    fontWeight: '700',
    color: '#3d3a34',
  },
  close: {
    fontSize: 22,
    color: '#8a7a66',
    lineHeight: 22,
    paddingHorizontal: 4,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#b5541c',
    borderRadius: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 8,
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  label: {
    fontSize: 13,
    color: '#8a7a66',
  },
  value: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3d3a34',
  },
});
