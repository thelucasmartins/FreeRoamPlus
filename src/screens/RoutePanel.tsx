import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { ElevationProfile } from '../elevation/types';
import { compassLabel } from '../routing/geo';
import { formatDistance } from '../routing/formatting';
import type { RouteResult } from '../routing/router';
import { ElevationChart } from './ElevationChart';

export type RouteRequestState =
  | { kind: 'needs-location' }
  | { kind: 'waiting-for-fix' }
  | { kind: 'error'; reason: 'no-graph-data' | 'no-path-found' }
  | { kind: 'result'; route: RouteResult };

interface RoutePanelProps {
  state: RouteRequestState;
  /** The held/searched point this panel is about — used to key the waypoint-save UI to a fresh point. */
  destination: [number, number];
  onDismiss: () => void;
  /** Elevation profile for the current route, if a DEM grid covers it (spec §13). */
  elevationProfile: ElevationProfile | null;
  onSaveWaypoint: (note: string) => void;
}

const MESSAGES: Record<'needs-location' | 'waiting-for-fix', string> = {
  'needs-location': 'Enable location to route from your position',
  'waiting-for-fix': 'Waiting for a GPS fix before routing…',
};

const ERROR_MESSAGES: Record<'no-graph-data' | 'no-path-found', string> = {
  'no-graph-data': 'No road network loaded to route on',
  'no-path-found': 'No route found — that point isn’t reachable from here',
};

function formatFeet(meters: number): string {
  return `${Math.round(meters * 3.28084)} ft`;
}

/**
 * Bottom info panel for a long-press/search route request (spec §7, §16).
 * Reports either a normal route (plus an elevation/grade profile, spec
 * §13, when DEM coverage exists for it), an off-network leg on either end,
 * or why a route couldn't be produced — never fails silently. Also offers
 * saving the held point as a waypoint (spec §11), independent of whether a
 * route could be computed — you can still drop a pin somewhere with no GPS
 * fix or no road network loaded.
 */
export function RoutePanel({
  state,
  destination,
  onDismiss,
  elevationProfile,
  onSaveWaypoint,
}: RoutePanelProps) {
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [justSaved, setJustSaved] = useState(false);

  // A fresh long-press/search result means a fresh point — don't carry
  // save-in-progress state from whatever was held before.
  useEffect(() => {
    setEditingNote(false);
    setNoteDraft('');
    setJustSaved(false);
  }, [destination]);

  const handleSave = () => {
    onSaveWaypoint(noteDraft);
    setEditingNote(false);
    setJustSaved(true);
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>Route</Text>
        <Pressable onPress={onDismiss} hitSlop={8} accessibilityLabel="Clear route">
          <Text style={styles.close}>×</Text>
        </Pressable>
      </View>

      {(state.kind === 'needs-location' || state.kind === 'waiting-for-fix') && (
        <Text style={styles.message}>{MESSAGES[state.kind]}</Text>
      )}

      {state.kind === 'error' && (
        <Text style={styles.errorMessage}>{ERROR_MESSAGES[state.reason]}</Text>
      )}

      {state.kind === 'result' && (
        <>
          <View style={styles.row}>
            <Text style={styles.label}>Distance</Text>
            <Text style={styles.value}>{formatDistance(state.route.totalDistanceMeters)}</Text>
          </View>
          {state.route.startOffNetwork && (
            <Text style={styles.offNetworkNote}>
              Starts {formatDistance(state.route.startOffNetwork.distanceMeters)} off-network to
              the {compassLabel(state.route.startOffNetwork.bearingDegrees)}
            </Text>
          )}
          {state.route.endOffNetwork && (
            <Text style={styles.offNetworkNote}>
              Ends {formatDistance(state.route.endOffNetwork.distanceMeters)} off-network to the{' '}
              {compassLabel(state.route.endOffNetwork.bearingDegrees)} — no road, drivable path,
              or trail reaches this point
            </Text>
          )}

          {elevationProfile && (
            <View style={styles.elevationSection}>
              <ElevationChart profile={elevationProfile} />
              <View style={styles.elevationStats}>
                <Text style={styles.elevationStat}>↑ {formatFeet(elevationProfile.totalGainMeters)}</Text>
                <Text style={styles.elevationStat}>↓ {formatFeet(elevationProfile.totalLossMeters)}</Text>
                <Text style={styles.elevationStat}>
                  Max grade {elevationProfile.maxGradePercent.toFixed(0)}%
                </Text>
              </View>
            </View>
          )}
        </>
      )}

      <View style={styles.waypointSection}>
        {justSaved ? (
          <Text style={styles.savedNote}>Waypoint saved</Text>
        ) : editingNote ? (
          <View>
            <TextInput
              style={styles.noteInput}
              value={noteDraft}
              onChangeText={setNoteDraft}
              placeholder="Add a note (optional)"
              placeholderTextColor="#a39a89"
              autoFocus
              multiline
            />
            <View style={styles.noteActions}>
              <Pressable onPress={() => setEditingNote(false)}>
                <Text style={styles.noteCancel}>Cancel</Text>
              </Pressable>
              <Pressable onPress={handleSave}>
                <Text style={styles.noteSave}>Save</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable onPress={() => setEditingNote(true)}>
            <Text style={styles.saveWaypointLink}>+ Save waypoint here</Text>
          </Pressable>
        )}
      </View>
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
  message: {
    marginTop: 8,
    fontSize: 13,
    color: '#5d5347',
  },
  errorMessage: {
    marginTop: 8,
    fontSize: 13,
    color: '#a02c2c',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  label: {
    fontSize: 13,
    color: '#8a7a66',
  },
  value: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3d3a34',
  },
  offNetworkNote: {
    marginTop: 6,
    fontSize: 12,
    color: '#b5541c',
  },
  elevationSection: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ddd4c5',
  },
  elevationStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  elevationStat: {
    fontSize: 12,
    fontWeight: '600',
    color: '#5d5347',
  },
  waypointSection: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ddd4c5',
  },
  saveWaypointLink: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0f9b8e',
  },
  savedNote: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0f9b8e',
  },
  noteInput: {
    fontSize: 13,
    color: '#3d3a34',
    backgroundColor: '#f4f1ea',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 40,
  },
  noteActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 16,
    marginTop: 8,
  },
  noteCancel: {
    fontSize: 13,
    color: '#8a7a66',
  },
  noteSave: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f9b8e',
  },
});
