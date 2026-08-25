import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { LocationPermissionStatus } from '../location/useUserLocation';

interface LocateButtonProps {
  status: LocationPermissionStatus;
  servicesEnabled: boolean;
  /** True while the camera is actively following the user's position. */
  following: boolean;
  onPress: () => void;
}

/**
 * Floating "locate me" control (spec §8, build-order step 4): recenters and
 * locks the camera onto the live GPS position. A ring-and-dot icon rather
 * than an icon-font glyph, since this project has no vector-icon dependency
 * and doesn't need one just for this.
 */
export function LocateButton({ status, servicesEnabled, following, onPress }: LocateButtonProps) {
  const active = status === 'granted' && following;
  const inactiveGranted = status === 'granted' && !following;

  const label =
    status !== 'granted'
      ? 'Enable location'
      : following
        ? 'Stop following my location'
        : 'Center on my location';

  return (
    <View style={styles.wrapper}>
      {status === 'denied' && (
        <Text style={styles.hint}>{servicesEnabled ? 'Location off' : 'GPS off'}</Text>
      )}
      <Pressable
        style={[styles.button, active && styles.buttonActive]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <View
          style={[
            styles.ring,
            inactiveGranted && styles.ringGranted,
            active && styles.ringActive,
          ]}
        >
          <View style={[styles.dot, inactiveGranted && styles.dotGranted, active && styles.dotActive]} />
        </View>
      </Pressable>
    </View>
  );
}

const RING_COLOR_DENIED = '#a39a89';
const RING_COLOR_GRANTED = '#3d3a34';
const RING_COLOR_ACTIVE = '#ffffff';

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    right: 16,
    bottom: 28,
    alignItems: 'flex-end',
  },
  hint: {
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
  buttonActive: {
    backgroundColor: '#4a6b3a',
  },
  ring: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: RING_COLOR_DENIED,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringGranted: {
    borderColor: RING_COLOR_GRANTED,
  },
  ringActive: {
    borderColor: RING_COLOR_ACTIVE,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: RING_COLOR_DENIED,
  },
  dotGranted: {
    backgroundColor: RING_COLOR_GRANTED,
  },
  dotActive: {
    backgroundColor: RING_COLOR_ACTIVE,
  },
});
