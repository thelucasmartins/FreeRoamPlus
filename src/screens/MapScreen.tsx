import {
  Camera,
  Map as MapLibreMap,
  type StyleSpecification,
  UserLocation,
} from '@maplibre/maplibre-react-native';
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { DEFAULT_ZOOM, MAX_ZOOM, MIN_ZOOM, SONOMA_CENTER } from '../config';

interface MapScreenProps {
  /** Style JSON (offline) or style URL string (dev fallback). */
  mapStyle: StyleSpecification | string;
  /** Whether the style being shown is the offline one. */
  offline: boolean;
}

export function MapScreen({ mapStyle, offline }: MapScreenProps) {
  const [locationGranted, setLocationGranted] = useState(false);

  useEffect(() => {
    // GPS works fully offline (spec §8); ask once so the position dot can show.
    Location.requestForegroundPermissionsAsync()
      .then(({ status }) => setLocationGranted(status === 'granted'))
      .catch(() => setLocationGranted(false));
  }, []);

  return (
    <View style={styles.container}>
      <MapLibreMap style={styles.map} mapStyle={mapStyle}>
        <Camera
          initialViewState={{
            center: SONOMA_CENTER,
            zoom: DEFAULT_ZOOM,
          }}
          minZoom={MIN_ZOOM}
          maxZoom={MAX_ZOOM}
        />
        {locationGranted && <UserLocation accuracy heading />}
      </MapLibreMap>
      {!offline && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            Dev fallback style (online) — offline tiles not installed
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  banner: {
    position: 'absolute',
    top: 60,
    alignSelf: 'center',
    backgroundColor: '#b5541c',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  bannerText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
});
