import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { LocationPermissionStatus } from '../location/useUserLocation';
import { floatingControlStyles } from './floatingControlStyles';

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
        <Text style={floatingControlStyles.badge}>{servicesEnabled ? 'Location off' : 'GPS off'}</Text>
      )}
      <Pressable
        style={[floatingControlStyles.button, active && styles.buttonActive]}
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
