import { Pressable, StyleSheet, Text, View } from 'react-native';

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
          <Text style={styles.clearLink}>Clear trail</Text>
        </Pressable>
      )}
      <Pressable
        style={[styles.button, recording && styles.buttonRecording]}
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
  clearLink: {
    fontSize: 11,
    color: '#5d5347',
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 6,
    overflow: 'hidden',
  },
  button: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
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
