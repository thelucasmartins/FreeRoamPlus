import {
  Camera,
  Map as MapLibreMap,
  useCurrentPosition,
  UserLocation,
  type CameraRef,
  type PressEvent,
  type StyleSpecification,
  type TrackUserLocationChangeEvent,
} from '@maplibre/maplibre-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, type NativeSyntheticEvent } from 'react-native';

import { DEFAULT_ZOOM, FOLLOW_ZOOM, MAX_ZOOM, MIN_ZOOM, SONOMA_CENTER } from '../config';
import { loadDem } from '../elevation/demStore';
import { buildElevationProfile } from '../elevation/profile';
import type { ElevationGrid } from '../elevation/types';
import { useUserLocation } from '../location/useUserLocation';
import { ParcelsOverlay } from '../map/ParcelsOverlay';
import { RoadsOverlay } from '../map/RoadsOverlay';
import { RouteOverlay } from '../map/RouteOverlay';
import { StructuresOverlay } from '../map/StructuresOverlay';
import { WaypointsOverlay } from '../map/WaypointsOverlay';
import type { ParcelFeatureCollection, ParcelProperties } from '../overlays/parcelTypes';
import { loadParcels } from '../overlays/parcelsStore';
import { loadRoads } from '../overlays/roadsStore';
import type { ClassifiedRoadFeatureCollection } from '../overlays/roadTypes';
import { loadSearchIndex } from '../overlays/searchStore';
import type { SearchEntry, SearchIndex } from '../overlays/searchTypes';
import { loadStructures } from '../overlays/structuresStore';
import type { StructureFeatureCollection } from '../overlays/types';
import { buildRoutingGraph } from '../routing/graph';
import { computeRoute } from '../routing/router';
import type { Waypoint } from '../waypoints/types';
import { createWaypoint, loadWaypoints, saveWaypoints } from '../waypoints/waypointsStore';
import { LayersPanel } from './LayersPanel';
import { LocateButton } from './LocateButton';
import { ParcelInfoCard } from './ParcelInfoCard';
import { RoutePanel, type RouteRequestState } from './RoutePanel';
import { SearchBar } from './SearchBar';
import { WaypointInfoCard } from './WaypointInfoCard';

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
  const [searchIndexData, setSearchIndexData] = useState<SearchIndex>([]);
  const [searchIndexIsSample, setSearchIndexIsSample] = useState(false);

  const [routeState, setRouteState] = useState<RouteRequestState | null>(null);
  const [routeDestination, setRouteDestination] = useState<[number, number] | null>(null);
  const [demGrid, setDemGrid] = useState<ElevationGrid | null>(null);
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [selectedWaypoint, setSelectedWaypoint] = useState<Waypoint | null>(null);

  const cameraRef = useRef<CameraRef>(null);

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
    loadSearchIndex().then(({ index, isSample }) => {
      setSearchIndexData(index);
      setSearchIndexIsSample(isSample);
    });
    loadDem().then(({ grid }) => setDemGrid(grid));
    loadWaypoints().then(setWaypoints);
  }, []);

  // Recomputed only when the route or DEM grid changes — spec §13's grade
  // indicator, built from whatever route is currently shown. Null when
  // there's no result yet, or the route falls entirely outside DEM coverage.
  const elevationProfile = useMemo(() => {
    if (!demGrid || routeState?.kind !== 'result') return null;
    return buildElevationProfile(demGrid, routeState.route.onNetworkCoordinates);
  }, [demGrid, routeState]);

  // Rebuilt only when the classified road data changes, not on every
  // render/long-press — this is the "compiled local graph extract" spec §7
  // asks for, just built in-memory from the same data the Roads overlay
  // already renders, rather than a separate pipeline artifact (see
  // docs/DATA.md for why: no native Valhalla/GraphHopper module exists to
  // consume a real one in this environment).
  const routingGraph = useMemo(() => (roads ? buildRoutingGraph(roads) : null), [roads]);

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

  const clearTransientOverlays = useCallback(() => {
    setSelectedParcel(null);
    setSelectedWaypoint(null);
    setRouteState(null);
    setRouteDestination(null);
  }, []);

  const handleSelectParcel = useCallback((parcel: ParcelProperties) => {
    setSelectedParcel(parcel);
    setSelectedWaypoint(null);
    setRouteState(null);
    setRouteDestination(null);
  }, []);

  const handleSelectWaypoint = useCallback((waypoint: Waypoint) => {
    setSelectedWaypoint(waypoint);
    setSelectedParcel(null);
    setRouteState(null);
    setRouteDestination(null);
  }, []);

  const handleSaveWaypoint = useCallback(
    (note: string) => {
      if (!routeDestination) return;
      const waypoint = createWaypoint(routeDestination, note);
      const next = [...waypoints, waypoint];
      setWaypoints(next);
      saveWaypoints(next);
    },
    [routeDestination, waypoints],
  );

  const handleDeleteWaypoint = useCallback(
    (id: string) => {
      const next = waypoints.filter((w) => w.id !== id);
      setWaypoints(next);
      saveWaypoints(next);
      setSelectedWaypoint(null);
    },
    [waypoints],
  );

  // Shared by long-press and search-result selection — both are just
  // different ways of naming the same "route from here to this point"
  // request (spec §16).
  const requestRouteTo = useCallback(
    (destination: [number, number]) => {
      setSelectedParcel(null);
      setSelectedWaypoint(null);
      setRouteDestination(destination);

      if (locationStatus !== 'granted') {
        setRouteState({ kind: 'needs-location' });
        return;
      }
      if (!currentPosition) {
        setRouteState({ kind: 'waiting-for-fix' });
        return;
      }
      if (!routingGraph) {
        setRouteState({ kind: 'error', reason: 'no-graph-data' });
        return;
      }

      const origin: [number, number] = [
        currentPosition.coords.longitude,
        currentPosition.coords.latitude,
      ];
      const result = computeRoute(routingGraph, origin, destination);
      setRouteState(
        typeof result === 'string' ? { kind: 'error', reason: result } : { kind: 'result', route: result },
      );
    },
    [locationStatus, currentPosition, routingGraph],
  );

  // Long-press only — a regular tap must never start routing, so a rider
  // doesn't drop an accidental route mid-ride by brushing the screen.
  const handleLongPress = useCallback(
    (event: NativeSyntheticEvent<PressEvent>) => {
      requestRouteTo(event.nativeEvent.lngLat);
    },
    [requestRouteTo],
  );

  const handleSelectSearchResult = useCallback(
    (entry: SearchEntry) => {
      // A search result can be anywhere in the county, well outside the
      // current viewport — unlike long-press, where the user is already
      // looking at the point they held. Stop following the GPS position so
      // the camera move isn't immediately fought by trackUserLocation.
      setFollowing(false);
      cameraRef.current?.flyTo({ center: entry.coordinate, zoom: FOLLOW_ZOOM, duration: 1200 });
      requestRouteTo(entry.coordinate);
    },
    [requestRouteTo],
  );

  const waitingForFix = locationStatus === 'granted' && !currentPosition;

  return (
    <View style={styles.container}>
      <MapLibreMap
        style={styles.map}
        mapStyle={mapStyle}
        onPress={clearTransientOverlays}
        onLongPress={handleLongPress}
      >
        <Camera
          ref={cameraRef}
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
          <ParcelsOverlay data={parcels} onSelect={handleSelectParcel} />
        )}
        {roadsVisible && roads && <RoadsOverlay data={roads} />}
        {structuresVisible && structures && (
          <StructuresOverlay data={structures} glyphsUrl={glyphsUrl} />
        )}
        {waypoints.length > 0 && (
          <WaypointsOverlay waypoints={waypoints} onSelect={handleSelectWaypoint} />
        )}
        {locationStatus === 'granted' && <UserLocation accuracy heading />}
        {routeState?.kind === 'result' && routeDestination && (
          <RouteOverlay route={routeState.route} destination={routeDestination} />
        )}
      </MapLibreMap>
      <SearchBar
        index={searchIndexData}
        isSample={searchIndexIsSample}
        onSelect={handleSelectSearchResult}
      />
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
      {selectedWaypoint && (
        <WaypointInfoCard
          waypoint={selectedWaypoint}
          onDismiss={() => setSelectedWaypoint(null)}
          onDelete={() => handleDeleteWaypoint(selectedWaypoint.id)}
        />
      )}
      {routeState && routeDestination && (
        <RoutePanel
          state={routeState}
          destination={routeDestination}
          onDismiss={clearTransientOverlays}
          elevationProfile={elevationProfile}
          onSaveWaypoint={handleSaveWaypoint}
        />
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
    top: 72,
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
