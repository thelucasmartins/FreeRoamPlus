import { Pressable, StyleSheet, Text, View } from 'react-native';

import { floatingControlStyles } from './floatingControlStyles';

interface BreadcrumbButtonProps {
  recording: boolean;
  hasPoints: boolean;
  onToggle: () => void;
  onClear: () => void;
}

/**
 * Breadcrumb trail control (spec §12): off by default, manually toggled on
 * to record, stoppable and clearable independently at any time — stopping
 * pauses recording without discarding the trail; clearing wipes it.
 */
export function BreadcrumbButton({ recording, hasPoints, onToggle, onClear }: BreadcrumbButtonProps) {
  const label = recording ? 'Stop recording breadcrumb trail' : 'Start recording breadcrumb trail';

  return (
    <View style={styles.wrapper}>
      {hasPoints && (
        <Pressable onPress={onClear} hitSlop={8} accessibilityLabel="Clear breadcrumb trail">
          <Text style={floatingControlStyles.badge}>Clear trail</Text>
        </Pressable>
      )}
      <Pressable
        style={[floatingControlStyles.button, recording && styles.buttonRecording]}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <View
          style={[
            styles.dot,
            recording && styles.dotRecording,
            !recording && hasPoints && styles.dotPaused,
          ]}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    right: 16,
    bottom: 86,
    alignItems: 'flex-end',
  },
  buttonRecording: {
    backgroundColor: '#a02c2c',
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#a39a89',
  },
  dotPaused: {
    borderColor: '#4a5c8a',
    backgroundColor: '#4a5c8a',
  },
  dotRecording: {
    borderColor: '#ffffff',
    backgroundColor: '#ffffff',
  },
});
