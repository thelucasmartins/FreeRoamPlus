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
import { RoadsOverlay } from '../map/RoadsOverlay';
import { StructuresOverlay } from '../map/StructuresOverlay';
import { loadRoads } from '../overlays/roadsStore';
import type { ClassifiedRoadFeatureCollection } from '../overlays/roadTypes';
import { loadStructures } from '../overlays/structuresStore';
import type { StructureFeatureCollection } from '../overlays/types';
import { LayersPanel } from './LayersPanel';

interface MapScreenProps {
  /** Style JSON (offline) or style URL string (dev fallback). */
  mapStyle: StyleSpecification | string;
  /** Whether the style being shown is the offline one. */
  offline: boolean;
  /** file:// glyph template shared with the base style, if fonts are on-device. */
  glyphsUrl: string | null;
}

export function MapScreen({ mapStyle, offline, glyphsUrl }: MapScreenProps) {
  const [locationGranted, setLocationGranted] = useState(false);
  const [structures, setStructures] = useState<StructureFeatureCollection | null>(null);
  const [structuresIsSample, setStructuresIsSample] = useState(false);
  const [structuresVisible, setStructuresVisible] = useState(true);
  const [roads, setRoads] = useState<ClassifiedRoadFeatureCollection | null>(null);
  const [roadsIsSample, setRoadsIsSample] = useState(false);
  const [roadsVisible, setRoadsVisible] = useState(true);

  useEffect(() => {
    // GPS works fully offline (spec §8); ask once so the position dot can show.
    Location.requestForegroundPermissionsAsync()
      .then(({ status }) => setLocationGranted(status === 'granted'))
      .catch(() => setLocationGranted(false));
  }, []);

  useEffect(() => {
    loadStructures().then(({ data, isSample }) => {
      setStructures(data);
      setStructuresIsSample(isSample);
    });
    loadRoads().then(({ data, isSample }) => {
      setRoads(data);
      setRoadsIsSample(isSample);
    });
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
        {roadsVisible && roads && <RoadsOverlay data={roads} />}
        {structuresVisible && structures && (
          <StructuresOverlay data={structures} glyphsUrl={glyphsUrl} />
        )}
        {locationGranted && <UserLocation accuracy heading />}
      </MapLibreMap>
      <LayersPanel
        structuresVisible={structuresVisible}
        onToggleStructures={setStructuresVisible}
        structuresIsSample={structuresIsSample}
        roadsVisible={roadsVisible}
        onToggleRoads={setRoadsVisible}
        roadsIsSample={roadsIsSample}
      />
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
