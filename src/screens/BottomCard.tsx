import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

interface BottomCardProps {
  title: string;
  onDismiss: () => void;
  /** Exact accessibility label for the close button — callers vary this (e.g. "Clear route" vs "Close parcel details") since dismissing means different things per card. */
  dismissLabel: string;
  children: ReactNode;
}

/**
 * Shared chrome for the bottom info panels (parcel/waypoint details, the
 * route panel) — same position, shadow, and header-with-close-button
 * pattern across all three, so it lived in one place instead of three
 * copies that could quietly drift apart.
 */
export function BottomCard({ title, onDismiss, dismissLabel, children }: BottomCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Pressable onPress={onDismiss} hitSlop={8} accessibilityLabel={dismissLabel}>
          <Text style={styles.close}>×</Text>
        </Pressable>
      </View>
      {children}
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
});
