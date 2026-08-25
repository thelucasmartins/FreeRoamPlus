import {
  Camera,
  Map as MapLibreMap,
  useCurrentPosition,
  UserLocation,
  type StyleSpecification,
  type TrackUserLocationChangeEvent,
} from '@maplibre/maplibre-react-native';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View, type NativeSyntheticEvent } from 'react-native';

import { DEFAULT_ZOOM, FOLLOW_ZOOM, MAX_ZOOM, MIN_ZOOM, SONOMA_CENTER } from '../config';
import { useUserLocation } from '../location/useUserLocation';
import { ParcelsOverlay } from '../map/ParcelsOverlay';
import { RoadsOverlay } from '../map/RoadsOverlay';
import { StructuresOverlay } from '../map/StructuresOverlay';
import type { ParcelFeatureCollection, ParcelProperties } from '../overlays/parcelTypes';
import { loadParcels } from '../overlays/parcelsStore';
import { loadRoads } from '../overlays/roadsStore';
import type { ClassifiedRoadFeatureCollection } from '../overlays/roadTypes';
import { loadStructures } from '../overlays/structuresStore';
import type { StructureFeatureCollection } from '../overlays/types';
import { LayersPanel } from './LayersPanel';
import { LocateButton } from './LocateButton';
import { ParcelInfoCard } from './ParcelInfoCard';

interface MapScreenProps {
  /** Style JSON (offline) or style URL string (dev fallback). */
  mapStyle: StyleSpecification | string;
  /** Whether the style being shown is the offline one. */
  offline: boolean;
  /** file:// glyph template shared with the base style, if fonts are on-device. */
  glyphsUrl: string | null;
}

export function MapScreen({ mapStyle, offline, glyphsUrl }: MapScreenProps) {
  const { status: locationStatus, servicesEnabled, requestOrOpenSettings } = useUserLocation();
  const currentPosition = useCurrentPosition({ enabled: locationStatus === 'granted' });
  const [following, setFollowing] = useState(false);

  const [structures, setStructures] = useState<StructureFeatureCollection | null>(null);
  const [structuresIsSample, setStructuresIsSample] = useState(false);
  const [structuresVisible, setStructuresVisible] = useState(true);
  const [roads, setRoads] = useState<ClassifiedRoadFeatureCollection | null>(null);
  const [roadsIsSample, setRoadsIsSample] = useState(false);
  const [roadsVisible, setRoadsVisible] = useState(true);
  const [parcels, setParcels] = useState<ParcelFeatureCollection | null>(null);
  const [parcelsIsSample, setParcelsIsSample] = useState(false);
  const [parcelsVisible, setParcelsVisible] = useState(true);
  const [selectedParcel, setSelectedParcel] = useState<ParcelProperties | null>(null);

  useEffect(() => {
    loadStructures().then(({ data, isSample }) => {
      setStructures(data);
      setStructuresIsSample(isSample);
    });
    loadRoads().then(({ data, isSample }) => {
      setRoads(data);
      setRoadsIsSample(isSample);
    });
    loadParcels().then(({ data, isSample }) => {
      setParcels(data);
      setParcelsIsSample(isSample);
    });
  }, []);

  // Dragging/zooming the map by hand disengages follow mode natively, which
  // fires this — keep our button state in sync rather than fighting the user.
  const handleTrackUserLocationChange = useCallback(
    (event: NativeSyntheticEvent<TrackUserLocationChangeEvent>) => {
      setFollowing(event.nativeEvent.trackUserLocation != null);
    },
    [],
  );

  const handleLocatePress = useCallback(() => {
    if (locationStatus !== 'granted') {
      requestOrOpenSettings();
      return;
    }
    setFollowing((prev) => !prev);
  }, [locationStatus, requestOrOpenSettings]);

  const waitingForFix = locationStatus === 'granted' && !currentPosition;

  return (
    <View style={styles.container}>
      <MapLibreMap style={styles.map} mapStyle={mapStyle} onPress={() => setSelectedParcel(null)}>
        <Camera
          initialViewState={{
            center: SONOMA_CENTER,
            zoom: DEFAULT_ZOOM,
          }}
          minZoom={MIN_ZOOM}
          maxZoom={MAX_ZOOM}
          trackUserLocation={following ? 'heading' : undefined}
          zoom={following ? FOLLOW_ZOOM : undefined}
          onTrackUserLocationChange={handleTrackUserLocationChange}
        />
        {parcelsVisible && parcels && (
          <ParcelsOverlay data={parcels} onSelect={setSelectedParcel} />
        )}
        {roadsVisible && roads && <RoadsOverlay data={roads} />}
        {structuresVisible && structures && (
          <StructuresOverlay data={structures} glyphsUrl={glyphsUrl} />
        )}
        {locationStatus === 'granted' && <UserLocation accuracy heading />}
      </MapLibreMap>
      <LayersPanel
        structuresVisible={structuresVisible}
        onToggleStructures={setStructuresVisible}
        structuresIsSample={structuresIsSample}
        roadsVisible={roadsVisible}
        onToggleRoads={setRoadsVisible}
        roadsIsSample={roadsIsSample}
        parcelsVisible={parcelsVisible}
        onToggleParcels={setParcelsVisible}
        parcelsIsSample={parcelsIsSample}
      />
      <LocateButton
        status={locationStatus}
        servicesEnabled={servicesEnabled}
        following={following}
        onPress={handleLocatePress}
      />
      {waitingForFix && (
        <View style={styles.gpsBadge}>
          <Text style={styles.gpsBadgeText}>Acquiring GPS…</Text>
        </View>
      )}
      {!offline && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            Dev fallback style (online) — offline tiles not installed
          </Text>
        </View>
      )}
      {selectedParcel && (
        <ParcelInfoCard parcel={selectedParcel} onDismiss={() => setSelectedParcel(null)} />
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
  gpsBadge: {
    position: 'absolute',
    bottom: 28,
    alignSelf: 'center',
    backgroundColor: 'rgba(61, 58, 52, 0.85)',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  gpsBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
});
