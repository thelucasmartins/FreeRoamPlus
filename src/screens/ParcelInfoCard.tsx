import { StyleSheet, Text, View } from 'react-native';

import type { ParcelProperties } from '../overlays/parcelTypes';
import { BottomCard } from './BottomCard';

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
    <BottomCard title={`APN ${parcel.apn}`} onDismiss={onDismiss} dismissLabel="Close parcel details">
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
    </BottomCard>
  );
}

const styles = StyleSheet.create({
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
