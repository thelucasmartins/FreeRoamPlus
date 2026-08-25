import { Pressable, StyleSheet, Text } from 'react-native';

import type { Waypoint } from '../waypoints/types';
import { BottomCard } from './BottomCard';

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
    <BottomCard title="Waypoint" onDismiss={onDismiss} dismissLabel="Close waypoint details">
      <Text style={styles.note}>{waypoint.note || 'No note'}</Text>
      <Text style={styles.date}>Saved {formatDate(waypoint.createdAt)}</Text>

      <Pressable style={styles.deleteButton} onPress={onDelete}>
        <Text style={styles.deleteButtonText}>Delete waypoint</Text>
      </Pressable>
    </BottomCard>
  );
}

const styles = StyleSheet.create({
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
