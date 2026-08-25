import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Waypoint } from '../waypoints/types';

interface WaypointInfoCardProps {
  waypoint: Waypoint;
  onDismiss: () => void;
  onDelete: () => void;
}

function formatDate(epochMs: number): string {
  return new Date(epochMs).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Info card for a saved waypoint (spec §11) — view its note, or delete it. */
export function WaypointInfoCard({ waypoint, onDismiss, onDelete }: WaypointInfoCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>Waypoint</Text>
        <Pressable onPress={onDismiss} hitSlop={8} accessibilityLabel="Close waypoint details">
          <Text style={styles.close}>×</Text>
        </Pressable>
      </View>

      <Text style={styles.note}>{waypoint.note || 'No note'}</Text>
      <Text style={styles.date}>Saved {formatDate(waypoint.createdAt)}</Text>

      <Pressable style={styles.deleteButton} onPress={onDelete}>
        <Text style={styles.deleteButtonText}>Delete waypoint</Text>
      </Pressable>
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
  title: {
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
  note: {
    marginTop: 10,
    fontSize: 14,
    color: '#3d3a34',
  },
  date: {
    marginTop: 6,
    fontSize: 12,
    color: '#8a7a66',
  },
  deleteButton: {
    marginTop: 12,
    alignSelf: 'flex-start',
  },
  deleteButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#a02c2c',
  },
});
