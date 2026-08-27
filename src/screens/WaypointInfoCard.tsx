import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import type { Waypoint } from '../waypoints/types';
import { BottomCard } from './BottomCard';

interface WaypointInfoCardProps {
  waypoint: Waypoint;
  onDismiss: () => void;
  /** Returns false if the delete failed to persist (e.g. full storage) — the card stays open with an inline error instead of closing. */
  onDelete: () => boolean;
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
  const [deleteFailed, setDeleteFailed] = useState(false);

  const handleDelete = () => {
    setDeleteFailed(!onDelete());
  };

  return (
    <BottomCard title="Waypoint" onDismiss={onDismiss} dismissLabel="Close waypoint details">
      <Text style={styles.note}>{waypoint.note || 'No note'}</Text>
      <Text style={styles.date}>Saved {formatDate(waypoint.createdAt)}</Text>

      {deleteFailed && (
        <Text style={styles.errorMessage}>Couldn’t delete waypoint — check available storage</Text>
      )}
      <Pressable style={styles.deleteButton} onPress={handleDelete}>
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
  errorMessage: {
    marginTop: 10,
    fontSize: 12,
    color: '#a02c2c',
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
