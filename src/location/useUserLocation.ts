import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';
import { Linking } from 'react-native';

export type LocationPermissionStatus = 'checking' | 'granted' | 'denied';

export interface UseUserLocationResult {
  status: LocationPermissionStatus;
  /** False when the OS reports device-wide location services are off. */
  servicesEnabled: boolean;
  /**
   * Re-request the permission prompt, or — if the OS won't show it again
   * (already denied once) — open system Settings so the user can flip it
   * themselves. Either way this only runs on an explicit tap, never silently.
   */
  requestOrOpenSettings: () => void;
}

/**
 * GPS works fully offline (spec §8): this only manages the foreground
 * location permission, no network involved. Requests once on mount so the
 * live position dot can show as soon as possible.
 */
export function useUserLocation(): UseUserLocationResult {
  const [status, setStatus] = useState<LocationPermissionStatus>('checking');
  const [canAskAgain, setCanAskAgain] = useState(true);
  const [servicesEnabled, setServicesEnabled] = useState(true);

  const applyResponse = useCallback((response: Location.PermissionResponse) => {
    setCanAskAgain(response.canAskAgain);
    setStatus(response.status === Location.PermissionStatus.GRANTED ? 'granted' : 'denied');
  }, []);

  useEffect(() => {
    Location.requestForegroundPermissionsAsync().then(applyResponse).catch(() => setStatus('denied'));
    Location.hasServicesEnabledAsync().then(setServicesEnabled).catch(() => {});
  }, [applyResponse]);

  const requestOrOpenSettings = useCallback(() => {
    if (canAskAgain) {
      Location.requestForegroundPermissionsAsync().then(applyResponse).catch(() => {});
    } else {
      Linking.openSettings();
    }
  }, [canAskAgain, applyResponse]);

  return { status, servicesEnabled, requestOrOpenSettings };
}
